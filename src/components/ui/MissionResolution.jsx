import { T, F } from "../../theme.js";
import { gradeColor } from "../../lib/missionOdds.js";

// The read-only view of a resolved squadron mission's outcome, shared by the
// player's fleet-tab mission card and the GM's queue so the two never drift.
// Renders the structured result the GM's mission-odds tool builds — the force
// ratio it snapped to, the roll, both independently-shifted E values, the
// success grade and casualty percentage they produced, and the GM's ruling.
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

export default function MissionResolution({ resolution }) {
  if (!resolution) return null;

  const grade = Number(resolution.grade) || 0;
  const cas = Number(resolution.casualtyPct) || 0;
  const gColor = gradeColor(grade);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, borderRadius: 2,
          padding: "2px 8px", fontFamily: F.body, fontSize: 11, fontWeight: 700,
          letterSpacing: ".05em", textTransform: "uppercase",
          border: `1px solid ${gColor}`, color: gColor, background: `${gColor}22` }}>
          Mission Success Rating {grade}/5
        </span>
        <Chip color={cas > 0 ? T.danger : T.mut}>Casualties {cas}%</Chip>
        {resolution.ratioLabel && (
          <Chip>{resolution.mine ?? "?"}:{resolution.enemyCount ?? "?"} → {resolution.ratioLabel} ({sign(resolution.ratioShift || 0)})</Chip>
        )}
        {resolution.roll != null && (
          <Chip>Roll {resolution.roll}{resolution.dice ? ` (${resolution.dice.d1}+${resolution.dice.d2})` : ""}</Chip>
        )}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        <Chip color={T.mut}>Outcome E {resolution.outcomeE} ({sign(resolution.outcomeShift || 0)} mission)</Chip>
        <Chip color={T.mut}>Casualty E {resolution.casualtyE} ({sign(resolution.casualtyShift || 0)} mission)</Chip>
      </div>

      {resolution.detachmentLosses && resolution.detachmentLosses.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 3, marginTop: 2 }}>
          <span style={{ fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase",
            color: T.faint, fontWeight: 600, fontFamily: F.body }}>Losses</span>
          {resolution.detachmentLosses.map((d) => (
            <div key={d.squadronId} className="mono" style={{ fontSize: 11, display: "flex", gap: 8,
              color: d.loss > 0 ? T.dangerText : T.mut }}>
              <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap" }}>
                {d.model || "unnamed"} ({d.shipName || "?"})
              </span>
              <span style={{ flexShrink: 0 }}>-{d.loss}/{d.count}</span>
            </div>
          ))}
        </div>
      )}

      {resolution.text && (
        <div style={{ fontFamily: F.mono,
          fontSize: 14, lineHeight: 1.65, color: T.text, whiteSpace: "pre-wrap",
          borderLeft: `2px solid ${T.accent}`, paddingLeft: 12, marginTop: 2 }}>
          {resolution.text}
        </div>
      )}
    </div>
  );
}
