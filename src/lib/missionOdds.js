// The mission odds table — a standalone dice-reference tool.
//
// It is deliberately NOT wired to the sector: no fleet, carrier or squadron
// feeds it, and nothing it computes is saved. You type the numbers in and read
// the result off, the same way you would with a table in a rulebook. Keeping it
// unattached is the point — the GM resolves engagements the map doesn't model
// (boarding actions, ground assaults, a raid on something that isn't a fleet).
//
// The whole model is one number, E:
//
//   E = 2d6 + force-ratio shift + the relevant mission shift
//
// Outcome and casualties each get their own mission shift and so each get their
// own E, which is why a battle can be won badly or lost cheaply. E maps to a
// success grade (0–5) via successGrade, and to a casualty percentage via
// casualtyPct — two separate step functions, not one curve read twice.

// The table's columns: your force against theirs, and what that lends to E.
// `ratio` is the column as a number, used to snap a pair of fleet sizes to the
// nearest column — see nearestRatioIndex.
export const RATIO_COLS = [
  { label: "1:4", shift: -6, ratio: 1 / 4 },
  { label: "1:3.5", shift: -5, ratio: 1 / 3.5 },
  { label: "1:3", shift: -4, ratio: 1 / 3 },
  { label: "1:2.5", shift: -3, ratio: 1 / 2.5 },
  { label: "1:2", shift: -2, ratio: 1 / 2 },
  { label: "1:1.5", shift: -1, ratio: 1 / 1.5 },
  { label: "1:1", shift: 0, ratio: 1 },
  { label: "1.5:1", shift: 1, ratio: 1.5 },
  { label: "2:1", shift: 2, ratio: 2 },
  { label: "2.5:1", shift: 3, ratio: 2.5 },
  { label: "3:1", shift: 4, ratio: 3 },
  { label: "3.5:1", shift: 5, ratio: 3.5 },
  { label: "4:1", shift: 6, ratio: 4 },
];

export const EVEN_RATIO_INDEX = RATIO_COLS.findIndex((c) => c.label === "1:1");

// every 2d6 result — the table's rows
export const ROLLS = Array.from({ length: 11 }, (_, i) => i + 2);

export const MIN_SHIFT = -12;
export const MAX_SHIFT = 12;

export function successGrade(E) {
  if (E <= 2) return 0;
  if (E <= 5) return 1;
  if (E <= 7) return 2;
  if (E <= 10) return 3;
  if (E <= 13) return 4;
  return 5;
}

export function casualtyPct(E) {
  if (E <= 0) return 100;
  if (E <= 2) return 90;
  if (E === 3) return 80;
  if (E === 4) return 70;
  if (E <= 6) return 60;
  if (E === 7) return 50;
  if (E <= 9) return 40;
  if (E <= 11) return 30;
  if (E <= 13) return 20;
  if (E <= 15) return 10;
  return 0;
}

// The grade ramp, worst to best, in the app's danger→amber→accent tokens. Two
// constraints, not taste: every step clears 4.5:1 against its panel so a grade is
// legible, not merely tinted; and adjacent steps sit close enough under
// deuteranopia that colour can't carry the value alone — so the numeral is printed
// in every cell and legend swatch. Colour finds the good region; the numeral is
// the answer.
export const GRADE_COLORS = ["#e5776a", "#e0904f", "#d9a83f", "#b9bf4a", "#9fc23a", "#c3e05a"];

export const gradeColor = (g) => GRADE_COLORS[g] || GRADE_COLORS[0];

export const rollTwoD6 = () =>
  1 + Math.floor(Math.random() * 6) + (1 + Math.floor(Math.random() * 6));

// Which column a raw "10 of mine vs 14 of theirs" belongs in.
//
// Nearest in *log* space, not linear: the columns are ratios, so 2:1 sits the
// same distance from 1:1 as 1:2 does, and picking by raw difference would drag
// everything toward the outnumbered end of the table.
export function nearestRatioIndex(mine, theirs) {
  if (!(mine > 0) || !(theirs > 0)) return null;
  const target = Math.log(mine / theirs);
  let best = 0;
  let bestDist = Infinity;
  RATIO_COLS.forEach((c, i) => {
    const dist = Math.abs(Math.log(c.ratio) - target);
    if (dist < bestDist) { bestDist = dist; best = i; }
  });
  return best;
}

// True when the two forces are further apart than the table's end columns can
// express — the snap still lands somewhere, but it's a floor/ceiling, not a fit.
export function isBeyondTable(mine, theirs) {
  if (!(mine > 0) || !(theirs > 0)) return false;
  const r = mine / theirs;
  return r < RATIO_COLS[0].ratio || r > RATIO_COLS[RATIO_COLS.length - 1].ratio;
}
