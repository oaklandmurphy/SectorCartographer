// Movement-rule validation for committed move orders, run just before the GM
// is allowed to advance the turn (see GMToolsView's Next Turn button).
//
//   - An agent may move through up to 3 systems in a turn, or 4 if it starts
//     the turn in a system with a jump gate.
//   - A fleet may move through up to 1 system in a turn, or 2 if it starts
//     the turn in a system with a jump gate.
//   - Either way, every step of the route must cross a `links` edge — no
//     skipping past an unlinked system.
//
// `orders`/`agents`/`fleets`/`systems`/`links` are the same collections
// App.jsx's nextTurn() already reads; this only inspects them, never mutates.

export function isAdjacent(links, a, b) {
  return (links || []).some((l) => (l.a === a && l.b === b) || (l.a === b && l.b === a));
}

export function maxHopsFor(pieceType, startSystem) {
  const gate = !!(startSystem && startSystem.hasJumpGate);
  if (pieceType === "fleet") return gate ? 2 : 1;
  return gate ? 4 : 3; // agent
}

// Every issue with one order's path, given where its piece currently sits.
// An unplaced piece (no systemId yet) has nothing to validate against, so it
// always comes back clean.
export function movementIssues({ pieceType, path, currentSystemId, systems, links }) {
  const issues = [];
  if (!currentSystemId) return issues;
  const nameOf = (id) => (systems.find((s) => s.id === id) || {}).name || "an unknown system";
  const stops = path || [];

  const chain = [currentSystemId, ...stops];
  for (let i = 0; i < chain.length - 1; i++) {
    const a = chain[i], b = chain[i + 1];
    if (a === b) { issues.push(`Route stays at ${nameOf(a)} instead of advancing.`); continue; }
    if (!isAdjacent(links, a, b)) issues.push(`${nameOf(a)} and ${nameOf(b)} are not linked — the route breaks the chain.`);
  }

  const startSystem = systems.find((s) => s.id === currentSystemId);
  const max = maxHopsFor(pieceType, startSystem);
  if (stops.length > max) {
    issues.push(`Route covers ${stops.length} system${stops.length === 1 ? "" : "s"}, more than the ${max} a `
      + `${pieceType} may move${startSystem?.hasJumpGate ? " even from a jump gate" : " without a jump gate"} this turn.`);
  }
  return issues;
}

// Among committed, non-empty orders, the single one that will actually move each
// piece. Most pieces have just their owning faction's own order, but an ally or
// vassal can file a *suggested* move for a friendly fleet; when the GM ticks one
// (order.accepted), that suggestion overrides the owner's own order. An accepted
// suggestion wins; otherwise the owner's order stands. An un-accepted suggestion
// never moves anything on its own — it's only ever a proposal for the GM.
export function effectiveMoveOrders(orders) {
  const ready = (orders || []).filter((o) => o.committed && o.path && o.path.length > 0);
  const owner = new Map();    // "type:id" -> the piece's own order
  const accepted = new Map(); // "type:id" -> an accepted suggestion for it
  for (const o of ready) {
    const key = `${o.pieceType}:${o.pieceId}`;
    if (o.suggestion) { if (o.accepted) accepted.set(key, o); }
    else owner.set(key, o);
  }
  const out = [];
  for (const key of new Set([...owner.keys(), ...accepted.keys()])) {
    out.push(accepted.get(key) || owner.get(key));
  }
  return out;
}

// Scan every move order that will actually be applied (see effectiveMoveOrders —
// one per piece, an accepted suggestion overriding the owner's) and report the
// ones that break the movement rules: { order, piece, pieceType, issues }[],
// empty if all clear.
export function collectMovementViolations({ orders, agents, fleets, systems, links }) {
  const out = [];
  for (const order of effectiveMoveOrders(orders)) {
    const pool = order.pieceType === "fleet" ? fleets : agents;
    const piece = (pool || []).find((p) => p.id === order.pieceId);
    if (!piece) continue;
    const issues = movementIssues({
      pieceType: order.pieceType, path: order.path, currentSystemId: piece.systemId, systems, links,
    });
    if (issues.length > 0) out.push({ order, piece, pieceType: order.pieceType, issues });
  }
  return out;
}
