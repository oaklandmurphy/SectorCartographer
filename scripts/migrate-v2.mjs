// One-shot migration: the v1 single-blob sector -> the v2 per-entity tree.
//
//   node scripts/migrate-v2.mjs --dry-run          # show what would be written
//   node scripts/migrate-v2.mjs                    # migrate ?sector=default
//   node scripts/migrate-v2.mjs --sector=campaign-two
//   node scripts/migrate-v2.mjs --force            # re-migrate an already-v2 sector
//
// The v1 keys are read and left exactly as they are — nothing is deleted, so this
// is safe to run twice and the old blob stays as a backup. Delete them by hand
// once you're satisfied, and not before every player's browser has the new bundle.
//
// Uses the REST API and the same anonymous access the web app has, so there's no
// service account to set up. Encoding goes through the same sectorSchema.js the
// app uses — there is no second implementation to drift.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  SCHEMA_VERSION, COLLECTIONS, V1_STATE_KEY, V1_ART_KEY, V1_ACCESS_KEY,
  emptySector, buildSectorUpdates, decodeCollection,
} from "../src/lib/sectorSchema.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const flag = (name) => argv.some((a) => a === `--${name}`);
const opt = (name, fallback) => {
  const hit = argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const DRY = flag("dry-run");
const FORCE = flag("force");
const SECTOR = opt("sector", "default").replace(/[.#$/[\]]/g, "-");

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

const bytes = (o) => JSON.stringify(o).length;
const fmt = (n) => (n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`);

async function main() {
  console.log(`sector : ${SECTOR}`);
  console.log(`target : ${BASE}`);
  console.log(DRY ? "mode   : dry run — nothing will be written\n" : "mode   : live\n");

  const raw = await req("GET", `sectors/${SECTOR}`);
  if (!raw) throw new Error(`sectors/${SECTOR} does not exist — nothing to migrate`);

  // This script's job is specifically v1 (single JSON blob) -> tree — so the
  // guard checks "is this already a tree at all" (schema >= 2), not "is this
  // already exactly SCHEMA_VERSION". Otherwise, once SCHEMA_VERSION moved on
  // to 3 (see scripts/migrate-v3.mjs), this would treat a schema-2 sector as
  // still-unmigrated and — if the old v1 keys are still sitting around as a
  // backup, which is the documented normal case — silently overwrite it with
  // whatever the sector looked like back when v1 was last true.
  const already = raw.meta && Number(raw.meta.schema) >= 2;
  if (already && !FORCE) {
    console.log(`Already at schema ${raw.meta.schema} (tree shape). Nothing to do (use --force to rewrite from the v1 blob anyway).`);
    return;
  }
  if (!raw[V1_STATE_KEY]) throw new Error(`no ${V1_STATE_KEY} found — is this the right sector?`);

  // Parse the v1 blobs.
  const data = emptySector();
  const state = JSON.parse(raw[V1_STATE_KEY]);
  for (const c of COLLECTIONS) if (Array.isArray(state[c])) data[c] = state[c];
  if (raw[V1_ART_KEY]) {
    const art = JSON.parse(raw[V1_ART_KEY]);
    if (Array.isArray(art)) data.art = art;
  }
  data.lockCode = typeof raw[V1_ACCESS_KEY] === "string" ? raw[V1_ACCESS_KEY] : "";
  const lockCode = data.lockCode;

  const v1Size = bytes(raw[V1_STATE_KEY]) + bytes(raw[V1_ART_KEY] || "");
  console.log("read from v1:");
  for (const c of COLLECTIONS) console.log(`  ${c.padEnd(10)} ${String(data[c].length).padStart(3)}`);
  console.log(`  ${"lock code".padEnd(10)} ${lockCode ? "set" : "(none — sector is open)"}`);
  console.log(`  ${"total".padEnd(10)} ${fmt(v1Size)} across 3 keys\n`);

  // Same encoder the app writes through, so the tree the migration produces and
  // the tree the app maintains cannot diverge. `data.lockCode` is diffed along
  // with the content, so the lock travels with the sector.
  const updates = buildSectorUpdates(emptySector(), data);
  updates["meta/schema"] = SCHEMA_VERSION;
  updates["meta/updatedAt"] = Date.now();
  updates["meta/migratedFrom"] = 1;

  const nodes = Object.keys(updates).filter((k) => !k.startsWith("meta/") && !k.startsWith("access/"));
  console.log(`writing v2: ${nodes.length} entity nodes, ${fmt(bytes(updates))} total`);

  if (DRY) {
    console.log("\nfirst few paths:");
    nodes.slice(0, 8).forEach((p) => console.log(`  ${p}`));
    console.log(`  ... +${Math.max(0, nodes.length - 8)} more`);
    console.log("\nDry run — nothing written. The v1 keys would be left untouched.");
    return;
  }

  await req("PATCH", `sectors/${SECTOR}`, updates);
  console.log("written.\n");

  // Read it back and decode exactly as the app will, so this reports what the
  // app will actually see rather than what we hoped we wrote.
  const after = await req("GET", `sectors/${SECTOR}`);
  let bad = 0;
  console.log("verify (re-read and decoded):");
  for (const c of COLLECTIONS) {
    const back = decodeCollection(c, after[c]);
    const want = data[c];
    const orderOk = want.every((it, i) => back[i] && back[i].id === it.id);
    const ok = back.length === want.length && orderOk;
    if (!ok) bad++;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${c.padEnd(10)} ${String(want.length).padStart(3)} -> ${String(back.length).padStart(3)}${orderOk ? "" : "  (order differs)"}`);
  }
  const lockBack = (after.access && after.access.lockCode) || "";
  if (lockBack !== lockCode) { bad++; console.log("  FAIL lock code did not round-trip"); }

  const v1Intact = Boolean(after[V1_STATE_KEY]);
  console.log(`\nv1 keys: ${v1Intact ? "still present (kept as backup)" : "MISSING — expected them to be left alone"}`);
  console.log(bad ? `\n${bad} collection(s) did not verify — v1 is untouched, so the app still works. Investigate before deleting anything.`
                  : `\nMigration complete. schema=${SCHEMA_VERSION}.`);
  if (bad) process.exitCode = 1;
}

main().catch((e) => { console.error(`\nmigration failed: ${e.message}`); process.exitCode = 1; });
