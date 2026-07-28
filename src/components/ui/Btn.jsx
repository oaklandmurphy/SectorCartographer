import { T, F } from "../../theme.js";

export default function Btn({ children, onClick, title, active, kind = "ghost", disabled, style }) {
  const base = {
    display: "inline-flex", alignItems: "center", gap: 6, cursor: disabled ? "not-allowed" : "pointer",
    border: `1px solid ${T.line}`, borderRadius: 3, padding: "6px 10px", fontSize: 11.5, fontWeight: 600,
    letterSpacing: ".04em", textTransform: "uppercase", fontFamily: F.body,
    color: T.text, background: T.panel2, transition: "all .1s", whiteSpace: "nowrap",
    opacity: disabled ? 0.4 : 1,
    boxShadow: "inset 0 1px 0 rgba(255,255,255,.04), inset 0 -2px 0 rgba(0,0,0,.35)",
  };
  const kinds = {
    ghost: {},
    primary: { background: "rgba(159,194,58,.14)", borderColor: "rgba(159,194,58,.5)", color: T.accent },
    danger: { background: "rgba(178,58,46,.16)", borderColor: "rgba(178,58,46,.55)", color: T.dangerText },
  };
  const act = active
    ? { background: T.accent, borderColor: T.accent, color: T.onAccent,
        boxShadow: "inset 0 -2px 0 rgba(0,0,0,.25), 0 0 8px rgba(159,194,58,.5)" }
    : {};
  return (
    <button title={title} disabled={disabled} onClick={onClick}
      style={{ ...base, ...kinds[kind], ...act, ...style }}>
      {children}
    </button>
  );
}
