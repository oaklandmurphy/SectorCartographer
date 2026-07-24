// One-shot migration: splits each fleet's embedded ships[] out into their own
// "ships" collection (schema 2 -> 3) — see src/lib/sectorSchema.js
// (flattenFleets/nestFleets/decodeV2Fleets) for why: editing one carrier used
// to rewrite every other carrier in its fleet.
//
//   node scripts/migrate-v3.mjs --dry-run
//   node scripts/migrate-v3.mjs                    # migrate ?sector=default
//   node scripts/migrate-v3.mjs --sector=campaign-two
//   node scripts/migrate-v3.mjs --force            # re-split an already-v3 sector
//
// Uses the exact encoders/decoders the app does (imported from
// sectorSchema.js), so there's no second implementation to drift. Not
// required to use the app — a schema-2 sector migrates to v3 in place on its
// first edit (see App.jsx) — but running this proactively does the split all
// at once instead of piecemeal as fleets happen to get touched.
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  SCHEMA_VERSION, COLLECTIONS, decodeCollection, decodeV2Fleets,
  emptySector, buildSectorUpdates,
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

function envVar(name) {
  for (const file of [".env.local", ".env"]) {
    const p = path.join(root, file);
    if (!fs.existsSync(p)) continue;
    const m = fs.readFileSync(p, "utf8").match(new RegExp(`^\\s*${name}\\s*=\\s*(.+)\\s*$`, "m"));
    if (m) return m[1].trim().replace(/^["']|["']$/g, "").replace(/\/$/, "");
  }
  return null;
}

const BASE = envVar("VITE_FIREBASE_DATABASE_URL");
if (!BASE) throw new Error("VITE_FIREBASE_DATABASE_URL not found in .env.local or .env");

// The database rules require auth != null to write (see database.rules.json)
// — the app satisfies that with a silent anonymous sign-in (src/lib/firebase.js).
// Reads stay public, so only writes need the token attached.
let idToken = null;
async function ensureAuth() {
  if (idToken) return idToken;
  const apiKey = envVar("VITE_FIREBASE_API_KEY");
  if (!apiKey) throw new Error("VITE_FIREBASE_API_KEY not found in .env.local or .env — needed to sign in anonymously");
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ returnSecureToken: true }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`anonymous sign-in failed -> ${res.status} ${JSON.stringify(data)}`);
  idToken = data.idToken;
  return idToken;
}

const url = (p, token) => `${BASE}/${p}.json${token ? `?auth=${token}` : ""}`;

async function req(method, p, body) {
  const token = method === "GET" ? null : await ensureAuth();
  const res = await fetch(url(p, token), {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
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

  const schema = raw.meta && Number(raw.meta.schema);
  if (schema >= SCHEMA_VERSION && !FORCE) {
    console.log(`Already at schema ${schema}. Nothing to do (use --force to re-split anyway).`);
    return;
  }
  if (!(schema >= 2)) {
    console.log(`schema is ${schema ?? "(none)"} — this script only handles a schema-2 sector (run scripts/migrate-v2.mjs first if this is still v1).`);
    return;
  }

  // Read every collection generically except fleets, which needs the old
  // embedded-ships reader — same split sectorRepo.js's fromV2Legacy does.
  const data = emptySector();
  for (const c of COLLECTIONS) {
    if (c === "fleets" || c === "ships") continue;
    data[c] = decodeCollection(c, raw[c]);
  }
  data.fleets = decodeV2Fleets(raw.fleets);
  data.lockCode = (raw.access && typeof raw.access.lockCode === "string") ? raw.access.lockCode : "";
  data.fleetsPublic = !(raw.access && raw.access.fleetsPublic === false);

  const shipCount = data.fleets.reduce((n, f) => n + (f.ships || []).length, 0);
  console.log(`read ${data.fleets.length} fleet(s), ${shipCount} ship(s) total\n`);

  // buildSectorUpdates flattens fleets/ships internally (see sectorSchema.js)
  // — diffing against empty means every fleet and every ship is "new", so this
  // writes the full split tree in one pass rather than waiting on future edits.
  const updates = buildSectorUpdates(emptySector(), data);
  updates["meta/schema"] = SCHEMA_VERSION;
  updates["meta/updatedAt"] = Date.now();
  updates["meta/migratedFrom"] = schema;

  const nodes = Object.keys(updates).filter((k) => !k.startsWith("meta/") && !k.startsWith("access/"));
  console.log(`writing v${SCHEMA_VERSION}: ${nodes.length} entity nodes, ${fmt(bytes(updates))} total`);

  if (DRY) {
    console.log("\nfirst few paths:");
    nodes.slice(0, 8).forEach((p) => console.log(`  ${p}`));
    console.log(`  ... +${Math.max(0, nodes.length - 8)} more`);
    console.log("\nDry run — nothing written.");
    return;
  }

  await req("PATCH", `sectors/${SECTOR}`, updates);
  console.log("written.\n");

  const after = await req("GET", `sectors/${SECTOR}`);
  const afterShips = decodeCollection("ships", after.ships);
  const afterFleets = decodeCollection("fleets", after.fleets);
  const ok = afterFleets.length === data.fleets.length && afterShips.length === shipCount;
  console.log(ok
    ? `verified: ${afterFleets.length} fleet(s), ${afterShips.length} ship(s) read back from the split collections.`
    : `FAIL: read-back did not match (fleets ${afterFleets.length}/${data.fleets.length}, ships ${afterShips.length}/${shipCount}) — investigate before trusting the new shape.`);
  if (!ok) process.exitCode = 1;
}

main().catch((e) => { console.error(`\nmigration failed: ${e.message}`); process.exitCode = 1; });
