// Fleet-to-fleet transfers: splitting/combining carriers and squadrons
// between two fleets, or spinning off a brand-new one. Same spirit as
// carriers.js's withSquadrons/commitDetachments — pure fleets -> fleets
// transforms, so App.jsx's mutators stay thin setFleets(...) wrappers.
import { uid } from "../utils/id.js";
import { squadronsOf } from "./carriers.js";

// Every other fleet sharing this fleet's system + faction — the fleet
// transfer modal's "existing fleet" target choices. A fleet with no systemId
// (in transit) has no siblings to transfer to.
export function friendlyFleetsInSystem(fleets, systemId, factionId, excludeFleetId) {
  if (!systemId) return [];
  return (fleets || []).filter((f) =>
    f.id !== excludeFleetId && f.systemId === systemId && f.factionId === factionId);
}

// Move one or more whole carriers from one existing fleet to another. Carriers
// keep their id/squadrons intact — a relocation, not a copy.
export function moveShips(fleets, fromFleetId, toFleetId, shipIds) {
  let moved = [];
  const stripped = fleets.map((f) => {
    if (f.id !== fromFleetId) return f;
    moved = f.ships.filter((s) => shipIds.includes(s.id));
    return { ...f, ships: f.ships.filter((s) => !shipIds.includes(s.id)) };
  });
  if (moved.length === 0) return fleets;
  return stripped.map((f) => (f.id === toFleetId ? { ...f, ships: [...f.ships, ...moved] } : f));
}

// Move one squadron from its current carrier to a different carrier — the
// same fleet or a different one. Always relocates the whole squadron object;
// splitting a squadron's count is commitDetachments'/returnDetachments' job.
export function moveSquadron(fleets, fromFleetId, fromShipId, toFleetId, toShipId, squadronId) {
  const fromFleet = fleets.find((f) => f.id === fromFleetId);
  const fromShip = fromFleet && fromFleet.ships.find((s) => s.id === fromShipId);
  const squadron = fromShip && squadronsOf(fromShip).find((sq) => sq.id === squadronId);
  if (!squadron) return fleets;
  return fleets.map((f) => {
    if (f.id === fromFleetId && f.id === toFleetId) {
      return { ...f, ships: f.ships.map((s) => {
        if (s.id === fromShipId) return { ...s, squadrons: squadronsOf(s).filter((sq) => sq.id !== squadronId) };
        if (s.id === toShipId) return { ...s, squadrons: [...squadronsOf(s), squadron] };
        return s;
      }) };
    }
    if (f.id === fromFleetId) {
      return { ...f, ships: f.ships.map((s) => (s.id === fromShipId
        ? { ...s, squadrons: squadronsOf(s).filter((sq) => sq.id !== squadronId) } : s)) };
    }
    if (f.id === toFleetId) {
      return { ...f, ships: f.ships.map((s) => (s.id === toShipId
        ? { ...s, squadrons: [...squadronsOf(s), squadron] } : s)) };
    }
    return f;
  });
}

// Move a single vessel out of a squadron (a squadron is just a count of one
// model on a carrier, not a command unit) onto a different carrier — the
// same fleet or a different one. Merges into an existing squadron of the
// same model on the target carrier if there is one, otherwise creates a new
// one-vessel squadron there. The source squadron's count drops by one, and
// the squadron entry is dropped entirely if that empties it.
export function moveVessel(fleets, fromFleetId, fromShipId, toFleetId, toShipId, squadronId) {
  const fromFleet = fleets.find((f) => f.id === fromFleetId);
  const fromShip = fromFleet && fromFleet.ships.find((s) => s.id === fromShipId);
  const squadron = fromShip && squadronsOf(fromShip).find((sq) => sq.id === squadronId);
  const avail = squadron && (Number(squadron.count) || 0);
  if (!squadron || avail <= 0) return fleets;
  const model = squadron.model;
  const remaining = avail - 1;

  const stripFrom = (ships) => ships.map((s) => (s.id !== fromShipId ? s : {
    ...s,
    squadrons: remaining > 0
      ? squadronsOf(s).map((sq) => (sq.id === squadronId ? { ...sq, count: remaining } : sq))
      : squadronsOf(s).filter((sq) => sq.id !== squadronId),
  }));
  const addTo = (ships) => ships.map((s) => {
    if (s.id !== toShipId) return s;
    const existing = squadronsOf(s).find((sq) => sq.model === model);
    return { ...s, squadrons: existing
      ? squadronsOf(s).map((sq) => (sq === existing ? { ...sq, count: (Number(sq.count) || 0) + 1 } : sq))
      : [...squadronsOf(s), { id: uid("sqn"), count: 1, model }] };
  });

  return fleets.map((f) => {
    if (f.id === fromFleetId && f.id === toFleetId) return { ...f, ships: addTo(stripFrom(f.ships)) };
    if (f.id === fromFleetId) return { ...f, ships: stripFrom(f.ships) };
    if (f.id === toFleetId) return { ...f, ships: addTo(f.ships) };
    return f;
  });
}

// Drop any fleet left with zero carriers, but only among the given candidate
// ids (fleets just touched by a transfer) — never sweeps up an unrelated
// already-empty fleet elsewhere in the sector.
export function disbandEmptyFleets(fleets, candidateFleetIds) {
  return fleets.filter((f) => !(candidateFleetIds.includes(f.id) && f.ships.length === 0));
}

// A brand-new fleet at the source's system/faction, player-named, ready to
// receive the carrier(s) that spawned it. Mirrors addFleetCenter/
// deployFleetAt's fleet shape (App.jsx).
export function spawnFleet(sourceFleet, name) {
  return {
    id: uid("flt"),
    name: (name || "").trim() || "New Fleet",
    factionId: sourceFleet.factionId,
    systemId: sourceFleet.systemId,
    x: sourceFleet.x,
    y: sourceFleet.y,
    ships: [],
  };
}
