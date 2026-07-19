import { useState } from "react";
import { Dices, Crosshair } from "lucide-react";
import { T, inputStyle, selStyle, lbl, cut } from "../theme.js";
import {
  RATIO_COLS, EVEN_RATIO_INDEX, ROLLS, MIN_SHIFT, MAX_SHIFT,
  successGrade, casualtyPct, GRADE_COLORS, gradeColor,
  rollTwoD6, nearestRatioIndex, isBeyondTable,
} from "../lib/missionOdds.js";
import Btn from "./ui/Btn.jsx";

const clampInt = (v, lo, hi) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
};

// A number field holds the raw text you typed, not a clamped number: clamping on
// every keystroke would rewrite the box under the cursor — typing "10" into a
// 2..12 field can't pass through "1" and would land on 12. So the text is stored,
// the clamped number is computed from it, and blur normalizes the box so it never
// rests on "-" or a half-typed value.
function useTypedNumber(initial, lo, hi) {
  const [text, setText] = useState(String(initial));
  const value = clampInt(text, lo, hi);
  return {
    value,
    props: {
      value: text,
      onChange: (e) => setText(e.target.value),
      onBlur: () => setText(String(value)),
      min: Number.isFinite(lo) ? lo : undefined,
      max: Number.isFinite(hi) ? hi : undefined,
    },
    set: (n) => setText(String(n)),
  };
}

