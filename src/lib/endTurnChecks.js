// End-of-turn checks (GM Tools → End of Turn Checks). Today the only kind is the
// Ossite Surplus check: one per system carrying the ossite trait, rolled 2d6 and
// passing on 8+ to hand its controlling faction +1 Ossite Surplus when the turn
// advances. The pure bits live here so both App.jsx (which owns the state and
// applies awards in nextTurn) and EndTurnChecksPanel (which displays and lets the
// GM re-roll or override) agree on how a roll is made and read.

export const OSSITE_RESOURCE_NAME = "Ossite Surplus";

// A single 2d6 roll behind a check.
export const roll2d6 = () => ({ d1: 1 + Math.floor(Math.random() * 6), d2: 1 + Math.floor(Math.random() * 6) });

// The two dice summed — 0 if a check somehow has no roll yet.
export const checkTotal = (c) => (((c && c.dice && c.dice.d1) || 0) + ((c && c.dice && c.dice.d2) || 0));

// Whether a check passed: the GM's manual override wins, otherwise the roll
// passes on 8+.
export const ossiteCheckPassed = (c) => (c && c.override
  ? c.override === "success"
  : checkTotal(c) >= 8);
