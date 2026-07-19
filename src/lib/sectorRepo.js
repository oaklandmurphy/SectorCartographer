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
import { db, firebaseReady } from "./firebase.js";
import {
  SCHEMA_VERSION, COLLECTIONS, V1_STATE_KEY, V1_ART_KEY, V1_ACCESS_KEY,
  decodeCollection, emptySector, buildSectorUpdates,
} from "./sectorSchema.js";

export { emptySector };

// One Firebase project can host several independent sector maps
// (e.g. https://yoursite.com/?sector=campaign-two) without extra setup.
const params = new URLSearchParams(window.location.search);
export const SECTOR_ID = (params.get("sector") || "default").replace(/[.#$/[\]]/g, "-");

const root = () => `sectors/${SECTOR_ID}`;

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

function fromV2(raw) {
  const data = emptySector();
  for (const c of COLLECTIONS) data[c] = decodeCollection(c, raw[c]);
  data.lockCode = (raw.access && typeof raw.access.lockCode === "string") ? raw.access.lockCode : "";
  // Fleet positions are public unless the GM has explicitly switched that off.
  data.fleetsPublic = !(raw.access && raw.access.fleetsPublic === false);
  return { data, schema: SCHEMA_VERSION };
}

// Turns a raw database snapshot into { data, schema }, preferring the v2 tree and
// falling back to the v1 blob so a sector nobody has migrated still opens. The
// schema is reported back so the caller can save in v2 either way, migrating the
// sector on its first write.
function decode(raw) {
  if (!raw) return { data: emptySector(), schema: null };
  const isV2 = raw.meta && Number(raw.meta.schema) >= SCHEMA_VERSION;
  return isV2 ? fromV2(raw) : fromV1(raw);
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

/* ------------------------------------------------ writing */

// Returns false when there was nothing to write, so the caller can leave the
// save indicator alone rather than flashing "saved" at an idle sector.
export async function saveSector(prev, next) {
  if (!firebaseReady) return false;
  const updates = buildSectorUpdates(prev, next);
  if (!Object.keys(updates).length) return false;
  updates["meta/schema"] = SCHEMA_VERSION;
  updates["meta/updatedAt"] = Date.now();
  await dbUpdate(ref(db, root()), updates);
  return true;
}
