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
  // No GM code set yet: legacy "open" mode — everyone edits and sees everything.
  if (!lockCode) return { kind: "open", seesAll: true, roleId: null, roleName: null };
  // Knows the GM code: the admin.
  if (knownCode && knownCode === lockCode) {
    return { kind: "admin", seesAll: true, roleId: null, roleName: null };
  }
  // Knows a player role's password: that player.
  const role = knownCode ? (roles || []).find((r) => r.password && r.password === knownCode) : null;
  if (role) return { kind: "player", seesAll: false, roleId: role.id, roleName: role.name };
  // Just the link, no code: anonymous viewer.
  return { kind: "anon", seesAll: false, roleId: null, roleName: null };
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
