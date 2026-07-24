// Shape of a sector in the Realtime Database, and the codecs that get it there.
//
// The app thinks in arrays of entities ({ id, ... }); the database stores each
// collection as children keyed by entity id, so one edit writes one node instead
// of re-uploading the whole sector. Everything that survives that translation
// badly is handled here, in one place, rather than being spread through the UI:
//
//   order       RTDB returns children in key order, and our ids sort wrong
//               (fac_10 before fac_2). Insertion order rides along as `_ord`.
//   empty lists RTDB does not store empty arrays or objects — a node with no
//               leaves simply doesn't exist. Reads restore them from `defaults`.
//   visibility  `[]` (GM-only) and absent (public) mean opposite things, and an
//               empty array does not survive the trip. See encodeVisibility.
// v3 split a fleet's ships out into their own collection (see flattenFleets/
// nestFleets below) so editing one carrier no longer rewrites every other
// carrier in its fleet. A schema-2 sector (ships still embedded in
// fleets/{id}/ships) is read via the decodeV2Fleets compatibility path in
// sectorRepo.js and migrates to v3 in place on its first save after that,
// same as v1->v2 before it.
export const SCHEMA_VERSION = 3;

// Legacy v1 keys: the whole sector as one JSON string per key. Still read as a
// fallback (see sectorRepo.loadSector) so a browser that has not seen the new
// tree yet, or a sector nobody has migrated, keeps working.
export const V1_STATE_KEY = "galaxy-sector-state:v1";
export const V1_ART_KEY = "galaxy-sector-art:v1";
export const V1_ACCESS_KEY = "galaxy-sector-access:v1";

// The collections that make up a sector, each a child of sectors/{id}/.
// Art is one of them now; under v1 it needed its own key to keep SVGs from
// being re-uploaded on every keystroke, which per-entity writes solve for free.
// "ships" holds the carriers that used to be embedded on each fleet as
// fleets/{id}/ships — see flattenFleets/nestFleets below. Every other consumer
// in the app still sees them nested at sector.fleets[].ships[] exactly as
// before; only sectorSchema.js and sectorRepo.js know the DB stores them apart.
export const COLLECTIONS = [
  "factions", "relations", "layers", "systems",
  "links", "fleets", "ships", "strokes", "wiki", "wikiReads", "roles", "art", "modifiers",
  "agents", "orders", "actions", "missions",
];

// GM Tools notes live at their own top-level path (sectorNotes/{sectorId}, see
// sectorRepo.js) rather than under sectors/{id} — they're the one collection
// nobody but the GM ever reads, so keeping them out of the root subtree means
// a listener at sectors/{id} never has to carry them past every player and
// anonymous viewer on every load. Still just another collection as far as
// encode/decode/diff are concerned.
export const NOTES_COLLECTION = "notes";

// Fields RTDB will not give back as stored: empty arrays vanish, and explicit
// nulls come back undefined. Reads merge these in so callers can keep doing
// `s.markers.map(...)` without a guard at every site.
const defaults = {
  factions: { members: [], wikiId: null },
  systems: { markers: [], factionId: "fac_none" },
  fleets: { systemId: null },
  strokes: { pts: [] },
  wiki: { body: "", title: "", factionId: null },
  agents: { memberId: null, notes: "", systemId: null, actionCap: 0, icon: null, x: 0, y: 0 },
  orders: { path: [], committed: false },
  actions: { modifierIds: [], text: "", status: "pending", resolution: null },
  missions: { detachments: [], text: "", status: "pending", resolution: null },
  relations: {}, layers: {}, links: {}, wikiReads: {}, roles: {}, art: {}, modifiers: {}, notes: { text: "" }, ships: {},
};

