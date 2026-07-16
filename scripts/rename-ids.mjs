// One-shot key rename: faction and fleet ids whose keys encode outdated names
// -> keys that match the factions'/fleets' current names.
//
//   node scripts/rename-ids.mjs --dry-run          # show the plan, write nothing
//   node scripts/rename-ids.mjs                     # rename in ?sector=default
//   node scripts/rename-ids.mjs --sector=campaign-two
//
// RTDB can't rename a key in place, so each rename writes the entity under its new
// key (with its `id` field updated to match), repoints every reference to it
// (systems.factionId, fleets.factionId, relations.a/b), and deletes the old key —
// all in a single atomic multi-path PATCH, so the sector is never half-renamed.
//
// A full snapshot of the sector is written to scripts/ before anything changes, so
// the rename is reversible. Uses the same anonymous REST access the web app has.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (name) => argv.some((a) => a === `--${name}`);
const opt = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const DRY = flag("dry-run");
const SECTOR = opt("sector", "default").replace(/[.#$/[\]]/g, "-");

// The rename maps. Keys on the left are the current (outdated-name) ids; values
// are the new short-slug ids derived from each entity's current name. fac_none
// ("Unaligned") is deliberately absent — it's a hardcoded default in the app and
// must never move.
const RENAME_FAC = {
  fac_terran: "fac_gorbulon",     // Gorbulon
  fac_krell: "fac_flubbadite",    // Flubbadite
  fac_verdant: "fac_luuk",        // Children of Luuk
  fac_void: "fac_11th",           // 11th Fleet
  fac_162_z8o5: "fac_imperial",   // Imperial
};
const RENAME_FLT = {
  flt_3rd: "flt_prime",           // Gorbulon Prime
  flt_green: "flt_faithful",      // The Faithful
  flt_res: "flt_reserve",         // Vega Reserve
  flt_talon: "flt_flubba",        // Flubba Defense Fleet
  flt_166_ww84: "flt_11th",       // the 11th Fleet
};

function databaseUrl() {
  for (const file of [".env.local", ".env"]) {
    const p = path.join(root, file);
    if (!fs.existsSync(p)) continue;
    const m = fs.readFileSync(p, "utf8").match(/^\s*VITE_FIREBASE_DATABASE_URL\s*=\s*(.+)\s*$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "").replace(/\/$/, "");
  }
  throw new Error("VITE_FIREBASE_DATABASE_URL not found in .env.local or .env");
}

const BASE = databaseUrl();
const url = (p) => `${BASE}/${p}.json`;

async function req(method, p, body) {
  const res = await fetch(url(p), {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

async function main() {
  console.log(`sector : ${SECTOR}`);
  console.log(`target : ${BASE}`);
  console.log(DRY ? "mode   : dry run — nothing will be written\n" : "mode   : live\n");

  const raw = await req("GET", `sectors/${SECTOR}`);
  if (!raw) throw new Error(`sectors/${SECTOR} does not exist`);

  const factions = raw.factions || {};
  const fleets = raw.fleets || {};
  const systems = raw.systems || {};
  const relations = raw.relations || {};

  // --- sanity checks before we build a single write --------------------------
  const problems = [];
  const check = (map, coll, node) => {
    for (const [oldK, newK] of Object.entries(map)) {
      if (!node[oldK]) problems.push(`${coll}/${oldK} does not exist`);
      if (node[newK]) problems.push(`${coll}/${newK} already exists — would be overwritten`);
      if (oldK === "fac_none") problems.push("refusing to rename fac_none (hardcoded default)");
    }
  };
  check(RENAME_FAC, "factions", factions);
  check(RENAME_FLT, "fleets", fleets);
  if (problems.length) {
    console.error("aborting — the database does not look as expected:");
    problems.forEach((p) => console.error("  - " + p));
    process.exitCode = 1;
    return;
  }

  // --- build the atomic multi-path update ------------------------------------
  const updates = {};

  // Factions: move the node under its new key, id field updated; drop the old key.
  for (const [oldK, newK] of Object.entries(RENAME_FAC)) {
    updates[`factions/${newK}`] = { ...factions[oldK], id: newK };
    updates[`factions/${oldK}`] = null;
  }

  // Fleets: same move, and repoint factionId here (the whole node is rewritten, so
  // its old faction reference travels with it and must be corrected in place).
  for (const [oldK, newK] of Object.entries(RENAME_FLT)) {
    const node = { ...fleets[oldK], id: newK };
    if (RENAME_FAC[node.factionId]) node.factionId = RENAME_FAC[node.factionId];
    updates[`fleets/${newK}`] = node;
    updates[`fleets/${oldK}`] = null;
  }
  // Any fleet that is NOT itself being renamed but points at a renamed faction:
  // patch just its factionId leaf. (None expected in this sector, but safe.)
  for (const [k, f] of Object.entries(fleets)) {
    if (!RENAME_FLT[k] && RENAME_FAC[f.factionId]) {
      updates[`fleets/${k}/factionId`] = RENAME_FAC[f.factionId];
    }
  }

  // Systems: only the factionId leaf changes; keys are untouched.
  for (const [k, s] of Object.entries(systems)) {
    if (RENAME_FAC[s.factionId]) updates[`systems/${k}/factionId`] = RENAME_FAC[s.factionId];
  }

  // Relations: endpoints a/b are faction ids.
  for (const [k, r] of Object.entries(relations)) {
    if (RENAME_FAC[r.a]) updates[`relations/${k}/a`] = RENAME_FAC[r.a];
    if (RENAME_FAC[r.b]) updates[`relations/${k}/b`] = RENAME_FAC[r.b];
  }

  updates["meta/updatedAt"] = Date.now();

  // --- report ----------------------------------------------------------------
  const moves = [...Object.entries(RENAME_FAC), ...Object.entries(RENAME_FLT)];
  console.log("renames:");
  for (const [oldK, newK] of moves) {
    const name = (factions[oldK] || fleets[oldK]).name;
    console.log(`  ${oldK.padEnd(14)} -> ${newK.padEnd(14)} (${name})`);
  }
  const refPaths = Object.keys(updates).filter(
    (p) => /\/factionId$/.test(p) || /\/(a|b)$/.test(p),
  );
  console.log(`\nreference leaves repointed: ${refPaths.length}`);
  refPaths.forEach((p) => console.log(`  ${p} = ${updates[p]}`));
  console.log(`\ntotal write paths: ${Object.keys(updates).length} (incl. ${moves.length} new nodes + ${moves.length} deletes)`);

  if (DRY) {
    console.log("\nDry run — nothing written.");
    return;
  }

  // --- backup, then write ----------------------------------------------------
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(root, "scripts", `rename-backup-${SECTOR}-${stamp}.json`);
  fs.writeFileSync(backup, JSON.stringify(raw, null, 2));
  console.log(`\nbackup written: ${path.relative(root, backup)}`);

  await req("PATCH", `sectors/${SECTOR}`, updates);
  console.log("written.\n");

  // --- verify (re-read and check nothing dangles) ----------------------------
  const after = await req("GET", `sectors/${SECTOR}`);
  const oldFac = new Set(Object.keys(RENAME_FAC));
  const oldFlt = new Set(Object.keys(RENAME_FLT));
  let bad = 0;
  const fail = (msg) => { bad++; console.log("  FAIL " + msg); };

  console.log("verify:");
  for (const [oldK, newK] of Object.entries(RENAME_FAC)) {
    if (after.factions[oldK]) fail(`factions/${oldK} still present`);
    if (!after.factions[newK]) fail(`factions/${newK} missing`);
    else if (after.factions[newK].id !== newK) fail(`factions/${newK}.id = ${after.factions[newK].id}`);
  }
  for (const [oldK, newK] of Object.entries(RENAME_FLT)) {
    if (after.fleets[oldK]) fail(`fleets/${oldK} still present`);
    if (!after.fleets[newK]) fail(`fleets/${newK} missing`);
    else if (after.fleets[newK].id !== newK) fail(`fleets/${newK}.id = ${after.fleets[newK].id}`);
  }
  for (const [k, s] of Object.entries(after.systems || {})) {
    if (oldFac.has(s.factionId)) fail(`systems/${k} still points at ${s.factionId}`);
  }
  for (const [k, f] of Object.entries(after.fleets || {})) {
    if (oldFac.has(f.factionId)) fail(`fleets/${k} still points at ${f.factionId}`);
  }
  for (const [k, r] of Object.entries(after.relations || {})) {
    if (oldFac.has(r.a)) fail(`relations/${k}.a still ${r.a}`);
    if (oldFac.has(r.b)) fail(`relations/${k}.b still ${r.b}`);
  }
  // counts unchanged
  const count = (o) => Object.keys(o || {}).length;
  if (count(after.factions) !== count(factions)) fail(`faction count ${count(factions)} -> ${count(after.factions)}`);
  if (count(after.fleets) !== count(fleets)) fail(`fleet count ${count(fleets)} -> ${count(after.fleets)}`);

  console.log(bad
    ? `\n${bad} check(s) failed. Restore from ${path.relative(root, backup)} if needed:\n  node -e "..."  (PUT the backup back to sectors/${SECTOR})`
    : `\nRename complete — ${moves.length} keys renamed, no dangling references. Backup: ${path.relative(root, backup)}`);
  if (bad) process.exitCode = 1;
}

main().catch((e) => { console.error(`\nrename failed: ${e.message}`); process.exitCode = 1; });
