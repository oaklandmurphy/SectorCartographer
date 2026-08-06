// Strike-craft replenishment: topping up a carrier's squadrons while its fleet
// sits in friendly space, within a per-system-per-turn budget.
//
// The GM stages amounts during a turn (a `replenishments` record per fleet, its
// `lines` a list of { shipId, model, count }); Next Turn applies them to the
// hangars and reveals the record to the fleet's faction as an Updates notice.
// Everything here is a pure data transform — no Firebase, same spirit as
// carriers.js / fleets.js — so App.jsx's mutators stay thin and this stays
// testable.
import { uid } from "../utils/id.js";
import { squadronsOf } from "./carriers.js";
import { friendlyFactionIds } from "./visibility.js";

// A system replenishes up to this many strike craft per turn, total across every
// fleet in it — 25 if it has a shipyard, 12 otherwise.
export const BASE_CAP = 12;
export const SHIPYARD_CAP = 25;

// A shipyard isn't a first-class field — it's any status marker the GM labeled as
// one. Matched loosely so "Bord Shipyards" / "Naval shipyard" all count.
export function systemHasShipyard(system) {
  return ((system && system.markers) || []).some((m) => /shipyard/i.test(m.label || ""));
}

export const systemCap = (system) => (systemHasShipyard(system) ? SHIPYARD_CAP : BASE_CAP);

// The system a fleet may replenish in, or null. A carrier can only be topped up
// while its fleet sits in a system owned by its own faction or by one allied/
// vassaled to it — the same own/ally/vassal set used for fleet-position
// visibility (friendlyFactionIds, either direction). A fleet in transit (no
// systemId) or in neutral/enemy space is not eligible.
export function eligibleSystemFor(fleet, systems, relations) {
  if (!fleet || !fleet.systemId) return null;
  const system = (systems || []).find((s) => s.id === fleet.systemId);
  if (!system) return null;
  return friendlyFactionIds(fleet.factionId, relations).has(system.factionId) ? system : null;
}

// Deterministic record id: one staging record per fleet per turn, so a repeated
// stage upserts the same node rather than piling up duplicates.
export const recordId = (turn, fleetId) => `rpl_${turn || 0}_${fleetId}`;

// Counts are clamped non-negative at write time, but treat anything odd as zero
// rather than letting it poison a budget total.
export const lineTotal = (record) =>
  ((record && record.lines) || []).reduce((n, l) => n + (Number(l.count) || 0), 0);

// How many craft are already staged in a system this turn — the shared pool every
// fleet in it draws from. Only the current turn's records count; revealed records
// from past turns are history.
export function systemStagedTotal(records, turn, systemId) {
  return (records || [])
    .filter((r) => (r.turn || 0) === turn && r.systemId === systemId && !r.revealedAt)
    .reduce((n, r) => n + lineTotal(r), 0);
}

// The amount currently staged for one carrier + model within a record (0 if none).
export function stagedFor(record, shipId, model) {
  const line = ((record && record.lines) || []).find((l) => l.shipId === shipId && l.model === model);
  return line ? (Number(line.count) || 0) : 0;
}

// Adjust one carrier+model line inside a fleet's record by `delta`, keeping the
// record's own invariants: counts never go below zero, empty lines are dropped,
// and a record with no lines left is removed entirely. `cap`/`systemTotal` bound
// an *increase* so the shared system pool is never overdrawn — `systemTotal` is
// everything staged in the system this turn including this line's current value,
// `cap` the system's limit (12, or 25 with a shipyard). Returns a new records
// array. Pure — the caller supplies systemId/factionId/turn captured off the live
// fleet so this needs no lookups.
export function adjustLine(records, { turn, fleetId, systemId, factionId, shipId, model, delta, cap, systemTotal }) {
  const id = recordId(turn, fleetId);
  const existing = (records || []).find((r) => r.id === id);
  const lines = existing ? existing.lines || [] : [];
  const current = stagedFor(existing, shipId, model);
  // Room left in the shared pool for this line = cap minus everything else staged
  // in the system. Bounds an increase; a decrease is always allowed.
  const roomInPool = Math.max(current, (cap || 0) - ((systemTotal || 0) - current));
  const next = Math.max(0, delta > 0 ? Math.min(current + delta, roomInPool) : current + delta);
  if (next === current) return records || [];

  const rest = lines.filter((l) => !(l.shipId === shipId && l.model === model));
  const nextLines = next > 0 ? [...rest, { shipId, model, count: next }] : rest;
  const withoutRecord = (records || []).filter((r) => r.id !== id);
  if (nextLines.length === 0) return withoutRecord; // nothing staged for this fleet anymore
  const record = { id, turn, fleetId, systemId, factionId, lines: nextLines, revealedAt: null };
  return [...withoutRecord, record];
}

// Apply staged records to the fleets: for each line, find its fleet + carrier and
// bump the squadron of that model, or spin up a new squadron if the carrier
// doesn't fly it yet. Defensive against a carrier transferred/removed since
// staging — such lines are simply skipped. Untouched fleets keep their identity.
export function applyReplenishments(fleets, records) {
  const byFleet = new Map();
  for (const r of records || []) {
    for (const l of r.lines || []) {
      const count = Number(l.count) || 0;
      if (count <= 0) continue;
      if (!byFleet.has(r.fleetId)) byFleet.set(r.fleetId, []);
      byFleet.get(r.fleetId).push({ shipId: l.shipId, model: l.model, count });
    }
  }
  if (byFleet.size === 0) return fleets;
  return (fleets || []).map((f) => {
    const adds = byFleet.get(f.id);
    if (!adds) return f;
    return {
      ...f,
      ships: f.ships.map((s) => {
        const mine = adds.filter((a) => a.shipId === s.id);
        if (mine.length === 0) return s;
        let squadrons = squadronsOf(s);
        for (const a of mine) {
          const idx = squadrons.findIndex((q) => (q.model || "") === (a.model || ""));
          squadrons = idx === -1
            ? [...squadrons, { id: uid("sqn"), count: a.count, model: a.model }]
            : squadrons.map((q, i) => (i === idx ? { ...q, count: (Number(q.count) || 0) + a.count } : q));
        }
        return { ...s, squadrons };
      }),
    };
  });
}

// A short "+6 Glub-Fighter, +3 Boon-Bomber" summary of a record's lines, for the
// player-facing Updates card. Aggregates by model so two lines of the same model
// on different carriers read as one figure.
export function replenishmentSummary(record) {
  const byModel = new Map();
  for (const l of (record && record.lines) || []) {
    const count = Number(l.count) || 0;
    if (count <= 0) continue;
    const model = l.model || "craft";
    byModel.set(model, (byModel.get(model) || 0) + count);
  }
  return [...byModel.entries()].map(([model, count]) => `+${count} ${model}`).join(", ");
}
