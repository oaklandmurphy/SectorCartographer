import { X } from "lucide-react";
import { T, cut } from "../../theme.js";

export default function PopupHeader({ color, icon, title, onClose }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 12px",
      borderBottom: `1px solid ${T.line}`, background: `linear-gradient(90deg, ${color}22, transparent)` }}>
      <div style={{ width: 22, height: 22, ...cut(4), display: "flex", alignItems: "center", justifyContent: "center",
        background: "#14110b", border: `1px solid ${color}`, color }}>{icon}</div>
      <div className="stencil" style={{ fontSize: 14, fontWeight: 700, letterSpacing: ".08em", flex: 1 }}>{title}</div>
      <button onClick={onClose} style={{ background: "none", border: "none", color: T.mut, cursor: "pointer", padding: 2 }}>
        <X size={16} />
      </button>
    </div>
  );
}
