// Fleet composition model.
//
// A fleet's `ships` are all carriers — the only vessels tracked by name. The
// craft they fight with are tracked in bulk as squadrons in the carrier's
// hangar: a count of one model, e.g. 24 x "v1_fighters", 13 x "b4_bombers".
//
// Carriers saved before the hangar existed have no `squadrons` field at all, so
// every read goes through squadronsOf rather than touching `.squadrons` direct.
export const squadronsOf = (carrier) => (carrier && carrier.squadrons) || [];

// Counts are user-typed, so treat anything non-numeric as zero rather than
// letting a stray NaN poison a fleet-wide total.
export const craftInCarrier = (carrier) =>
  squadronsOf(carrier).reduce((n, sq) => n + (Number(sq.count) || 0), 0);

export const craftInFleet = (fleet) =>
  ((fleet && fleet.ships) || []).reduce((n, c) => n + craftInCarrier(c), 0);

// Rewrite one carrier's squadron list, returning a new fleet array. fleet ->
// carrier -> squadron is deep enough that every add/patch/remove would otherwise
// repeat this same three-level map; untouched fleets and carriers keep their
// identity so React skips re-rendering them.
export function withSquadrons(fleets, fleetId, shipId, fn) {
  return fleets.map((f) => (f.id !== fleetId ? f : {
    ...f,
    ships: f.ships.map((s) => (s.id !== shipId ? s : { ...s, squadrons: fn(squadronsOf(s)) })),
  }));
}

// Distinct squadron model names already flying somewhere in the sector. Feeds
// the model field's autocomplete so a model can be reused without being retyped
// — and, more to the point, without being mistyped into a near-duplicate.
export function knownModels(fleets) {
  const seen = new Set();
  for (const f of fleets || []) {
    for (const c of f.ships || []) {
      for (const sq of squadronsOf(c)) {
        const m = (sq.model || "").trim();
        if (m) seen.add(m);
      }
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

// Commit craft to a squadron mission: decrement each named squadron by its
// detachment's count. Counts are clamped to what was available when the
// mission was built (see App.jsx submitMission), so this never goes negative.
export function commitDetachments(fleets, fleetId, detachments) {
  return fleets.map((f) => (f.id !== fleetId ? f : {
    ...f,
    ships: f.ships.map((s) => {
      const dets = detachments.filter((d) => d.shipId === s.id);
      if (dets.length === 0) return s;
      return { ...s, squadrons: squadronsOf(s).map((sq) => {
        const d = dets.find((x) => x.squadronId === sq.id);
        return d ? { ...sq, count: Math.max(0, (Number(sq.count) || 0) - d.count) } : sq;
      }) };
    }),
  }));
}

// Return craft from a mission — either survivors after a resolved strike, or
// the full detachment if the request is withdrawn before resolution. Adds each
// detachment's count back onto its source squadron, or recreates the squadron
// (by the model it flew as) if the hangar slot was removed while it was away.
export function returnDetachments(fleets, fleetId, detachments) {
  return fleets.map((f) => (f.id !== fleetId ? f : {
    ...f,
    ships: f.ships.map((s) => {
      const backs = detachments.filter((d) => d.shipId === s.id && d.count > 0);
      if (backs.length === 0) return s;
      let squadrons = squadronsOf(s);
      for (const d of backs) {
        const idx = squadrons.findIndex((q) => q.id === d.squadronId);
        squadrons = idx === -1
          ? [...squadrons, { id: d.squadronId, count: d.count, model: d.model }]
          : squadrons.map((q, i) => (i === idx ? { ...q, count: (Number(q.count) || 0) + d.count } : q));
      }
      return { ...s, squadrons };
    }),
  }));
}

// A carrier's optional `model` is its design ("Gorb-class Carrier") — what sister
// ships share and what the art library matches on. Distinct from the old `cls`
// field, which sorted hulls into Frigate/Cruiser/… and became meaningless once
// every named ship was a carrier.
export function knownCarrierModels(fleets) {
  const seen = new Set();
  for (const f of fleets || []) {
    for (const c of f.ships || []) {
      const m = (c.model || "").trim();
      if (m) seen.add(m);
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}