/* ------------------------------------------------ visibility

   The one field where "empty" and "absent" are not the same thing:

     absent  -> public, visible to anonymous viewers
     []      -> GM-only
     [ids]   -> those roles only

   Stored raw, `[]` would be dropped by RTDB and read back as absent — turning
   every GM-only secret public. So a restricted item is stored as an object with
   a `restricted: true` leaf to hold the node in existence, and its roles as a
   set. `{ roles: {} }` alone would not survive: an object with no leaves is
   nothing to RTDB, which is exactly the bug being avoided. */
export function encodeVisibility(vis) {
  if (!Array.isArray(vis)) return null; // public — RTDB drops the field
  const roles = {};
  for (const id of vis) roles[id] = true;
  return vis.length ? { restricted: true, roles } : { restricted: true };
}

export function decodeVisibility(v) {
  if (!v || v.restricted !== true) return undefined; // public
  return Object.keys(v.roles || {}); // [] here is GM-only, and stays that way
}

// `undefined` tells RTDB "leave this out"; it rejects it inside update() payloads,
// so drop the key entirely instead of writing it.
function omitUndefined(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) if (v !== undefined) out[k] = v;
  return out;
}

// Attach/strip visibility, which lives on wiki entries and on carriers.
const withVis = (item) => {
  const vis = encodeVisibility(item.visibility);
  const rest = omitUndefined({ ...item, visibility: undefined });
  return vis ? { ...rest, visibility: vis } : rest;
};
const readVis = (raw) => {
  const vis = decodeVisibility(raw.visibility);
  const out = omitUndefined({ ...raw, visibility: undefined });
  return vis === undefined ? out : { ...out, visibility: vis };
};

// RTDB round-trips a contiguous array as an array, but an empty one as nothing,
// and a sparse one as an object with numeric keys. Normalize both back.
const asArray = (v) => (Array.isArray(v) ? v : v && typeof v === "object" ? Object.values(v) : []);

/* ------------------------------------------------ per-collection codecs

   Only collections with nested lists or visibility need one; the rest are flat
   and round-trip as themselves. */
const codecs = {
  // A carrier: visibility (GM-only/role-restricted, same as a wiki entry) plus
  // its squadrons list, same empty-array/sparse-object treatment as everywhere
  // else. `fleetId` (which fleet it belongs to) rides along as a plain field —
  // see flattenFleets/nestFleets, which is the only code that reads it.
  ships: {
    encode: (s) => withVis({ ...s, squadrons: s.squadrons || [] }),
    decode: (s) => ({ ...readVis(s), squadrons: asArray(s.squadrons) }),
  },
  systems: {
    encode: (s) => ({ ...s, markers: s.markers || [] }),
    decode: (s) => ({ ...s, markers: asArray(s.markers) }),
  },
  factions: {
    encode: (f) => ({ ...f, members: f.members || [] }),
    decode: (f) => ({ ...f, members: asArray(f.members) }),
  },
  strokes: {
    encode: (s) => ({ ...s, pts: s.pts || [] }),
    decode: (s) => ({ ...s, pts: asArray(s.pts) }),
  },
  // A move order's `path` is a list of system ids; RTDB drops an empty one and
  // returns a sparse one as a numeric-keyed object, so normalize it back — same
  // treatment as a stroke's points.
  orders: {
    encode: (o) => ({ ...o, path: o.path || [] }),
    decode: (o) => ({ ...o, path: asArray(o.path) }),
  },
  // An action request's `modifierIds` is a list of the modifier ids the player
  // flagged as bearing on the outcome; like a stroke's points or an order's path,
  // RTDB drops an empty one and hands a sparse one back as a numeric-keyed object.
  // A resolved request also carries a `resolution` object whose own `mods` list
  // (the named modifiers the GM applied, with values) needs the same treatment.
  actions: {
    encode: (a) => ({
      ...a,
      modifierIds: a.modifierIds || [],
      ...(a.resolution && typeof a.resolution === "object"
        ? { resolution: { ...a.resolution, mods: a.resolution.mods || [] } } : {}),
    }),
    decode: (a) => ({
      ...a,
      modifierIds: asArray(a.modifierIds),
      ...(a.resolution && typeof a.resolution === "object"
        ? { resolution: { ...a.resolution, mods: asArray(a.resolution.mods) } } : {}),
    }),
  },
  wiki: { encode: withVis, decode: readVis },
  // A squadron mission's `detachments` is the list of committed craft ({ shipId,
  // squadronId, model, count }) snapshotted off their source squadrons at submit
  // time — same empty-array/sparse-object treatment as an action's modifierIds.
  missions: {
    encode: (m) => ({ ...m, detachments: m.detachments || [] }),
    decode: (m) => ({ ...m, detachments: asArray(m.detachments) }),
  },
};

