// One-shot migration: the turn counter used to start at 1; it should have
// started at 0. Shifts every stored turn number down by one so the numbering
// matches what the app now produces (see turnNumber defaults in
// src/lib/sectorSchema.js, src/lib/sectorRepo.js and src/App.jsx) — the turn
// that just closed becomes turn 0, this turn becomes turn 1, etc.
//
// Touches three things under sectors/{id}:
//   turn/number           the GM's live counter
//   archivedActions/*/turn   stamped onto each action when a turn closed
//   archivedMissions/*/turn  stamped onto each mission when a turn closed
//
//   node scripts/migrate-turn-offset.mjs --dry-run
//   node scripts/migrate-turn-offset.mjs                    # migrate ?sector=default
//   node scripts/migrate-turn-offset.mjs --sector=campaign-two
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

const shiftDown = (n) => Math.max(0, (Number(n) || 0) - 1);

async function main() {
  console.log(`sector : ${SECTOR}`);
  console.log(`target : ${BASE}`);
  console.log(DRY ? "mode   : dry run — nothing will be written\n" : "mode   : live\n");

  const raw = await req("GET", `sectors/${SECTOR}`);
  if (!raw) throw new Error(`sectors/${SECTOR} does not exist — nothing to migrate`);

  const updates = {};
  const report = [];

  const before = raw.turn && Number(raw.turn.number);
  if (Number.isFinite(before)) {
    const after = shiftDown(before);
    updates["turn/number"] = after;
    report.push(`turn/number: ${before} -> ${after}`);
  } else {
    report.push("turn/number: absent — nothing stored to shift (app already defaults to 0)");
  }

  for (const collection of ["archivedActions", "archivedMissions"]) {
    const node = raw[collection];
    if (!node || typeof node !== "object") continue;
    let count = 0;
    for (const [id, entity] of Object.entries(node)) {
      if (!entity || typeof entity !== "object" || entity.turn === undefined) continue;
      const before = Number(entity.turn);
      const after = shiftDown(before);
      if (after !== before) {
        updates[`${collection}/${id}/turn`] = after;
        count++;
      }
    }
    report.push(`${collection}: ${count} entit${count === 1 ? "y" : "ies"} shifted`);
  }

  console.log(report.map((l) => `  ${l}`).join("\n"));

  const paths = Object.keys(updates);
  if (paths.length === 0) {
    console.log("\nNothing to shift — already at turn 0, or this sector has no turn history yet.");
    return;
  }

  console.log(`\n${paths.length} field(s) to write`);

  if (DRY) {
    console.log("\nfirst few paths:");
    paths.slice(0, 12).forEach((p) => console.log(`  ${p} -> ${updates[p]}`));
    console.log(`  ... +${Math.max(0, paths.length - 12)} more`);
    console.log("\nDry run — nothing written.");
    return;
  }

  await req("PATCH", `sectors/${SECTOR}`, updates);
  console.log("written.\n");

  const after = await req("GET", `sectors/${SECTOR}`);
  const afterTurn = after.turn && Number(after.turn.number);
  const expectTurn = updates["turn/number"];
  const turnOk = expectTurn === undefined || afterTurn === expectTurn;
  console.log(turnOk
    ? `verified: turn/number reads back as ${afterTurn ?? "(absent)"}.`
    : `FAIL: turn/number read back as ${afterTurn}, expected ${expectTurn} — investigate before trusting the new shape.`);
  if (!turnOk) process.exitCode = 1;
}

main().catch((e) => { console.error(`\nmigration failed: ${e.message}`); process.exitCode = 1; });
