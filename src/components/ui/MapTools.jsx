import { MousePointer2, Share2, Pencil, Route } from "lucide-react";
import { T } from "../../theme.js";
import { DRAW_COLORS } from "../../constants.js";
import Btn from "./Btn.jsx";

// The Select / Link / Draw / Orders mode switch, shared by the desktop and mobile
// map toolbars. `fill` stretches the buttons to share the row (mobile), otherwise
// they hug their labels (desktop). Link/Draw are GM-only (`canEdit`); Orders is
// open to players plotting their own moves (`canOrder`).
export function ModeToggle({ mode, setMode, setLinkSource, canEdit, canOrder, fill }) {
  const seg = (m) => ({
    border: "none", borderRadius: 0, background: mode === m ? undefined : "transparent",
    ...(fill ? { flex: 1, justifyContent: "center" } : {}),
  });
  return (
    <div style={{ display: "flex", gap: 3, background: T.panel3, padding: 3, border: `1px solid ${T.line}` }}>
      <Btn active={mode === "select"} onClick={() => setMode("select")} title="Select, drag pieces, pan" style={seg("select")}>
        <MousePointer2 size={14} /> Select
      </Btn>
      <Btn active={mode === "link"} disabled={!canEdit} onClick={() => { setMode("link"); setLinkSource(null); }}
        title={canEdit ? "Link systems: click two systems to connect/disconnect" : "View only"} style={seg("link")}>
        <Share2 size={14} /> Link
      </Btn>
      <Btn active={mode === "draw"} disabled={!canEdit} onClick={() => setMode("draw")}
        title={canEdit ? "Freehand draw on the map" : "View only"} style={seg("draw")}>
        <Pencil size={14} /> Draw
      </Btn>
      {canOrder && (
        <Btn active={mode === "orders"} onClick={() => { setMode("orders"); setLinkSource(null); }}
          title="Plot move orders for your fleets & agents" style={seg("orders")}>
          <Route size={14} /> Orders
        </Btn>
      )}
    </div>
  );
}

// Pen color swatches + brush-width slider, shown only in draw mode. `fill` makes
// the slider grow to the row (mobile); otherwise it's a fixed width (desktop).
export function DrawPalette({ drawColor, setDrawColor, drawWidth, setDrawWidth, swatch = 16, fill }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, padding: fill ? "6px 9px" : "4px 9px",
      background: T.panel3, border: `1px solid ${T.line}`, ...(fill ? { flexWrap: "wrap" } : {}) }}>
      {DRAW_COLORS.map((c) => (
        <button key={c} onClick={() => setDrawColor(c)} title={c}
          style={{ width: swatch, height: swatch, borderRadius: 2, background: c, cursor: "pointer",
            border: drawColor === c ? "2px solid #fff" : "1px solid rgba(0,0,0,.5)",
            boxShadow: drawColor === c ? `0 0 6px ${c}` : "none" }} />
      ))}
      <input type="range" min={1} max={12} value={drawWidth} onChange={(e) => setDrawWidth(+e.target.value)}
        title="Brush size" style={{ accentColor: T.accent, ...(fill ? { flex: 1, minWidth: 80 } : { width: 74 }) }} />
    </div>
  );
}
