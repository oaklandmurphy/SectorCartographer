// Reading and writing the shared sector.
//
// Under v1 the entire sector was a single JSON string at one key, so changing a
// squadron count re-uploaded every system, link and codex entry — ~33KB per
// keystroke — and two GMs editing different things clobbered each other wholesale.
// Here each entity is its own node, and a save writes only what actually changed.
//
// The app above this layer still deals in plain arrays; the array/tree translation
// (and everything RTDB mangles on the way) lives in sectorSchema.js.
import { ref, get as dbGet, onValue, update as dbUpdate } from "firebase/database";
import { db, firebaseReady, authReady } from "./firebase.js";
import {
  SCHEMA_VERSION, COLLECTIONS, V1_STATE_KEY, V1_ART_KEY, V1_ACCESS_KEY, NOTES_COLLECTION,
  decodeCollection, decodeV2Fleets, nestFleets, emptySector, buildSectorUpdates, buildCollectionUpdates,
} from "./sectorSchema.js";

export { emptySector };

// One Firebase project can host several independent sector maps
// (e.g. https://yoursite.com/?sector=campaign-two) without extra setup.
const params = new URLSearchParams(window.location.search);
export const SECTOR_ID = (params.get("sector") || "default").replace(/[.#$/[\]]/g, "-");

const root = () => `sectors/${SECTOR_ID}`;
// Notes live outside the sector tree entirely (see sectorSchema.js) so a
// listener at root() never has to carry them — subscribeNotes below only
// attaches once GM Tools is actually opened.
const notesRoot = () => `sectorNotes/${SECTOR_ID}`;

/* ------------------------------------------------ reading */

// v1: every collection packed into one JSON string, art and lock code in two more.
function fromV1(raw) {
  const data = emptySector();
  try {
    const d = JSON.parse(raw[V1_STATE_KEY] || "{}");
    for (const c of COLLECTIONS) if (Array.isArray(d[c])) data[c] = d[c];
  } catch (e) {
    // Unparseable blob — better an empty sector the GM can see is empty than a
    // half-read one they might save over.
    console.warn("[sector] could not parse the v1 state blob; starting empty", e);
  }
  try {
    const a = JSON.parse(raw[V1_ART_KEY] || "[]");
    if (Array.isArray(a)) data.art = a;
  } catch (e) {
    console.warn("[sector] could not parse the v1 art library; ships will draw without art", e);
  }
  data.lockCode = typeof raw[V1_ACCESS_KEY] === "string" ? raw[V1_ACCESS_KEY] : "";
  return { data, schema: 1 };
}

function readAccess(data, raw) {
  data.lockCode = (raw.access && typeof raw.access.lockCode === "string") ? raw.access.lockCode : "";
  // Fleet positions are public unless the GM has explicitly switched that off.
  data.fleetsPublic = !(raw.access && raw.access.fleetsPublic === false);
}

// The GM's turn counter, bumped by nextTurn() in App.jsx and stamped onto
// actions as they're archived so Previous Actions can show which turn a
// request was resolved on. Absent (a sector predating this, or v1) means 0 —
// campaigns start at turn 0.
function readTurn(data, raw) {
  const n = raw.turn && Number(raw.turn.number);
  data.turnNumber = Number.isFinite(n) && n >= 0 ? n : 0;
}

// Current tree shape (schema >= SCHEMA_VERSION): every collection, including
// ships, decoded generically, then regrouped onto their fleets — see
// nestFleets in sectorSchema.js.
function fromCurrent(raw) {
  const data = emptySector();
  for (const c of COLLECTIONS) data[c] = decodeCollection(c, raw[c]);
  readAccess(data, raw);
  readTurn(data, raw);
  return { data: nestFleets(data), schema: SCHEMA_VERSION };
}

// Schema 2: the per-entity tree exists, but ships were still embedded on each
// fleet — there was no separate ships collection yet. Reads fleets the old
// way instead of looking for one. Migrates to the current shape in place on
// its first save (App.jsx forces a full resave the first time it sees a
// schema below SCHEMA_VERSION, the same trick used for v1->v2 below).
function fromV2Legacy(raw) {
  const data = emptySector();
  for (const c of COLLECTIONS) {
    if (c === "fleets" || c === "ships") continue;
    data[c] = decodeCollection(c, raw[c]);
  }
  data.fleets = decodeV2Fleets(raw.fleets);
  readAccess(data, raw);
  readTurn(data, raw);
  return { data, schema: 2 };
}

// Turns a raw database snapshot into { data, schema }, preferring the current
// tree and falling back through schema 2 (ships still embedded) to the v1
// blob, so a sector nobody has migrated still opens. The schema is reported
// back so the caller can force a full resave on the sector's first write,
// migrating it in place either way.
function decode(raw) {
  if (!raw) return { data: emptySector(), schema: null };
  const schema = raw.meta && Number(raw.meta.schema);
  if (schema >= SCHEMA_VERSION) return fromCurrent(raw);
  if (schema === 2) return fromV2Legacy(raw);
  return fromV1(raw);
}

// One-shot read, still used where a single snapshot is enough.
export async function loadSector() {
  if (!firebaseReady) throw new Error("Firebase is not configured");
  const snap = await dbGet(ref(db, root()));
  return decode(snap.val());
}

// Live subscription: onData fires with { data, schema } on open and again every
// time the sector changes in the database — another GM's edit, or this browser's
// own save echoing back — so viewers see updates without reloading. Returns an
// unsubscribe function; call it to detach the listener.
export function subscribeSector(onData, onError) {
  if (!firebaseReady) {
    onError?.(new Error("Firebase is not configured"));
    return () => {};
  }
  return onValue(
    ref(db, root()),
    (snap) => onData(decode(snap.val())),
    (err) => onError?.(err),
  );
}

// Live subscription for GM Tools notes, kept separate from subscribeSector so
// a viewer who never opens that tab never fetches them. Same onData/onError
// shape as subscribeSector, but onData gets the plain decoded array directly
// (there's no schema/migration concern for a collection with no v1 history).
export function subscribeNotes(onData, onError) {
  if (!firebaseReady) {
    onError?.(new Error("Firebase is not configured"));
    return () => {};
  }
  return onValue(
    ref(db, notesRoot()),
    (snap) => onData(decodeCollection(NOTES_COLLECTION, snap.val())),
    (err) => onError?.(err),
  );
}

/* ------------------------------------------------ writing */

// Returns false when there was nothing to write, so the caller can leave the
// save indicator alone rather than flashing "saved" at an idle sector.
export async function saveSector(prev, next) {
  if (!firebaseReady) return false;
  const updates = buildSectorUpdates(prev, next);
  if (!Object.keys(updates).length) return false;
  updates["meta/schema"] = SCHEMA_VERSION;
  updates["meta/updatedAt"] = Date.now();
  await authReady; // the .write rule requires auth != null
  await dbUpdate(ref(db, root()), updates);
  return true;
}

// Same shape as saveSector, for the notes collection at its own path.
export async function saveNotes(prev, next) {
  if (!firebaseReady) return false;
  const updates = buildCollectionUpdates(NOTES_COLLECTION, prev, next);
  if (!Object.keys(updates).length) return false;
  await authReady;
  await dbUpdate(ref(db, notesRoot()), updates);
  return true;
}