// One entity -> the object stored at sectors/{id}/{collection}/{entityId}.
export function encodeEntity(collection, item, ord) {
  const codec = codecs[collection];
  const base = codec ? codec.encode(item) : { ...item };
  return { ...omitUndefined(base), _ord: ord };
}

// ...and back. `_ord` is plumbing and never reaches the UI.
export function decodeEntity(collection, raw) {
  const codec = codecs[collection];
  const { _ord, ...rest } = raw;
  const base = codec ? codec.decode(rest) : rest;
  return { ...defaults[collection], ...base };
}

// A whole collection node -> the ordered array the app expects. Entities written
// before `_ord` existed, or by a client that dropped it, sort last but keep a
// stable order among themselves rather than disappearing.
export function decodeCollection(collection, node) {
  if (!node || typeof node !== "object") return [];
  return Object.entries(node)
    .map(([id, raw], i) => ({
      id,
      raw: raw && typeof raw === "object" ? raw : {},
      ord: raw && typeof raw._ord === "number" ? raw._ord : Number.MAX_SAFE_INTEGER,
      i,
    }))
    .sort((a, b) => a.ord - b.ord || a.i - b.i)
    .map(({ id, raw }) => decodeEntity(collection, { ...raw, id: raw.id || id }));
}

export function encodeCollection(collection, list) {
  const out = {};
  (list || []).forEach((item, i) => { out[item.id] = encodeEntity(collection, item, i); });
  return out;
}

/* ------------------------------------------------ fleets <-> ships split

   The app thinks in sector.fleets[].ships[], same as it always has — these two
   functions are the only place that knows the database keeps ships apart, so
   nothing above this file (App.jsx, every component) had to change for it.
   flattenFleets runs right before a diff/encode; nestFleets runs right after a
   decode. Both are plain data transforms, safe to call as often as needed. */
export function flattenFleets(sector) {
  const ships = [];
  const fleets = (sector.fleets || []).map((f) => {
    const { ships: fShips, ...meta } = f;
    (fShips || []).forEach((s) => ships.push({ ...s, fleetId: f.id }));
    return meta;
  });
  return { ...sector, fleets, ships };
}

export function nestFleets(sector) {
  const byFleet = new Map();
  for (const s of sector.ships || []) {
    const { fleetId, ...rest } = s;
    if (!byFleet.has(fleetId)) byFleet.set(fleetId, []);
    byFleet.get(fleetId).push(rest);
  }
  const { ships, ...rest } = sector;
  const fleets = (sector.fleets || []).map((f) => ({ ...f, ships: byFleet.get(f.id) || [] }));
  return { ...rest, fleets };
}

