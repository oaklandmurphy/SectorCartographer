// Asymmetric-information visibility model.
//
// The old single "edit code" is now the GM code. Whoever knows it is the admin
// (full edit, sees everything, manages players). Players sign in with a per-role
// password and get a *view-only, filtered* map — only public content plus what
// the GM has shared with their role. Anyone with just the link and no code is an
// anonymous viewer who sees only public content.
//
// Like the edit lock this is a UI-level filter, not real security — the raw data
// still lives in a world-readable Firebase path. It keeps honest players in
// character; it won't stop someone who reads the database directly.
//
// An item's `visibility` field (used on codex/wiki entries and on carriers —
// a carrier's squadrons have no visibility of their own, they follow their hull):
//   undefined / null  -> public: visible to everyone, including anonymous viewers
//   string[]          -> restricted: only these role ids (plus the GM) can see it
//   []                -> GM-only: no player role can see it
export function resolveViewer(knownCode, lockCode, roles) {
  // Knows the GM code: the admin.
  if (lockCode && knownCode && knownCode === lockCode) {
    return { kind: "admin", seesAll: true, roleId: null, roleName: null };
  }
  // A matching player code must win even before a GM lock is configured. That
  // keeps the legacy open editor available to everyone else, while allowing a
  // campaign to test faction-scoped views (including Updates) during setup.
  const role = knownCode ? (roles || []).find((r) => r.password && r.password === knownCode) : null;
  if (role) {
    return { kind: "player", seesAll: false, roleId: role.id, roleName: role.name,
      roleFactionId: role.factionId || null, canMoveAgents: !!role.canMoveAgents };
  }
  // No GM code set yet: legacy "open" mode — anyone without a player code can
  // still edit and see everything.
  if (!lockCode) return { kind: "open", seesAll: true, roleId: null, roleName: null, roleFactionId: null };
  // Just the link, no code: anonymous viewer.
  return { kind: "anon", seesAll: false, roleId: null, roleName: null, roleFactionId: null };
}

// Can this viewer see this item, given its `visibility` field?
export function canSee(item, viewer) {
  if (viewer.seesAll) return true;                 // GM / open mode see everything
  const vis = item && item.visibility;
  if (vis == null) return true;                    // public
  if (!Array.isArray(vis)) return true;            // malformed -> fail open to public
  if (viewer.roleId == null) return false;         // anonymous can't see restricted items
  return vis.includes(viewer.roleId);              // player: only if shared with their role
}

// True when the item has been restricted away from "public".
export function isRestricted(item) {
  return Array.isArray(item && item.visibility);
}

// A codex entry not yet cleared for players sits behind this gate:
//   "pending"  — a player submission awaiting GM review, seen only by the GM
//                and the player who submitted it, so it doesn't leak into the
//                public codex before review.
//   "draft"    — a GM-authored page not yet published (no submitter), seen only
//                by the GM until they hit Publish.
// Absent status (every pre-existing entry) or "approved" is a normal live entry,
// gated only by `canSee` above.
export function canSeeSubmission(item, viewer) {
  if (viewer.seesAll) return true;
  const status = item && item.status;
  if (!status || status === "approved") return true;
  // A GM draft has no submitter, so this correctly hides it from every player;
  // a pending submission is visible to its own submitter.
  return viewer.roleId != null && !!item.submittedBy && item.submittedBy.roleId === viewer.roleId;
}

/* ------------------------------------------------ fleet-position visibility

   Separate from the per-carrier `visibility` above: this gates whole *fleet
   positions* on the map by faction, so a player logged into a faction sees where
   its own — and its allies'/vassals' — fleets are, and not the enemy's. */

// The faction ids whose fleet positions a given faction is allowed to see: itself,
// plus any faction joined to it by an alliance or vassal edge (either direction).
export function friendlyFactionIds(factionId, relations) {
  const ids = new Set();
  if (!factionId) return ids;
  ids.add(factionId);
  for (const r of relations || []) {
    if (r.type !== "alliance" && r.type !== "vassal") continue;
    if (r.a === factionId) ids.add(r.b);
    else if (r.b === factionId) ids.add(r.a);
  }
  return ids;
}

// A fleet counts as "public" — shown to anyone when positions aren't hidden — if
// it has no carriers yet, or at least one carrier is itself public. This matches
// the pre-faction rule so nothing already visible to viewers disappears.
export function isPublicFleet(fleet) {
  const ships = (fleet && fleet.ships) || [];
  if (ships.length === 0) return true;
  return ships.some((sh) => !Array.isArray(sh.visibility));
}

