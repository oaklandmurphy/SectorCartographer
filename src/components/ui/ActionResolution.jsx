import { Check, X } from "lucide-react";
import { T, lbl } from "../../theme.js";

// The read-only view of a resolved action request's outcome, shared by the
// player's agent card and the GM's request queue so the two never drift. It
// renders the structured resolution the roll-resolution tool builds — the
// success/failure verdict, the roll (and dice faces if it was a 2d6), every
// modifier the GM applied with its value, and the GM's free-text ruling.
//
// Older requests may have stored `resolution` as a plain string; those still
// render as just that text, so nothing resolved before this change goes blank.
const OUTCOME_META = {
  success: { label: "Success", color: T.accent, good: true },
  autoSuccess: { label: "Auto Success", color: T.accent, good: true },
  failure: { label: "Failure", color: T.danger, good: false },
  autoFailure: { label: "Auto Failure", color: T.danger, good: false },
};
const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);

function Chip({ children, color }) {
  return (
    <span className="mono" style={{ display: "inline-flex", alignItems: "center", gap: 3,
      border: `1px solid ${color || T.line}`, borderRadius: 2, padding: "1px 6px",
      fontSize: 10.5, color: color || T.mut, background: color ? `${color}1f` : T.panel3 }}>
      {children}
    </span>
  );
}

export default function ActionResolution({ resolution }) {
  if (!resolution) return null;
  if (typeof resolution !== "object") {
    return (
      <div style={{ fontSize: 12.5, lineHeight: 1.6, color: T.mut, whiteSpace: "pre-wrap" }}>
        {String(resolution)}
      </div>
    );
  }

  const meta = OUTCOME_META[resolution.outcome] || { label: resolution.outcome || "Resolved", color: T.mut };
  const isAuto = resolution.outcome === "autoSuccess" || resolution.outcome === "autoFailure";
  const mods = resolution.mods || [];

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, borderRadius: 2,
          padding: "2px 8px", fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 700,
          letterSpacing: ".05em", textTransform: "uppercase",
          border: `1px solid ${meta.color}`, color: meta.color, background: `${meta.color}22` }}>
          {meta.good ? <Check size={12} /> : <X size={12} />}{meta.label}
        </span>
        {!isAuto && resolution.roll != null && (
          <Chip>Roll {resolution.roll}{resolution.dice ? ` (${resolution.dice.d1}+${resolution.dice.d2})` : ""}</Chip>
        )}
        {!isAuto && <Chip>Total {sign(resolution.total || 0)}</Chip>}
      </div>

      {mods.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {mods.map((m, i) => (
            <Chip key={i} color={T.mut}>{m.name} {sign(m.value || 0)}</Chip>
          ))}
          {resolution.situational ? <Chip color={T.mut}>Situational {sign(resolution.situational)}</Chip> : null}
        </div>
      )}

      {resolution.text && (
        <div style={{ fontSize: 12.5, lineHeight: 1.6, color: T.text, whiteSpace: "pre-wrap" }}>
          <span style={{ ...lbl, color: T.accent, marginRight: 6 }}>GM</span>{resolution.text}
        </div>
      )}
    </div>
  );
}