// Schema-2 compatibility only: before v3, a fleet carried its ships embedded
// at fleets/{id}/ships (a plain array, encoded/decoded by what was then the
// fleets codec) and no separate ships collection existed. Used by
// sectorRepo.js to read a sector that hasn't been through the v3 migration
// yet — it migrates to the split shape in place on its first save after that,
// same as v1->v2 before it (see decode() there).
export function decodeV2Fleets(rawFleetsNode) {
  if (!rawFleetsNode || typeof rawFleetsNode !== "object") return [];
  return Object.entries(rawFleetsNode)
    .map(([id, raw], i) => ({
      id,
      raw: raw && typeof raw === "object" ? raw : {},
      ord: raw && typeof raw._ord === "number" ? raw._ord : Number.MAX_SAFE_INTEGER,
      i,
    }))
    .sort((a, b) => a.ord - b.ord || a.i - b.i)
    .map(({ id, raw }) => {
      const { _ord, ships, id: rawId, ...rest } = raw;
      return {
        systemId: null,
        ...rest,
        id: rawId || id,
        ships: asArray(ships).map((s) => ({ ...readVis(s), squadrons: asArray(s.squadrons) })),
      };
    });
}

/* ------------------------------------------------ diffing

   Kept here, next to the encoders and free of any Firebase import, so both the
   app and the one-shot migration script can use it — and so it can be tested
   without a database. */
// A sector snapshot is every collection plus the edit-lock code. The lock rides
// in the same snapshot as the content — and so through the same diff — because
// when it had a write path of its own it was possible to migrate a sector's
// entities without its lock, which reads as "no lock set", which means open to
// everyone. One path in means the lock cannot be left behind.
export const emptySector = () =>
  COLLECTIONS.reduce((acc, c) => ({ ...acc, [c]: [] }), { lockCode: "", fleetsPublic: true });

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b || a === null || b === null) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  return ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && deepEqual(a[k], b[k]));
}

// One collection's slice of a multi-path update: entities are compared as
// stored, so an untouched one costs nothing; a reordered one writes just its
// `_ord` rather than the whole node, which keeps a delete near the top of a long
// list from rewriting every entity below it. Shared by buildSectorUpdates (the
// COLLECTIONS loop) and buildCollectionUpdates (notes, diffed on its own since
// it lives at its own path — see sectorRepo.js).
function diffCollectionInto(updates, collection, prevList, nextList) {
  const before = encodeCollection(collection, prevList);
  const after = encodeCollection(collection, nextList);
  for (const [id, node] of Object.entries(after)) {
    const was = before[id];
    if (!was) { updates[`${collection}/${id}`] = node; continue; }
    const { _ord: wasOrd, ...wasRest } = was;
    const { _ord: nowOrd, ...nowRest } = node;
    if (!deepEqual(wasRest, nowRest)) updates[`${collection}/${id}`] = node;
    else if (wasOrd !== nowOrd) updates[`${collection}/${id}/_ord`] = nowOrd;
  }
  for (const id of Object.keys(before)) if (!after[id]) updates[`${collection}/${id}`] = null;
}

// The multi-path update that turns `prev` into `next`. Both are flattened
// first — callers (App.jsx, sectorRepo.js, the migration scripts) always deal
// in sector.fleets[].ships[]; this is the one place that splits it into the
// fleets/ships collections actually diffed and written.
export function buildSectorUpdates(prev, next) {
  const p = flattenFleets(prev), n = flattenFleets(next);
  const updates = {};
  for (const c of COLLECTIONS) diffCollectionInto(updates, c, p[c], n[c]);
  // Its own node, so setting the lock never rewrites sector content — but still
  // diffed here, so migrating a sector always carries its lock across.
  if ((p.lockCode || "") !== (n.lockCode || "")) updates["access/lockCode"] = n.lockCode || "";
  // Whether fleet positions are public. Absent means the default, true, so we
  // compare normalized and only write the exception (false) or a return to true.
  const pubBefore = p.fleetsPublic !== false;
  const pubAfter = n.fleetsPublic !== false;
  if (pubBefore !== pubAfter) updates["access/fleetsPublic"] = pubAfter;
  return updates;
}

// Same idea for a single collection that lives at its own root (just notes,
// today) rather than under sectors/{id} alongside the rest.
export function buildCollectionUpdates(collection, prevList, nextList) {
  const updates = {};
  diffCollectionInto(updates, collection, prevList, nextList);
  return updates;
}