// The fleets a non-GM viewer renders (map + roster), each trimmed to the carriers
// that viewer may see. A fleet's *position* shows when any of these grant it:
//   - faction: the viewer is a player whose faction (own/ally/vassal) owns it;
//   - explicit share: a carrier is restricted to a role list that names the viewer
//     (a deliberate GM share — distinct from a merely public carrier);
//   - public: it's a public fleet and the GM hasn't hidden fleets from the public.
// `fleetsPublic` false is the GM's "game has started" switch: it drops the public
// grant, so only signed-in players with a matching faction (or an explicit carrier
// share) can see any fleet at all. Note a carrier being *public* does not by itself
// grant the position when fleets are hidden — that is exactly what the switch hides.
export function visibleFleets(fleets, viewer, { relations, fleetsPublic }) {
  if (viewer.seesAll) return fleets;
  const friendly = viewer.roleFactionId ? friendlyFactionIds(viewer.roleFactionId, relations) : null;
  const out = [];
  for (const f of fleets || []) {
    const ships = (f.ships || []).filter((sh) => canSee(sh, viewer));
    const factionGrant = !!(friendly && f.factionId && friendly.has(f.factionId));
    const explicitShare = viewer.roleId != null && (f.ships || []).some(
      (sh) => Array.isArray(sh.visibility) && sh.visibility.includes(viewer.roleId));
    const publicGrant = fleetsPublic !== false && isPublicFleet(f);
    if (!factionGrant && !explicitShare && !publicGrant) continue;
    // factionGrant/explicitShare only prove the *fleet* is theirs to see, not that
    // any individual carrier is. If every carrier got filtered out by canSee above
    // (all hidden from this viewer) while the fleet actually has carriers, the whole
    // fleet position must disappear too — otherwise players see an empty marker
    // where a fully-hidden fleet is sitting, defeating per-carrier hiding.
    const hadShips = (f.ships || []).length > 0;
    if (hadShips && ships.length === 0) continue;
    out.push({ ...f, ships });
  }
  return out;
}

/* ------------------------------------------------ agents & move orders

   Both are strictly own-faction, unlike fleets: an agent is a covert operative,
   so even an ally never sees it — only the owning faction's players and the GM.
   Move orders are the same, and are player *proposals* the GM resolves by hand;
   a player only ever sees their own faction's, committed or still being drafted. */

// The agents a non-GM viewer renders on the map and the Agents page: only their
// own faction's. Anonymous viewers (no faction) see none.
export function visibleAgents(agents, viewer) {
  if (viewer.seesAll) return agents || [];
  if (!viewer.roleFactionId) return [];
  return (agents || []).filter((a) => a.factionId === viewer.roleFactionId);
}

// The move orders a non-GM viewer renders: only their own faction's. The GM sees
// every faction's, which is how they resolve committed movement.
export function visibleOrders(orders, viewer) {
  if (viewer.seesAll) return orders || [];
  if (!viewer.roleFactionId) return [];
  return (orders || []).filter((o) => o.factionId === viewer.roleFactionId);
}

// Agent action requests a non-GM viewer renders on the Agents page: only their
// own faction's, same rule as the agents that raise them. The GM sees every
// faction's, which is how they collect and resolve them in GM Tools.
export function visibleActions(actions, viewer) {
  if (viewer.seesAll) return actions || [];
  if (!viewer.roleFactionId) return [];
  return (actions || []).filter((a) => a.factionId === viewer.roleFactionId);
}

// Squadron mission requests a non-GM viewer renders on the Fleet tab: only
// their own faction's, same rule as an agent's action requests. The GM sees
// every faction's, which is how they collect and resolve them in GM Tools.
export function visibleMissions(missions, viewer) {
  if (viewer.seesAll) return missions || [];
  if (!viewer.roleFactionId) return [];
  return (missions || []).filter((m) => m.factionId === viewer.roleFactionId);
}

// Short human summary of an item's visibility, for the GM's editing UI.
export function visibilitySummary(item, roles) {
  const vis = item && item.visibility;
  if (!Array.isArray(vis)) return "Everyone";
  if (vis.length === 0) return "GM only";
  const names = vis
    .map((id) => (roles.find((r) => r.id === id) || {}).name)
    .filter(Boolean);
  if (names.length === 0) return "GM only";
  return names.join(", ");
}
