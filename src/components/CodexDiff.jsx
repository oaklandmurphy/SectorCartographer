import { diffText } from "../lib/textDiff.js";
import { T } from "../theme.js";

// Inline diff of a proposed codex edit against the live text, for the GM's
// review. Added runs are green, removed runs red with a strike-through, and
// unchanged text is plain so the changes stand out. Whitespace and newlines are
// preserved (pre-wrap) so the body still reads the way it was written.
export default function CodexDiff({ before, after }) {
  const segs = diffText(before, after);
  const changed = segs.some((s) => s.type !== "same");
  if (!changed) {
    return <span style={{ color: T.faint, fontStyle: "italic", fontSize: 12 }}>No change to this field.</span>;
  }
  return (
    <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.65,
      fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, monospace", fontSize: 12.5, color: T.mut }}>
      {segs.map((s, i) => {
        if (s.type === "same") return <span key={i} style={{ color: T.text }}>{s.text}</span>;
        if (s.type === "add") return (
          <span key={i} style={{ color: T.accent, background: "rgba(159,194,58,.16)",
            boxShadow: `inset 0 0 0 1px ${T.accent}55`, borderRadius: 2 }}>{s.text}</span>
        );
        return (
          <span key={i} style={{ color: "#e0897d", background: "rgba(178,58,46,.20)",
            textDecoration: "line-through", boxShadow: `inset 0 0 0 1px ${T.danger}66`, borderRadius: 2 }}>{s.text}</span>
        );
      })}
    </div>
  );
}

// Small green/red key so the colours are unambiguous the first time a GM sees them.
export function DiffLegend() {
  const chip = (color, bg, label) => (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5,
      letterSpacing: ".06em", textTransform: "uppercase", color: T.faint }}>
      <span style={{ width: 10, height: 10, borderRadius: 2, background: bg, boxShadow: `inset 0 0 0 1px ${color}` }} />
      {label}
    </span>
  );
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      {chip(T.accent, "rgba(159,194,58,.16)", "Added")}
      {chip(T.danger, "rgba(178,58,46,.20)", "Removed")}
    </div>
  );
}
