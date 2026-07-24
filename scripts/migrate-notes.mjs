// One-shot migration: copies sectors/{id}/notes -> sectorNotes/{id}, the new
// home for GM Tools notes (see sectorRepo.js/sectorSchema.js — they moved out
// of the sector tree so a viewer who never opens GM Tools never fetches them).
//
//   node scripts/migrate-notes.mjs --dry-run
//   node scripts/migrate-notes.mjs                    # migrate ?sector=default
//   node scripts/migrate-notes.mjs --sector=campaign-two
//   node scripts/migrate-notes.mjs --force             # overwrite an existing sectorNotes/{id}
//
// The old sectors/{id}/notes is left in place — nothing is deleted, so this is
// safe to run twice. Delete the old copy by hand once every browser has the
// new code and you've confirmed GM Tools still shows everything.
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

// sectorNotes/{id}, like sectors/{id}, requires auth != null to write (see
// database.rules.json) — the app satisfies that with a silent anonymous
// sign-in (src/lib/firebase.js). Reads stay public, so only the write below
// needs the token attached.
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

  const oldNotes = await req("GET", `sectors/${SECTOR}/notes`);
  if (!oldNotes) {
    console.log("no notes at sectors/{sector}/notes — nothing to migrate.");
    return;
  }
  const count = Object.keys(oldNotes).length;
  console.log(`found ${count} note(s), ${fmt(bytes(oldNotes))} at sectors/${SECTOR}/notes`);

  const existing = await req("GET", `sectorNotes/${SECTOR}`);
  if (existing && !FORCE) {
    console.log(`sectorNotes/${SECTOR} already has ${Object.keys(existing).length} note(s). Nothing to do (use --force to overwrite).`);
    return;
  }

  if (DRY) {
    console.log("\nDry run — would PUT this to sectorNotes/" + SECTOR + ". Nothing written.");
    return;
  }

  await req("PUT", `sectorNotes/${SECTOR}`, oldNotes);
  console.log(`written to sectorNotes/${SECTOR}.\n`);

  const after = await req("GET", `sectorNotes/${SECTOR}`);
  const ok = after && Object.keys(after).length === count;
  console.log(ok
    ? `verified: ${count} note(s) read back. The old copy at sectors/${SECTOR}/notes was left in place as a backup — delete it by hand once you've confirmed GM Tools looks right.`
    : "FAIL: read-back did not match. The old copy at sectors/{sector}/notes is untouched, so the app still works — investigate before relying on the new path.");
  if (!ok) process.exitCode = 1;
}

main().catch((e) => { console.error(`\nmigration failed: ${e.message}`); process.exitCode = 1; });
