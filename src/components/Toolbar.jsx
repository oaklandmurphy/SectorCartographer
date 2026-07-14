import {
  MousePointer2, Share2, Pencil, Undo2, Trash2, Plus, Rocket,
  ZoomIn, ZoomOut, Maximize, PanelLeftClose, PanelLeftOpen,
  RotateCcw, AlertTriangle, Save, Star,
} from "lucide-react";
import { T, cut } from "../theme.js";
import { MIN_ZOOM, MAX_ZOOM } from "../constants.js";
import Btn from "./ui/Btn.jsx";

const DRAW_COLORS = ["#9fc23a", "#d98f2b", "#a83d31", "#5f83a0", "#d8d0b8", "#7c6a9e"];

export default function Toolbar({
  mode, setMode, setLinkSource, canEdit,
  addSystemCenter, addFleetCenter,
  drawColor, setDrawColor, drawWidth, setDrawWidth,
  strokes, undoStroke, clearStrokes,
  confirmingReset, setConfirmingReset, resetSector,
  view, setView, panelOpen, setPanelOpen,
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
      background: `linear-gradient(180deg, ${T.panel2}, ${T.panel})`, borderBottom: `2px solid ${T.line}`, flexWrap: "wrap", zIndex: 40 }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 9, paddingRight: 12, marginRight: 2,
        borderRight: `1px solid ${T.line}` }}>
        <div style={{ position: "relative", width: 28, height: 28, background: `linear-gradient(155deg, ${T.accent}, #5c7320 75%)`,
          ...cut(6), boxShadow: `0 0 10px ${T.accent}55, inset 0 -3px 5px rgba(0,0,0,.35)`,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Star size={14} color="#14170a" fill="#14170a" />
        </div>
        <div style={{ lineHeight: 1 }}>
          <div className="stencil" style={{ fontSize: 16, fontWeight: 800, letterSpacing: ".05em", color: T.text }}>The Fate of the Zotov Sector</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 3, background: T.panel3, padding: 3, border: `1px solid ${T.line}` }}>
        <Btn active={mode === "select"} onClick={() => setMode("select")} title="Select, drag pieces, pan" style={{ border: "none", borderRadius: 0, background: mode === "select" ? undefined : "transparent" }}>
          <MousePointer2 size={14} /> Select
        </Btn>
        <Btn active={mode === "link"} disabled={!canEdit} onClick={() => { setMode("link"); setLinkSource(null); }} title={canEdit ? "Link systems: click two systems to connect/disconnect" : "View only"} style={{ border: "none", borderRadius: 0, background: mode === "link" ? undefined : "transparent" }}>
          <Share2 size={14} /> Link
        </Btn>
        <Btn active={mode === "draw"} disabled={!canEdit} onClick={() => setMode("draw")} title={canEdit ? "Freehand draw on the map" : "View only"} style={{ border: "none", borderRadius: 0, background: mode === "draw" ? undefined : "transparent" }}>
          <Pencil size={14} /> Draw
        </Btn>
      </div>

      <Btn onClick={addSystemCenter} disabled={!canEdit} title={canEdit ? "Add a star system (or double-click the map)" : "View only"}><Plus size={14} /> System</Btn>
      <Btn onClick={addFleetCenter} disabled={!canEdit} title={canEdit ? "Add a fleet" : "View only"}><Rocket size={14} /> Fleet</Btn>

      {mode === "draw" && canEdit && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "4px 9px", background: T.panel3, border: `1px solid ${T.line}` }}>
          {DRAW_COLORS.map((c) => (
            <button key={c} onClick={() => setDrawColor(c)} title={c}
              style={{ width: 16, height: 16, borderRadius: 2, background: c, cursor: "pointer",
                border: drawColor === c ? "2px solid #fff" : "1px solid rgba(0,0,0,.5)", boxShadow: drawColor === c ? `0 0 6px ${c}` : "none" }} />
          ))}
          <input type="range" min={1} max={12} value={drawWidth} onChange={(e) => setDrawWidth(+e.target.value)}
            style={{ width: 74, accentColor: T.accent }} title="Brush size" />
        </div>
      )}
      <Btn onClick={undoStroke} disabled={!strokes.length || !canEdit} title="Undo last stroke"><Undo2 size={14} /> Undo</Btn>
      <Btn kind="danger" onClick={clearStrokes} disabled={!strokes.length || !canEdit} title="Clear all drawing"><Trash2 size={14} /> Clear</Btn>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
        {canEdit && confirmingReset && (
          <span className="mono" style={{ fontSize: 10.5, color: T.danger, marginRight: 2 }}>Erase saved sector?</span>
        )}
        {canEdit && confirmingReset && <Btn kind="danger" onClick={resetSector}>Confirm</Btn>}
        {canEdit && (
          <Btn onClick={() => setConfirmingReset((c) => !c)} title="Wipe saved data and restore the demo sector">
            <RotateCcw size={14} /> {confirmingReset ? "Cancel" : "Reset"}
          </Btn>
        )}

        <div style={{ width: 1, height: 20, background: T.line, margin: "0 2px" }} />

        <Btn onClick={() => setView((v) => ({ ...v, scale: Math.max(MIN_ZOOM, v.scale / 1.15) }))} title="Zoom out"><ZoomOut size={14} /></Btn>
        <span className="mono" style={{ fontSize: 11, color: T.mut, width: 42, textAlign: "center" }}>{Math.round(view.scale * 100)}%</span>
        <Btn onClick={() => setView((v) => ({ ...v, scale: Math.min(MAX_ZOOM, v.scale * 1.15) }))} title="Zoom in"><ZoomIn size={14} /></Btn>
        <Btn onClick={() => setView({ scale: 1, ox: 60, oy: 40 })} title="Reset view"><Maximize size={14} /></Btn>
        <Btn active={panelOpen} onClick={() => setPanelOpen((o) => !o)} title="Toggle side panel">
          {panelOpen ? <PanelLeftClose size={14} /> : <PanelLeftOpen size={14} />}
        </Btn>
      </div>
    </div>
  );
}

export function SaveStatus({ saveStatus, isMobile }) {
  return (
    <div className="mono" title={saveStatus === "error" ? "Changes are not being saved" : saveStatus === "saving" ? "Saving…" : "Data saved and shared"}
      style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10, letterSpacing: ".06em",
        color: saveStatus === "error" ? T.danger : saveStatus === "saving" ? T.faint : T.accent, padding: "0 4px" }}>
      {saveStatus === "error" ? <AlertTriangle size={12} /> : <Save size={12} />}
      {!isMobile && (saveStatus === "saving" ? "SAVING" : saveStatus === "error" ? "NOT SAVED" : saveStatus === "saved" ? "SAVED" : "")}
    </div>
  );
}
