// One-shot migration: existing inline wiki-entry images (base64 data: URIs)
// and ship-art SVGs (raw text) -> Cloud Storage, leaving just a download URL
// on the entity (see src/lib/codexImage.js, src/lib/shipArt.js and
// src/lib/firebaseStorage.js for the app's side of this).
//
//   node scripts/migrate-storage.mjs --dry-run
//   node scripts/migrate-storage.mjs                    # migrate ?sector=default
//   node scripts/migrate-storage.mjs --sector=campaign-two
//
// An entry whose image is already a URL (not a data: URI), or an art entry
// that already has `svgUrl` instead of `svg`, is left alone — safe to run
// more than once. Nothing already in the database is deleted; the uploaded
// Storage objects are new, separate data alongside it.
//
// Requires storage.rules to be deployed first (`firebase deploy --only storage`)
// — the upload calls below need Storage to exist and its rules to allow an
// authenticated write, same as any other write this script makes.
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
const BUCKET = envVar("VITE_FIREBASE_STORAGE_BUCKET");
if (!BUCKET) throw new Error("VITE_FIREBASE_STORAGE_BUCKET not found in .env.local or .env");

// Same anonymous sign-in the app uses (src/lib/firebase.js) — the database and
// storage rules both require auth != null to write. Reads stay public.
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

const dbUrl = (p, token) => `${BASE}/${p}.json${token ? `?auth=${token}` : ""}`;

async function dbReq(method, p, body) {
  const token = method === "GET" ? null : await ensureAuth();
  const res = await fetch(dbUrl(p, token), {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${p} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

// Firebase Storage's simple-upload REST endpoint. Returns a permanent download
// URL (with the object's download token attached) — the same shape
// getDownloadURL() produces client-side, so the app reads it identically.
async function uploadToStorage(objectPath, bodyBytes, contentType) {
  const token = await ensureAuth();
  const encodedPath = encodeURIComponent(objectPath);
  const res = await fetch(
    `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?uploadType=media&name=${encodedPath}`,
    { method: "POST", headers: { Authorization: `Firebase ${token}`, "Content-Type": contentType }, body: bodyBytes },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`upload ${objectPath} -> ${res.status} ${JSON.stringify(data)}`);
  const downloadToken = (data.downloadTokens || "").split(",")[0];
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encodedPath}?alt=media&token=${downloadToken}`;
}

function dataUriToBytes(dataUri) {
  const m = /^data:([^;]+);base64,([\s\S]*)$/.exec(dataUri);
  if (!m) throw new Error("not a base64 data: URI");
  return { bytes: Buffer.from(m[2], "base64"), contentType: m[1] };
}

async function main() {
  console.log(`sector : ${SECTOR}`);
  console.log(`bucket : ${BUCKET}`);
  console.log(DRY ? "mode   : dry run — nothing will be written\n" : "mode   : live\n");

  const wiki = (await dbReq("GET", `sectors/${SECTOR}/wiki`)) || {};
  const art = (await dbReq("GET", `sectors/${SECTOR}/art`)) || {};

  let wikiDone = 0, wikiSkipped = 0, artDone = 0, artSkipped = 0;

  for (const [id, entry] of Object.entries(wiki)) {
    const image = entry && entry.image;
    if (!image || typeof image !== "string" || !image.startsWith("data:")) { wikiSkipped++; continue; }
    console.log(`wiki/${id}: uploading image (${(image.length / 1024).toFixed(0)} KB data URI)`);
    if (!DRY) {
      const { bytes, contentType } = dataUriToBytes(image);
      const url = await uploadToStorage(`wikiImages/${SECTOR}/${id}.webp`, bytes, contentType);
      await dbReq("PATCH", `sectors/${SECTOR}/wiki/${id}`, { image: url });
    }
    wikiDone++;
  }

  for (const [id, entry] of Object.entries(art)) {
    const svg = entry && entry.svg;
    if (!svg || typeof svg !== "string") { artSkipped++; continue; }
    console.log(`art/${id}: uploading svg (${(svg.length / 1024).toFixed(1)} KB)`);
    if (!DRY) {
      const url = await uploadToStorage(`art/${SECTOR}/${id}.svg`, Buffer.from(svg, "utf8"), "image/svg+xml");
      await dbReq("PATCH", `sectors/${SECTOR}/art/${id}`, { svg: null, svgUrl: url });
    }
    artDone++;
  }

  console.log(`\nwiki: ${wikiDone} migrated, ${wikiSkipped} already fine`);
  console.log(`art : ${artDone} migrated, ${artSkipped} already fine`);
  console.log(DRY ? "\nDry run — nothing written." : "\nDone.");
}

main().catch((e) => { console.error(`\nmigration failed: ${e.message}`); process.exitCode = 1; });
