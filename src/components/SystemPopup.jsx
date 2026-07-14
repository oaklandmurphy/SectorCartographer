import { Star, Plus, Trash2, X, Rocket } from "lucide-react";
import { T, panelStyle, inputStyle, selStyle, lbl } from "../theme.js";
import { ICONS, ICON_KEYS } from "../constants.js";
import Btn from "./ui/Btn.jsx";
import Rivet from "./ui/Rivet.jsx";
import PopupHeader from "./ui/PopupHeader.jsx";
import CodexLink from "./CodexLink.jsx";

export default function SystemPopup({
  system, pos, containerHeight, canEdit, factions, layers, factionById, layerById,
  patchSystem, addMarker, patchMarker, removeMarker, deployFleetAt, deleteSystem, onClose,
  wiki, goToCodex, createEntry,
}) {
  return (
    <div className="pop" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
      style={{ position: "absolute", left: pos.x, top: pos.y, width: 300, zIndex: 50,
      maxHeight: containerHeight - 20, display: "flex", flexDirection: "column", ...panelStyle }}>
      <Rivet corner="tr" /><Rivet corner="bl" />
      <PopupHeader color={factionById(system.factionId).color} icon={<Star size={13} />}
        title="STAR SYSTEM" onClose={onClose} />
      <div className="scroll" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", minHeight: 0, flex: "1 1 auto" }}>
        <div>
          <div style={lbl}>Name</div>
          <input style={{ ...inputStyle, marginTop: 4 }} value={system.name} disabled={!canEdit}
            onChange={(e) => patchSystem(system.id, { name: e.target.value })} />
        </div>
        <div>
          <div style={lbl}>Affiliation</div>
          <select style={{ ...selStyle, marginTop: 4 }} value={system.factionId} disabled={!canEdit}
            onChange={(e) => patchSystem(system.id, { factionId: e.target.value })}>
            {factions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
        </div>
        <CodexLink wiki={wiki} value={system.wikiId} canEdit={canEdit}
          onChange={(id) => patchSystem(system.id, { wikiId: id })}
          onNavigate={goToCodex} onCreate={createEntry}
          createTitle={system.name} createCategory="locations" />
        <div>
          <div style={{ ...lbl, marginBottom: 5, display: "flex", justifyContent: "space-between" }}>
            <span>Status markers</span><span style={{ color: T.faint }}>{system.markers.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {system.markers.map((m) => {
              const L = layerById(m.layerId); const Ic = ICONS[m.iconKey] || Star;
              return (
                <div key={m.id} style={{ display: "flex", gap: 5, alignItems: "center",
                  background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 2, padding: 5 }}>
                  <div style={{ width: 22, height: 22, borderRadius: 2, flexShrink: 0, display: "flex",
                    alignItems: "center", justifyContent: "center", color: L ? L.color : T.mut,
                    background: "#14110b", border: `1px solid ${L ? L.color : T.line}` }}>
                    <Ic size={13} />
                  </div>
                  <input value={m.label} disabled={!canEdit} onChange={(e) => patchMarker(system.id, m.id, { label: e.target.value })}
                    style={{ ...inputStyle, padding: "3px 6px", flex: 1 }} />
                  <select value={m.iconKey} disabled={!canEdit} onChange={(e) => patchMarker(system.id, m.id, { iconKey: e.target.value })}
                    style={{ ...selStyle, padding: "3px 4px", width: 66 }}>
                    {ICON_KEYS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select>
                  <select value={m.layerId} disabled={!canEdit} onChange={(e) => patchMarker(system.id, m.id, { layerId: e.target.value })}
                    style={{ ...selStyle, padding: "3px 4px", width: 74 }}>
                    {layers.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </select>
                  {canEdit && (
                    <button onClick={() => removeMarker(system.id, m.id)} title="Remove marker"
                      style={{ background: "none", border: "none", color: T.danger, cursor: "pointer", padding: 2 }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {canEdit && (
            <Btn kind="primary" onClick={() => addMarker(system.id, layers[0].id)}
              style={{ marginTop: 7, width: "100%", justifyContent: "center" }}>
              <Plus size={14} /> Add marker
            </Btn>
          )}
        </div>
        {canEdit && (
          <div style={{ display: "flex", gap: 7 }}>
            <Btn onClick={() => deployFleetAt(system.id)} style={{ flex: 1, justifyContent: "center" }}>
              <Rocket size={14} /> Deploy fleet
            </Btn>
            <Btn kind="danger" onClick={() => deleteSystem(system.id)} title="Delete system">
              <Trash2 size={14} />
            </Btn>
          </div>
        )}
      </div>
    </div>
  );
}
