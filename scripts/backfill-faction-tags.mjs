// One-shot backfill: give existing "characters", "locations", and "factions"
// codex entries a `factionId`, inferred from whatever politics-view member /
// map system / faction already links to them — so the new codex-is-the-
// source-of-truth sync (see App.syncFactionNode and patchFaction) starts from
// the affiliations already on record instead of wiping them back to
// "Unassigned".
//
//   node scripts/backfill-faction-tags.mjs --dry-run          # show the plan, write nothing
//   node scripts/backfill-faction-tags.mjs                     # backfill ?sector=default
//   node scripts/backfill-faction-tags.mjs --sector=campaign-two
//
// Direction of inference (mirrors syncFactionNode's / patchFaction's reverse lookup):
//   characters -> faction that has a member with member.wikiId === entry.id
//   locations  -> system that has system.wikiId === entry.id, using its factionId
//   factions   -> the faction itself, via faction.wikiId === entry.id
//
// An entry with no matching member/system/faction, or one that already carries
// the correct factionId, is left untouched. A full snapshot is written to
// scripts/ before anything changes, same as rename-ids.mjs.
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

// The database rules require `auth != null` to write (see database.rules.json)
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
  const systems = raw.systems || {};
  const wiki = raw.wiki || {};

  // --- reverse indexes: wikiId -> the faction/system it's currently linked from
  const charFaction = {}; // wikiId -> factionId
  const charConflicts = [];
  for (const [facKey, f] of Object.entries(factions)) {
    for (const m of Object.values(f.members || {})) {
      if (!m.wikiId) continue;
      if (charFaction[m.wikiId] && charFaction[m.wikiId] !== (f.id || facKey)) {
        charConflicts.push(`wiki/${m.wikiId} is linked from members in both ${charFaction[m.wikiId]} and ${f.id || facKey} — keeping the first`);
        continue;
      }
      charFaction[m.wikiId] = f.id || facKey;
    }
  }
  const sysFaction = {}; // wikiId -> factionId
  const sysConflicts = [];
  for (const [sysKey, s] of Object.entries(systems)) {
    if (!s.wikiId) continue;
    if (sysFaction[s.wikiId] && sysFaction[s.wikiId] !== s.factionId) {
      sysConflicts.push(`wiki/${s.wikiId} is linked from both systems/${sysFaction[s.wikiId]} and systems/${s.id || sysKey} — keeping the first`);
      continue;
    }
    sysFaction[s.wikiId] = s.factionId;
  }
  const facFaction = {}; // wikiId -> the faction the article is itself about
  const facConflicts = [];
  for (const [facKey, f] of Object.entries(factions)) {
    if (!f.wikiId) continue;
    const id = f.id || facKey;
    if (facFaction[f.wikiId] && facFaction[f.wikiId] !== id) {
      facConflicts.push(`wiki/${f.wikiId} is linked from both factions ${facFaction[f.wikiId]} and ${id} — keeping the first`);
      continue;
    }
    facFaction[f.wikiId] = id;
  }

  // --- build the plan ---------------------------------------------------------
  const updates = {};
  const plan = []; // { id, title, category, from, to }
  for (const [wikiKey, e] of Object.entries(wiki)) {
    const id = e.id || wikiKey;
    let to = null;
    if (e.category === "characters") to = charFaction[id] || null;
    else if (e.category === "locations") to = sysFaction[id] || null;
    else if (e.category === "factions") to = facFaction[id] || null;
    if (!to) continue;
    if (e.factionId === to) continue; // already correct
    updates[`wiki/${wikiKey}/factionId`] = to;
    plan.push({ id, title: e.title || "Untitled", category: e.category, from: e.factionId || null, to });
  }

  // --- report ------------------------------------------------------------------
  console.log(`characters checked: ${Object.values(wiki).filter((e) => e.category === "characters").length}`);
  console.log(`locations checked : ${Object.values(wiki).filter((e) => e.category === "locations").length}`);
  console.log(`factions checked  : ${Object.values(wiki).filter((e) => e.category === "factions").length}`);
  if (charConflicts.length) { console.log("\ncharacter conflicts:"); charConflicts.forEach((c) => console.log("  ! " + c)); }
  if (sysConflicts.length) { console.log("\nlocation conflicts:"); sysConflicts.forEach((c) => console.log("  ! " + c)); }
  if (facConflicts.length) { console.log("\nfaction conflicts:"); facConflicts.forEach((c) => console.log("  ! " + c)); }
  console.log(`\nentries to update: ${plan.length}`);
  plan.forEach((p) => console.log(`  [${p.category}] "${p.title}"  ${p.from || "(none)"} -> ${p.to}`));

  if (plan.length === 0) {
    console.log("\nNothing to backfill.");
    return;
  }

  if (DRY) {
    console.log("\nDry run — nothing written.");
    return;
  }

  // --- backup, then write ------------------------------------------------------
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = path.join(root, "scripts", `backfill-faction-tags-backup-${SECTOR}-${stamp}.json`);
  fs.writeFileSync(backup, JSON.stringify(raw, null, 2));
  console.log(`\nbackup written: ${path.relative(root, backup)}`);

  await req("PATCH", `sectors/${SECTOR}`, updates);
  console.log("written.\n");

  // --- verify --------------------------------------------------------------
  const after = await req("GET", `sectors/${SECTOR}`);
  let bad = 0;
  const fail = (msg) => { bad++; console.log("  FAIL " + msg); };
  console.log("verify:");
  for (const p of plan) {
    const entry = Object.values(after.wiki || {}).find((e) => (e.id || "") === p.id) || after.wiki[p.id];
    if (!entry || entry.factionId !== p.to) fail(`wiki/${p.id} factionId not ${p.to}`);
  }
  console.log(bad
    ? `\n${bad} check(s) failed. Restore from ${path.relative(root, backup)} if needed.`
    : `\nBackfill complete — ${plan.length} entries updated. Backup: ${path.relative(root, backup)}`);
  if (bad) process.exitCode = 1;
}

main().catch((e) => { console.error(`\nbackfill failed: ${e.message}`); process.exitCode = 1; });
