import {
  MousePointer2, Share2, Pencil, Undo2, Trash2, Plus, Rocket,
  ZoomIn, ZoomOut, Maximize, PanelLeftClose, PanelLeftOpen,
  RotateCcw, Star, Menu, X,
} from "lucide-react";
import { T } from "../theme.js";
import { MIN_ZOOM, MAX_ZOOM } from "../constants.js";
import Btn from "./ui/Btn.jsx";
import { SaveStatus } from "./Toolbar.jsx";

const DRAW_COLORS = ["#9fc23a", "#d98f2b", "#a83d31", "#5f83a0", "#d8d0b8", "#7c6a9e"];

export default function MobileToolbar({
  mode, setMode, setLinkSource, canEdit,
  addSystemCenter, addFleetCenter,
  drawColor, setDrawColor, drawWidth, setDrawWidth,
  strokes, undoStroke, clearStrokes,
  confirmingReset, setConfirmingReset, resetSector,
  view, setView, panelOpen, setPanelOpen,
  saveStatus, mobileMenuOpen, setMobileMenuOpen,
}) {
  return (
    <div style={{ position: "relative", zIndex: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px",
        background: `linear-gradient(180deg, ${T.panel2}, ${T.panel})`, borderBottom: `2px solid ${T.line}` }}>
        <Btn onClick={() => setMobileMenuOpen((o) => !o)} active={mobileMenuOpen} title="Tools menu">
          {mobileMenuOpen ? <X size={17} /> : <Menu size={17} />}
        </Btn>
        <div style={{ width: 22, height: 22, background: `linear-gradient(155deg, ${T.accent}, #5c7320 75%)`,
          clipPath: "polygon(5px 0, 100% 0, 100% calc(100% - 5px), calc(100% - 5px) 100%, 0 100%, 0 5px)",
          boxShadow: `0 0 8px ${T.accent}55`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          <Star size={11} color="#14170a" fill="#14170a" />
        </div>
        <div className="stencil" style={{ fontSize: 13.5, fontWeight: 800, letterSpacing: ".04em", flex: 1, minWidth: 0,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>SECTOR</div>
        <Btn active={panelOpen} onClick={() => setPanelOpen((o) => !o)} title="Factions & layers">
          {panelOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </Btn>
      </div>

      {mobileMenuOpen && (
        <div className="pop scroll" onPointerDown={(e) => e.stopPropagation()}
          style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 55, maxHeight: "70vh", overflowY: "auto",
            background: T.panel, borderBottom: `2px solid ${T.line}`, boxShadow: "0 14px 30px rgba(0,0,0,.6)",
            padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 3, background: T.panel3, padding: 3, border: `1px solid ${T.line}` }}>
            <Btn active={mode === "select"} onClick={() => setMode("select")} title="Select, drag pieces, pan"
              style={{ border: "none", borderRadius: 0, flex: 1, justifyContent: "center", background: mode === "select" ? undefined : "transparent" }}>
              <MousePointer2 size={14} /> Select
            </Btn>
            <Btn active={mode === "link"} disabled={!canEdit} onClick={() => { setMode("link"); setLinkSource(null); }} title={canEdit ? "Link systems" : "View only"}
              style={{ border: "none", borderRadius: 0, flex: 1, justifyContent: "center", background: mode === "link" ? undefined : "transparent" }}>
              <Share2 size={14} /> Link
            </Btn>
            <Btn active={mode === "draw"} disabled={!canEdit} onClick={() => setMode("draw")} title={canEdit ? "Freehand draw" : "View only"}
              style={{ border: "none", borderRadius: 0, flex: 1, justifyContent: "center", background: mode === "draw" ? undefined : "transparent" }}>
              <Pencil size={14} /> Draw
            </Btn>
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={addSystemCenter} disabled={!canEdit} title={canEdit ? "Add a star system" : "View only"} style={{ flex: 1, justifyContent: "center" }}>
              <Plus size={14} /> System
            </Btn>
            <Btn onClick={addFleetCenter} disabled={!canEdit} title={canEdit ? "Add a fleet" : "View only"} style={{ flex: 1, justifyContent: "center" }}>
              <Rocket size={14} /> Fleet
            </Btn>
          </div>

          {mode === "draw" && canEdit && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 9px", background: T.panel3, border: `1px solid ${T.line}`, flexWrap: "wrap" }}>
              {DRAW_COLORS.map((c) => (
                <button key={c} onClick={() => setDrawColor(c)} title={c}
                  style={{ width: 20, height: 20, borderRadius: 2, background: c, cursor: "pointer",
                    border: drawColor === c ? "2px solid #fff" : "1px solid rgba(0,0,0,.5)", boxShadow: drawColor === c ? `0 0 6px ${c}` : "none" }} />
              ))}
              <input type="range" min={1} max={12} value={drawWidth} onChange={(e) => setDrawWidth(+e.target.value)}
                style={{ flex: 1, minWidth: 80, accentColor: T.accent }} title="Brush size" />
            </div>
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={undoStroke} disabled={!strokes.length || !canEdit} title="Undo last stroke" style={{ flex: 1, justifyContent: "center" }}><Undo2 size={14} /> Undo</Btn>
            <Btn kind="danger" onClick={clearStrokes} disabled={!strokes.length || !canEdit} title="Clear all drawing" style={{ flex: 1, justifyContent: "center" }}><Trash2 size={14} /> Clear</Btn>
          </div>

          <div style={{ height: 1, background: T.line, margin: "2px 0" }} />

          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <Btn onClick={() => setView((v) => ({ ...v, scale: Math.max(MIN_ZOOM, v.scale / 1.15) }))} title="Zoom out"><ZoomOut size={14} /></Btn>
            <span className="mono" style={{ fontSize: 11, color: T.mut, width: 40, textAlign: "center" }}>{Math.round(view.scale * 100)}%</span>
            <Btn onClick={() => setView((v) => ({ ...v, scale: Math.min(MAX_ZOOM, v.scale * 1.15) }))} title="Zoom in"><ZoomIn size={14} /></Btn>
            <Btn onClick={() => setView({ scale: 1, ox: 60, oy: 40 })} title="Reset view"><Maximize size={14} /></Btn>
          </div>

          {canEdit && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <SaveStatus saveStatus={saveStatus} isMobile={false} />
              {!confirmingReset && (
                <Btn onClick={() => setConfirmingReset(true)} title="Wipe saved data and restore the demo sector"><RotateCcw size={14} /> Reset</Btn>
              )}
              {confirmingReset && (
                <>
                  <span className="mono" style={{ fontSize: 10.5, color: T.danger }}>Erase saved sector?</span>
                  <Btn kind="danger" onClick={resetSector}>Confirm</Btn>
                  <Btn onClick={() => setConfirmingReset(false)}>Cancel</Btn>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
