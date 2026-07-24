import { Route, Undo2, Trash2, Check, MousePointerClick } from "lucide-react";
import { T, cut, inputStyle, lbl, floatingPanel } from "../theme.js";
import Btn from "./ui/Btn.jsx";

// The floating console shown on the map while plotting move orders. With nothing
// selected it just explains the mode; once a fleet or agent is picked it lists
// the route's stops and offers Undo / Clear / Submit. Submit only *signals the GM
// you're ready* — it never locks the route: editing any stop afterwards re-opens
// it as a draft, and the player re-submits when done.
export default function OrdersPanel({
  pieceLabel, factionColor, originName, stops, committed,
  notes, onNotesChange, onUndo, onClear, onCommit,
}) {
  const color = factionColor || T.accent;
  return (
    <div style={{ position: "absolute", right: 12, top: 12, zIndex: 34, width: 244, maxWidth: "calc(100% - 24px)",
      padding: "11px 13px", ...floatingPanel }}>
      <div className="stencil" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13,
        letterSpacing: ".08em", color: T.text, marginBottom: 9 }}>
        <Route size={14} style={{ color: T.accent }} /> MOVE ORDER
      </div>

      {!pieceLabel ? (
        <div style={{ fontSize: 11.5, color: T.mut, lineHeight: 1.6, display: "flex", gap: 7 }}>
          <MousePointerClick size={15} style={{ color: T.accent, flexShrink: 0, marginTop: 1 }} />
          <span>Click a <b style={{ color: T.text }}>fleet</b> or <b style={{ color: T.text }}>agent</b> you own, then click a path through systems to plot its route.</span>
        </div>
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
            <span style={{ width: 9, height: 9, ...cut(2), background: color, border: "1px solid #14110b", flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, color: T.text,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{pieceLabel}</span>
            {committed && (
              <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9.5, fontWeight: 700,
                letterSpacing: ".05em", textTransform: "uppercase", color: T.accent }}>
                <Check size={11} /> Submitted
              </span>
            )}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 3, marginBottom: 10,
            maxHeight: 190, overflowY: "auto" }} className="scroll">
            <Stop index="•" name={originName || "current position"} muted color={color} />
            {stops.length === 0 && (
              <div style={{ fontSize: 11, color: T.faint, padding: "4px 2px 2px 22px", lineHeight: 1.5 }}>
                Click systems to add stops.
              </div>
            )}
            {stops.map((s, i) => <Stop key={`${s.id}_${i}`} index={i + 1} name={s.name} color={color} />)}
          </div>

          <div style={{ marginBottom: 10 }}>
            <div style={lbl}>Notes</div>
            <textarea value={notes || ""} onChange={(e) => onNotesChange && onNotesChange(e.target.value)}
              placeholder="What should happen along the way, or once it arrives…"
              style={{ ...inputStyle, marginTop: 4, minHeight: 56, resize: "vertical", lineHeight: 1.5, fontSize: 12, padding: 8 }} />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn onClick={onUndo} disabled={stops.length === 0} title="Remove the last stop" style={{ flex: 1, justifyContent: "center" }}>
                <Undo2 size={13} /> Undo
              </Btn>
              <Btn kind="danger" onClick={onClear} title="Discard this order" style={{ flex: 1, justifyContent: "center" }}>
                <Trash2 size={13} /> Clear
              </Btn>
            </div>
            <Btn kind="primary" onClick={onCommit} disabled={stops.length === 0 || committed}
              title={committed ? "The GM has been signalled you're ready" : stops.length === 0 ? "Add at least one stop first" : "Signal the GM this order is ready"}
              style={{ width: "100%", justifyContent: "center" }}>
              <Check size={14} /> {committed ? "Submitted — ready" : "Submit order"}
            </Btn>
          </div>
        </>
      )}
    </div>
  );
}

function Stop({ index, name, muted, color }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span className="mono" style={{ width: 16, height: 16, flexShrink: 0, borderRadius: "50%",
        display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 700,
        background: muted ? "transparent" : `${color}26`, border: `1px solid ${muted ? T.line : color}`,
        color: muted ? T.faint : color }}>{index}</span>
      <span style={{ flex: 1, minWidth: 0, fontSize: 12, color: muted ? T.mut : T.text,
        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
    </div>
  );
}
