import { TriangleAlert, X, SkipForward } from "lucide-react";
import { T, panelStyle, cut } from "../theme.js";
import Btn from "./ui/Btn.jsx";

function pieceLabel(v, factions) {
  if (v.pieceType === "fleet") return v.piece.name || "Unnamed fleet";
  const fac = (factions || []).find((f) => f.id === v.piece.factionId);
  const member = fac && (fac.members || []).find((m) => m.id === v.piece.memberId);
  return member ? member.name : "Unassigned agent";
}

// Blocks "Next Turn" behind an explicit look at every committed order that
// breaks the movement rules (see lib/movement.js) before the GM can either
// go fix the routes or advance the turn as ordered anyway.
export default function TurnMovementWarningModal({ violations, factions, systems, turnSummary, onCancel, onConfirm }) {
  const nameOf = (id) => (systems.find((s) => s.id === id) || {}).name || "?";
  return (
    <div onPointerDown={onCancel}
      style={{ position: "fixed", inset: 0, zIndex: 2100, background: "rgba(6,5,3,.72)",
        display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onPointerDown={(e) => e.stopPropagation()}
        style={{ ...panelStyle, ...cut(10), width: "100%", maxWidth: 520, maxHeight: "88vh",
          display: "flex", flexDirection: "column", background: T.panel }}>

        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px",
          borderBottom: `2px solid ${T.amber}`, flexShrink: 0 }}>
          <TriangleAlert size={16} color={T.amber} />
          <div className="stencil" style={{ fontSize: 15, letterSpacing: ".05em", color: T.text, flex: 1 }}>
            Movement rule violations
          </div>
          <button onClick={onCancel} title="Cancel"
            style={{ background: "none", border: "none", color: T.faint, cursor: "pointer", padding: 2 }}>
            <X size={16} />
          </button>
        </div>

        <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 14,
          display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 11.5, color: T.mut, lineHeight: 1.5 }}>
            {violations.length} committed order{violations.length === 1 ? "" : "s"} break the movement rules —
            agents may move through 3 systems (4 from a jump gate), fleets through 1 (2 from a jump gate), and
            every step must follow a link. Go fix the route, or confirm anyway to advance the turn as ordered.
          </div>
          {violations.map((v) => (
            <div key={v.order.id} style={{ border: `1px solid ${T.amber}`, borderRadius: 2,
              background: "rgba(217,143,43,.08)", padding: "8px 10px" }}>
              <div style={{ fontSize: 12.5, color: T.text, fontWeight: 600, marginBottom: 3 }}>
                {v.pieceType === "fleet" ? "Fleet" : "Agent"} — {pieceLabel(v, factions)}
              </div>
              <div className="mono" style={{ fontSize: 10.5, color: T.faint, marginBottom: 5 }}>
                {[nameOf(v.piece.systemId), ...v.order.path.map(nameOf)].join(" → ")}
              </div>
              {v.issues.map((issue, i) => (
                <div key={i} style={{ fontSize: 11, color: T.dangerText, lineHeight: 1.5 }}>• {issue}</div>
              ))}
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
          borderTop: `2px solid ${T.line}`, flexShrink: 0 }}>
          <span style={{ fontSize: 10.5, color: T.faint, lineHeight: 1.4, flex: 1, minWidth: 0 }}>{turnSummary}</span>
          <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
            <Btn onClick={onCancel}>Cancel</Btn>
            <Btn kind="danger" onClick={onConfirm}>
              <SkipForward size={13} /> Advance anyway
            </Btn>
          </div>
        </div>
      </div>
    </div>
  );
}
