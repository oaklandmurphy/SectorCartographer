import { Eye, Users, EyeOff } from "lucide-react";
import { T, F, lbl } from "../theme.js";
import { visibilitySummary } from "../lib/visibility.js";

// GM-only control for choosing who can see one codex entry or carrier.
// `value` is the item's `visibility` field: undefined = Everyone (public),
// an array of role ids = those players + GM, [] = GM only.
// Renders nothing unless there is at least one player role to share with.
export default function VisibilityRow({ roles, value, onChange, compact }) {
  if (!roles || roles.length === 0) return null;
  const restricted = Array.isArray(value);
  const current = restricted ? value : [];

  const toggleRole = (id) => {
    const base = Array.isArray(value) ? value : [];
    const next = base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    onChange(next); // stays restricted even when empty (that means GM only)
  };

  const chip = (active, color, onClick, key, children, title) => (
    <button key={key} onClick={onClick} title={title} type="button"
      style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", whiteSpace: "nowrap",
        border: `1px solid ${active ? color : T.line}`, borderRadius: 2, padding: compact ? "3px 7px" : "4px 8px",
        background: active ? `${color}26` : T.panel2, color: active ? color : T.mut,
        fontFamily: F.body, fontSize: 11, fontWeight: 600, letterSpacing: ".03em", textTransform: "uppercase" }}>
      {children}
    </button>
  );

  const gmOnly = restricted && current.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ ...lbl, display: "flex", alignItems: "center", gap: 6 }}>
        <Eye size={12} /> Visible to
        <span style={{ marginLeft: "auto", color: gmOnly ? T.amber : restricted ? T.accent : T.faint,
          textTransform: "none", letterSpacing: 0, fontWeight: 600 }}>
          {visibilitySummary({ visibility: value }, roles)}
        </span>
      </div>
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
        {chip(!restricted, T.accent, () => onChange(undefined), "__all",
          <><Users size={12} /> Everyone</>, "Public — anyone with the link sees this")}
        {roles.map((r) =>
          chip(current.includes(r.id), r.color || T.accent, () => toggleRole(r.id), r.id,
            <>{r.name || "Unnamed"}</>, `Share with ${r.name || "this player"}`))}
      </div>
      {gmOnly && (
        <div style={{ fontSize: 9.5, color: T.amber, display: "flex", alignItems: "center", gap: 5 }}>
          <EyeOff size={11} /> Hidden from every player — only you (GM) can see this.
        </div>
      )}
    </div>
  );
}