// The mission odds table. A scratch pad, not a view of the sector: every number
// here is typed in by hand and none of it is saved (see lib/missionOdds.js).
// Bouncing to the map and back resets it, which is the honest behaviour for a
// tool whose state means nothing once you've read the answer off it.
export default function OddsView({ isMobile }) {
  const mine = useTypedNumber(10, 0, Infinity);
  const theirs = useTypedNumber(10, 0, Infinity);
  const outShift = useTypedNumber(0, MIN_SHIFT, MAX_SHIFT);
  const casShift = useTypedNumber(0, MIN_SHIFT, MAX_SHIFT);
  const roll = useTypedNumber(7, 2, 12);
  const [ratioIdx, setRatioIdx] = useState(EVEN_RATIO_INDEX);

  const ratio = RATIO_COLS[ratioIdx];

  // Typing fleet sizes snaps the ratio column; picking a column by hand then
  // overrides it. Both directions stay open — you rarely have a headcount for an
  // orbital bombardment, but you always have one for a fleet action.
  const snapped = nearestRatioIndex(mine.value, theirs.value);
  const beyond = isBeyondTable(mine.value, theirs.value);
  const onFleetChange = (which, e) => {
    which.props.onChange(e);
    const m = which === mine ? clampInt(e.target.value, 0, Infinity) : mine.value;
    const t = which === theirs ? clampInt(e.target.value, 0, Infinity) : theirs.value;
    const idx = nearestRatioIndex(m, t);
    if (idx !== null) setRatioIdx(idx);
  };

  const outE = roll.value + ratio.shift + outShift.value;
  const casE = roll.value + ratio.shift + casShift.value;
  const grade = successGrade(outE);
  const cas = casualtyPct(casE);

  const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);

  /* ------------------------------------------------ one labelled control */
  const field = (label, node) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={lbl}>{label}</span>
      {node}
    </div>
  );
  const num = (fld, extra = {}) => (
    <input className="mono" type="number" step="1" {...fld.props} {...extra}
      style={{ ...inputStyle, width: isMobile ? 68 : 82, textAlign: "right" }} />
  );

  /* ------------------------------------------------ one figure in the readout */
  const readout = (caption, value, color, detail) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 96 }}>
      <span style={lbl}>{caption}</span>
      <span className="mono" style={{ fontSize: isMobile ? 22 : 28, fontWeight: 700, color, lineHeight: 1.1 }}>
        {value}
      </span>
      {detail && <span style={{ fontSize: 10.5, color: T.faint, fontFamily: "'Oswald', sans-serif" }}>{detail}</span>}
    </div>
  );

  return (
    <div style={{ flex: 1, overflow: "auto", background: T.void, padding: isMobile ? 10 : 16 }}>
      <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 12 }}>

        {/* ---------------------------------------- what this is */}
        <div>
          <div className="stencil" style={{ fontSize: 16, letterSpacing: ".06em", color: T.text,
            display: "flex", alignItems: "center", gap: 7 }}>
            <Crosshair size={15} color={T.accent} /> MISSION ODDS
          </div>
          <div style={{ fontSize: 11, color: T.faint, marginTop: 3, fontFamily: "'Oswald', sans-serif", letterSpacing: ".02em" }}>
            E = 2d6 + ratio shift + mission shift · outcome and casualties shift independently · nothing here is saved
          </div>
        </div>

        {/* ---------------------------------------- inputs */}
        <div style={{ background: T.panel, border: `1px solid ${T.line}`, ...cut(10), padding: isMobile ? 10 : 14,
          display: "flex", flexWrap: "wrap", gap: isMobile ? 10 : 16, alignItems: "flex-end" }}>
          {field("Your vessels", num(mine, { onChange: (e) => onFleetChange(mine, e) }))}
          {field("Enemy vessels", num(theirs, { onChange: (e) => onFleetChange(theirs, e) }))}
          {field("Force ratio", (
            <select value={ratioIdx} onChange={(e) => setRatioIdx(Number(e.target.value))}
              className="mono" style={{ ...selStyle, width: isMobile ? 118 : 132 }}>
              {RATIO_COLS.map((c, i) => (
                <option key={c.label} value={i}>{c.label} ({sign(c.shift)})</option>
              ))}
            </select>
          ))}
          {field("Outcome shift", num(outShift))}
          {field("Casualty shift", num(casShift))}
          {field("2d6 roll", num(roll))}
          <Btn kind="primary" onClick={() => roll.set(rollTwoD6())} title="Roll 2d6 for me" style={{ padding: "7px 12px" }}>
            <Dices size={14} /> Roll 2d6
          </Btn>
        </div>

        {/* ---------------------------------------- how the typed fleet sizes landed on a column */}
        {snapped !== null && (
          <div style={{ fontSize: 11, color: T.faint, fontFamily: "'Oswald', sans-serif", letterSpacing: ".02em" }}>
            {mine.value}:{theirs.value} → nearest column{" "}
            <b style={{ color: T.mut }}>{RATIO_COLS[snapped].label}</b> ({sign(RATIO_COLS[snapped].shift)})
            {beyond && <span style={{ color: T.amber }}> · beyond the table, clamped to the end column</span>}
            {snapped !== ratioIdx && (
              <span style={{ color: T.amber }}> · overridden to {ratio.label} ({sign(ratio.shift)})</span>
            )}
          </div>
        )}

        {/* ---------------------------------------- the answer */}
        <div style={{ background: T.panel, border: `1px solid ${T.line}`, ...cut(10), padding: isMobile ? 12 : 16,
          display: "flex", flexWrap: "wrap", gap: isMobile ? 18 : 34, alignItems: "flex-start" }}>
          {readout("E · outcome", outE, T.text, `${roll.value} roll ${sign(ratio.shift)} ratio ${sign(outShift.value)} mission`)}
          {readout("E · casualties", casE, T.text, `${roll.value} roll ${sign(ratio.shift)} ratio ${sign(casShift.value)} mission`)}
          {readout("Success", `${grade}/5`, gradeColor(grade))}
          {readout("Casualties", `${cas}%`, T.text)}
        </div>

        {/* ---------------------------------------- the whole table, with the current cell picked out */}
        <div style={{ border: `1px solid ${T.line}`, ...cut(10), overflowX: "auto", background: T.panel }}>
          <table className="mono" style={{ borderCollapse: "collapse", fontSize: 10.5, width: "100%" }}>
            <thead>
              <tr>
                <th style={headCell}>2d6</th>
                {RATIO_COLS.map((c, i) => (
                  <th key={c.label} style={{ ...headCell, color: i === ratioIdx ? T.accent : T.mut }}>
                    {c.label}
                    <div style={{ fontSize: 9, color: T.faint, fontWeight: 400 }}>{sign(c.shift)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {ROLLS.map((r) => (
                <tr key={r}>
                  <td style={{ ...headCell, color: r === roll.value ? T.accent : T.mut }}>{r}</td>
                  {RATIO_COLS.map((c, i) => {
                    const g = successGrade(r + c.shift + outShift.value);
                    const cp = casualtyPct(r + c.shift + casShift.value);
                    const here = i === ratioIdx && r === roll.value;
                    return (
                      <td key={c.label}
                        style={{ border: `1px solid ${T.line}`, padding: "3px 5px", textAlign: "center",
                          whiteSpace: "nowrap", background: here ? "rgba(159,194,58,.12)" : "transparent",
                          outline: here ? `2px solid ${T.accent}` : "none", outlineOffset: -2 }}>
                        <div style={{ color: gradeColor(g), fontWeight: 700 }}>{g}/5</div>
                        <div style={{ color: T.faint, fontSize: 9.5 }}>{cp}%</div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* ---------------------------------------- legend: only the ramp's direction, since every cell prints its grade */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", padding: "2px 2px 10px" }}>
          <span style={lbl}>Success</span>
          {GRADE_COLORS.map((color, g) => (
            <span key={g} style={{ display: "flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 9, height: 9, background: color, flexShrink: 0, ...cut(2) }} />
              <span className="mono" style={{ fontSize: 10.5, color: T.mut }}>{g}</span>
            </span>
          ))}
          <span style={{ fontSize: 10.5, color: T.faint, fontFamily: "'Oswald', sans-serif", letterSpacing: ".02em" }}>
            worse → better · the second figure in each cell is casualties
          </span>
        </div>
      </div>
    </div>
  );
}

const headCell = {
  background: T.panel3, border: `1px solid ${T.line}`, padding: "4px 6px", textAlign: "center",
  fontWeight: 700, fontSize: 10.5, whiteSpace: "nowrap", color: T.mut,
};
