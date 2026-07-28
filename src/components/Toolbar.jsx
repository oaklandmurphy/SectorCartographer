import {
  Undo2, Trash2, Plus, Rocket,
  ZoomIn, ZoomOut, Maximize, PanelLeftClose, PanelLeftOpen,
  AlertTriangle, Save, Star, Lock, LockOpen,
} from "lucide-react";
import { T, cut } from "../theme.js";
import { MIN_ZOOM, MAX_ZOOM } from "../constants.js";
import { useConfirm } from "../hooks/useConfirm.jsx";
import Btn from "./ui/Btn.jsx";
import { ModeToggle, DrawPalette } from "./ui/MapTools.jsx";

export default function Toolbar({
  mode, setMode, setLinkSource, canEdit, canOrder,
  addSystemCenter, addFleetCenter,
  drawColor, setDrawColor, drawWidth, setDrawWidth,
  strokes, undoStroke, clearStrokes,
  view, setView, panelOpen, setPanelOpen,
  editLocked, setEditLocked, showLock,
}) {
  const confirm = useConfirm();
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
      background: `linear-gradient(180deg, ${T.panel2}, ${T.panel})`, borderBottom: `2px solid ${T.line}`, flexWrap: "wrap", zIndex: 40 }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center", gap: 9, paddingRight: 12, marginRight: 2,
        borderRight: `1px solid ${T.line}` }}>
        <div style={{ position: "relative", width: 28, height: 28, background: `linear-gradient(155deg, ${T.accent}, #5c7320 75%)`,
          ...cut(6), boxShadow: `0 0 10px ${T.accent}55, inset 0 -3px 5px rgba(0,0,0,.35)`,
          display: "flex", alignItems: "center", justifyContent: "center" }}>
          <Star size={14} color={T.onAccent} fill={T.onAccent} />
        </div>
        <div style={{ lineHeight: 1 }}>
          <div className="stencil" style={{ fontSize: 16, fontWeight: 800, letterSpacing: ".05em", color: T.text }}>The Fate of the Zotov Sector</div>
        </div>
      </div>

      <ModeToggle mode={mode} setMode={setMode} setLinkSource={setLinkSource} canEdit={canEdit} canOrder={canOrder} />

      {showLock && (
        <Btn active={editLocked} onClick={() => setEditLocked((v) => !v)}
          title={editLocked ? "Editing locked — click to unlock the map" : "Lock editing to stop accidental drags, adds & deletes"}>
          {editLocked ? <Lock size={14} /> : <LockOpen size={14} />} {editLocked ? "Locked" : "Lock"}
        </Btn>
      )}

      <Btn onClick={addSystemCenter} disabled={!canEdit} title={canEdit ? "Add a star system (or double-click the map)" : "View only"}><Plus size={14} /> System</Btn>
      <Btn onClick={addFleetCenter} disabled={!canEdit} title={canEdit ? "Add a fleet" : "View only"}><Rocket size={14} /> Fleet</Btn>

      {mode === "draw" && canEdit && (
        <DrawPalette drawColor={drawColor} setDrawColor={setDrawColor} drawWidth={drawWidth} setDrawWidth={setDrawWidth} />
      )}
      <Btn onClick={undoStroke} disabled={!strokes.length || !canEdit} title="Undo last stroke"><Undo2 size={14} /> Undo</Btn>
      <Btn kind="danger" disabled={!strokes.length || !canEdit} title="Clear all drawing"
        onClick={async () => { if (await confirm("Clear all drawing on the map? This cannot be undone.")) clearStrokes(); }}>
        <Trash2 size={14} /> Clear
      </Btn>

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
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
