import {
  Undo2, Trash2, Plus, Rocket, Route, EyeOff,
  ZoomIn, ZoomOut, Maximize, PanelLeftClose, PanelLeftOpen,
  Star, Menu, X,
} from "lucide-react";
import { T } from "../theme.js";
import { MIN_ZOOM, MAX_ZOOM } from "../constants.js";
import Btn from "./ui/Btn.jsx";
import { ModeToggle, DrawPalette } from "./ui/MapTools.jsx";
import { SaveStatus } from "./Toolbar.jsx";

export default function MobileToolbar({
  mode, setMode, setLinkSource, canEdit, canOrder,
  showOrders, setShowOrders,
  addSystemCenter, addFleetCenter,
  drawColor, setDrawColor, drawWidth, setDrawWidth,
  strokes, undoStroke, clearStrokes,
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
          <ModeToggle mode={mode} setMode={setMode} setLinkSource={setLinkSource} canEdit={canEdit} canOrder={canOrder} fill />

          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={addSystemCenter} disabled={!canEdit} title={canEdit ? "Add a star system" : "View only"} style={{ flex: 1, justifyContent: "center" }}>
              <Plus size={14} /> System
            </Btn>
            <Btn onClick={addFleetCenter} disabled={!canEdit} title={canEdit ? "Add a fleet" : "View only"} style={{ flex: 1, justifyContent: "center" }}>
              <Rocket size={14} /> Fleet
            </Btn>
          </div>

          {mode === "draw" && canEdit && (
            <DrawPalette drawColor={drawColor} setDrawColor={setDrawColor} drawWidth={drawWidth} setDrawWidth={setDrawWidth} swatch={20} fill />
          )}

          <div style={{ display: "flex", gap: 8 }}>
            <Btn onClick={undoStroke} disabled={!strokes.length || !canEdit} title="Undo last stroke" style={{ flex: 1, justifyContent: "center" }}><Undo2 size={14} /> Undo</Btn>
            <Btn kind="danger" onClick={clearStrokes} disabled={!strokes.length || !canEdit} title="Clear all drawing" style={{ flex: 1, justifyContent: "center" }}><Trash2 size={14} /> Clear</Btn>
          </div>

          {canOrder && (
            <Btn active={showOrders} onClick={() => setShowOrders((v) => !v)}
              title={showOrders ? "Hide move-order paths" : "Show move-order paths"}
              style={{ justifyContent: "center" }}>
              {showOrders ? <Route size={14} /> : <EyeOff size={14} />} {showOrders ? "Hide orders" : "Show orders"}
            </Btn>
          )}

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
            </div>
          )}
        </div>
      )}
    </div>
  );
}
