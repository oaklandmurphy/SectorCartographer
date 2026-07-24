import { X, Layers, Users, Plus, Eye, EyeOff, Rocket, VenetianMask, Route } from "lucide-react";
import { T, cut } from "../theme.js";

export default function SidePanel({
  factions, layers, systems, fleets, canEdit, isMobile, onClose, addFaction, patchFaction, deleteFaction, addLayer, patchLayer, toggleLayer,
  showFleets, setShowFleets, showAgents, setShowAgents, showOrders, setShowOrders, canOrder,
}) {
  return (
    <div className="scroll" style={isMobile ? {
        position: "fixed", inset: 0, zIndex: 500, background: T.panel,
        display: "flex", flexDirection: "column", overflowY: "auto",
      } : {
        width: 244, flexShrink: 0, background: T.panel, borderRight: `2px solid ${T.line}`,
        overflowY: "auto", display: "flex", flexDirection: "column",
      }}>
      {isMobile && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px", position: "sticky", top: 0, zIndex: 2,
          borderBottom: `2px solid ${T.line}`, background: `linear-gradient(180deg, ${T.panel2}, ${T.panel})` }}>
          <Layers size={17} style={{ color: T.accent }} />
          <span className="stencil" style={{ fontSize: 16, fontWeight: 800, letterSpacing: ".05em", flex: 1 }}>FACTIONS &amp; LAYERS</span>
          <button onClick={onClose} title="Close"
            style={{ background: T.panel3, border: `1px solid ${T.line}`, color: T.text, cursor: "pointer", padding: 6, display: "flex" }}>
            <X size={20} />
          </button>
        </div>
      )}
      {/* factions */}
      <div style={{ padding: "11px 12px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
          <Users size={14} style={{ color: T.accent }} />
          <span className="stencil" style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: ".06em", flex: 1 }}>FACTIONS</span>
          {canEdit && (
            <button onClick={addFaction} title="Add faction"
              style={{ background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 2, color: T.accent, cursor: "pointer", padding: "2px 5px", display: "flex" }}>
              <Plus size={13} />
            </button>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {factions.map((f) => {
            const count = systems.filter((s) => s.factionId === f.id).length;
            const fc = fleets.filter((x) => x.factionId === f.id).length;
            return (
              <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 7, background: T.panel2,
                border: `1px solid ${T.line}`, borderRadius: 2, padding: "5px 6px" }}>
                <label style={{ position: "relative", width: 16, height: 16, flexShrink: 0, cursor: canEdit ? "pointer" : "default" }}>
                  <span style={{ display: "block", width: 16, height: 16, ...cut(3), background: f.color,
                    boxShadow: "inset 0 1px 2px rgba(255,255,255,.25), inset 0 -2px 3px rgba(0,0,0,.5)",
                    border: "1px solid #14110b" }} />
                  <input type="color" value={f.color} disabled={!canEdit} onChange={(e) => patchFaction(f.id, { color: e.target.value })}
                    style={{ position: "absolute", inset: 0, opacity: 0, cursor: canEdit ? "pointer" : "default" }} />
                </label>
                <input value={f.name} disabled={!canEdit} onChange={(e) => patchFaction(f.id, { name: e.target.value })}
                  style={{ background: "none", border: "none", color: T.text, fontSize: 11.5, flex: 1, outline: "none", minWidth: 0, fontFamily: "inherit" }} />
                <span className="mono" style={{ fontSize: 9, color: T.faint }} title={`${count} systems · ${fc} fleets`}>{count}·{fc}</span>
                {canEdit && (
                  <button onClick={() => deleteFaction(f.id)} title="Delete faction"
                    style={{ background: "none", border: "none", color: T.faint, cursor: "pointer", padding: 0, display: "flex" }}>
                    <X size={13} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ height: 1, background: T.line, margin: "4px 0" }} />

      {/* layers */}
      <div style={{ padding: "9px 12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
          <Layers size={14} style={{ color: T.accent }} />
          <span className="stencil" style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: ".06em", flex: 1 }}>MARKER LAYERS</span>
          {canEdit && (
            <button onClick={addLayer} title="Add layer"
              style={{ background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 2, color: T.accent, cursor: "pointer", padding: "2px 5px", display: "flex" }}>
              <Plus size={13} />
            </button>
          )}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          {layers.map((l) => (
            <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 7, background: T.panel2,
              border: `1px solid ${T.line}`, borderRadius: 2, padding: "5px 6px", opacity: l.visible ? 1 : 0.5 }}>
              <button onClick={() => toggleLayer(l.id)} title={l.visible ? "Hide layer" : "Show layer"}
                style={{ background: "none", border: "none", color: l.visible ? T.accent : T.faint, cursor: "pointer", padding: 0, display: "flex", flexShrink: 0 }}>
                {l.visible ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
              <label style={{ position: "relative", width: 14, height: 14, flexShrink: 0, cursor: canEdit ? "pointer" : "default" }}>
                <span style={{ display: "block", width: 14, height: 14, borderRadius: 2, background: l.color, border: "1px solid #14110b" }} />
                <input type="color" value={l.color} disabled={!canEdit} onChange={(e) => patchLayer(l.id, { color: e.target.value })}
                  style={{ position: "absolute", inset: 0, opacity: 0, cursor: canEdit ? "pointer" : "default" }} />
              </label>
              <input value={l.name} disabled={!canEdit} onChange={(e) => patchLayer(l.id, { name: e.target.value })}
                style={{ background: "none", border: "none", color: T.text, fontSize: 11.5, flex: 1, outline: "none", minWidth: 0, fontFamily: "inherit" }} />
            </div>
          ))}
        </div>
        <div style={{ fontSize: 9.5, color: T.faint, marginTop: 9, lineHeight: 1.5 }}>
          Toggle the eye to show or hide every marker on a layer across the whole map. {!canEdit && "Everything else here is view only."}
        </div>
      </div>

      <div style={{ height: 1, background: T.line, margin: "4px 0" }} />

      {/* map visibility — personal, view-only toggles for what's drawn on the map */}
      <div style={{ padding: "9px 12px 14px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9 }}>
          <Eye size={14} style={{ color: T.accent }} />
          <span className="stencil" style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: ".06em", flex: 1 }}>MAP VISIBILITY</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 7, background: T.panel2,
            border: `1px solid ${T.line}`, borderRadius: 2, padding: "5px 6px", opacity: showFleets ? 1 : 0.5 }}>
            <button onClick={() => setShowFleets((v) => !v)} title={showFleets ? "Hide fleets" : "Show fleets"}
              style={{ background: "none", border: "none", color: showFleets ? T.accent : T.faint, cursor: "pointer", padding: 0, display: "flex", flexShrink: 0 }}>
              {showFleets ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
            <Rocket size={13} style={{ color: T.mut, flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, color: T.text, flex: 1 }}>Fleets</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 7, background: T.panel2,
            border: `1px solid ${T.line}`, borderRadius: 2, padding: "5px 6px", opacity: showAgents ? 1 : 0.5 }}>
            <button onClick={() => setShowAgents((v) => !v)} title={showAgents ? "Hide agents" : "Show agents"}
              style={{ background: "none", border: "none", color: showAgents ? T.accent : T.faint, cursor: "pointer", padding: 0, display: "flex", flexShrink: 0 }}>
              {showAgents ? <Eye size={15} /> : <EyeOff size={15} />}
            </button>
            <VenetianMask size={13} style={{ color: T.mut, flexShrink: 0 }} />
            <span style={{ fontSize: 11.5, color: T.text, flex: 1 }}>Agents</span>
          </div>
          {canOrder && (
            <div style={{ display: "flex", alignItems: "center", gap: 7, background: T.panel2,
              border: `1px solid ${T.line}`, borderRadius: 2, padding: "5px 6px", opacity: showOrders ? 1 : 0.5 }}>
              <button onClick={() => setShowOrders((v) => !v)} title={showOrders ? "Hide move-order paths" : "Show move-order paths"}
                style={{ background: "none", border: "none", color: showOrders ? T.accent : T.faint, cursor: "pointer", padding: 0, display: "flex", flexShrink: 0 }}>
                {showOrders ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
              <Route size={13} style={{ color: T.mut, flexShrink: 0 }} />
              <span style={{ fontSize: 11.5, color: T.text, flex: 1 }}>Orders</span>
            </div>
          )}
        </div>
        <div style={{ fontSize: 9.5, color: T.faint, marginTop: 9, lineHeight: 1.5 }}>
          Personal to you — hides pieces on your view of the map only.
        </div>
      </div>
    </div>
  );
}
