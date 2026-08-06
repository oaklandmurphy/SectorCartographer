// Campaign chronicle exporter — turns the resolved events in a sector into a
// clean, turn-by-turn Markdown log you can hand to Claude (claude.ai chat) and
// ask it to summarize, recap, or write story beats from.
//
// It is read-only and touches nothing in the app: the database rules make
// sector reads public (see database.rules.json), so this just does anonymous
// HTTPS GETs against the RTDB REST API — no sign-in, no writes, no risk to the
// live game. Nothing here affects Claude Code either.
//
// What it pulls (per sector):
//   archivedActions + actions      GM rulings on faction/agent action requests
//   archivedMissions + missions    squadron mission resolutions
//   factions                       to turn factionId into a readable name
//   turn/number                    to stamp events that haven't been archived
//
// Only *resolved* events make it in — a resolution is where the story is (the
// GM's narrative text, the dice, success/failure). Pending requests are skipped.
//
//   node scripts/story-log.mjs                       # sector "default" -> story-log.md
//   node scripts/story-log.mjs --sector=campaign-two
//   node scripts/story-log.mjs --turns=3             # only the last 3 turns
//   node scripts/story-log.mjs --out=recap.md
//   node scripts/story-log.mjs --stdout              # print instead of writing a file
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

const SECTOR = opt("sector", "default").replace(/[.#$/[\]]/g, "-");
const LAST_N = Number(opt("turns", "0")) || 0; // 0 = all turns
const TO_STDOUT = flag("stdout");
const OUT = opt("out", "story-log.md");

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

async function get(pathname) {
  const res = await fetch(`${BASE}/${pathname}.json`);
  const text = await res.text();
  if (!res.ok) throw new Error(`GET ${pathname} -> ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

const asList = (node) => (node && typeof node === "object" ? Object.values(node) : []);
const when = (ms) => (ms ? new Date(ms).toISOString().slice(0, 10) : "");

async function main() {
  const [factions, turnNode, archivedActions, actions, archivedMissions, missions] =
    await Promise.all([
      get(`sectors/${SECTOR}/factions`),
      get(`sectors/${SECTOR}/turn`),
      get(`sectors/${SECTOR}/archivedActions`),
      get(`sectors/${SECTOR}/actions`),
      get(`sectors/${SECTOR}/archivedMissions`),
      get(`sectors/${SECTOR}/missions`),
    ]);

  if (!factions && !actions && !missions && !archivedActions && !archivedMissions) {
    throw new Error(`sectors/${SECTOR} has no data — check the --sector id (this one is "${SECTOR}")`);
  }

  const currentTurn = Number(turnNode?.number) || 0;
  const factionName = (id) => (id && factions?.[id]?.name) || null;

  // Who took the action: the role that filed it reads best ("House of Dorn"),
  // falling back to the owning faction's name, then the raw id.
  const actor = (e) =>
    e?.createdBy?.roleName || factionName(e?.factionId) || e?.factionId || "Unknown";

  // A resolved event, live or archived, normalized into one shape. Live events
  // in the open turn aren't stamped with a turn number yet, so they inherit the
  // sector's current turn.
  const norm = (e, kind) => {
    const r = e?.resolution;
    if (!e || e.status !== "resolved" || !r) return null;
    return {
      kind,
      turn: Number.isFinite(Number(e.turn)) ? Number(e.turn) : currentTurn,
      actor: actor(e),
      request: (e.text || "").trim(),
      outcome: r.outcome || null,          // actions: success / failure / ...
      roll: r.roll ?? null,
      total: r.total ?? null,
      ratio: r.ratioLabel || null,         // missions: force ratio
      casualties: r.actualCasualtyPct ?? r.casualtyPct ?? null,
      narrative: (r.text || "").trim(),
      at: e.resolvedAt || e.turnEndedAt || e.createdAt || 0,
    };
  };

  const events = [
    ...asList(archivedActions).map((e) => norm(e, "action")),
    ...asList(actions).map((e) => norm(e, "action")),
    ...asList(archivedMissions).map((e) => norm(e, "mission")),
    ...asList(missions).map((e) => norm(e, "mission")),
  ].filter(Boolean);

  if (events.length === 0) {
    throw new Error(`no resolved events found in sector "${SECTOR}" — nothing to chronicle yet`);
  }

  // Group by turn, newest turn first, events within a turn in chronological order.
  const byTurn = new Map();
  for (const ev of events) {
    if (!byTurn.has(ev.turn)) byTurn.set(ev.turn, []);
    byTurn.get(ev.turn).push(ev);
  }
  let turns = [...byTurn.keys()].sort((a, b) => b - a);
  if (LAST_N > 0) turns = turns.slice(0, LAST_N);

  const lines = [];
  lines.push(`# Sector chronicle — ${SECTOR}`);
  lines.push("");
  lines.push(
    `Resolved events through turn ${currentTurn}. Each entry is a GM ruling: who acted, ` +
    `what they attempted, how it resolved, and the narrative outcome. Use this to recap ` +
    `the campaign, track a faction's arc, or draft the next turn's story beats.`
  );
  lines.push("");

  for (const t of turns) {
    const list = byTurn.get(t).sort((a, b) => a.at - b.at);
    lines.push(`## Turn ${t}${t === currentTurn ? " (current)" : ""}`);
    lines.push("");
    for (const ev of list) {
      const tag = ev.kind === "mission" ? "Squadron mission" : "Action";
      const bits = [];
      if (ev.outcome) bits.push(ev.outcome);
      if (ev.roll != null) bits.push(`roll ${ev.roll}${ev.total != null ? ` → ${ev.total}` : ""}`);
      if (ev.ratio) bits.push(`${ev.ratio} odds`);
      if (ev.casualties != null) bits.push(`${ev.casualties}% losses`);
      const meta = bits.length ? ` _(${bits.join(", ")})_` : "";
      lines.push(`### ${ev.actor} — ${tag}${meta}`);
      const dateStr = when(ev.at);
      if (dateStr) lines.push(`*${dateStr}*`);
      lines.push("");
      if (ev.request) lines.push(`**Attempted:** ${ev.request}`);
      lines.push("");
      if (ev.narrative) lines.push(ev.narrative);
      lines.push("");
    }
  }

  const out = lines.join("\n");
  if (TO_STDOUT) {
    process.stdout.write(out + "\n");
  } else {
    const dest = path.isAbsolute(OUT) ? OUT : path.join(root, OUT);
    fs.writeFileSync(dest, out, "utf8");
    console.error(
      `Wrote ${events.length} events across ${turns.length} turn(s) to ${dest}\n` +
      `Upload that file into a Claude chat and ask it to summarize the campaign.`
    );
  }
}

main().catch((e) => { console.error(`story-log failed: ${e.message}`); process.exitCode = 1; });
