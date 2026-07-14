import { Ship, Anchor, GripVertical, Plus, Trash2, X } from "lucide-react";
import { T, panelStyle, inputStyle, selStyle, lbl } from "../theme.js";
import { SHIP_CLASSES } from "../constants.js";
import Btn from "./ui/Btn.jsx";
import Rivet from "./ui/Rivet.jsx";
import PopupHeader from "./ui/PopupHeader.jsx";
import CodexLink from "./CodexLink.jsx";
import VisibilityRow from "./VisibilityRow.jsx";

export default function FleetPopup({
  fleet, pos, containerHeight, canEdit, factions, fleets, factionColor, home,
  patchFleet, addShip, patchShip, removeShip, moveShip, deleteFleet, onClose, onShipDragStart,
  wiki, roles, goToCodex, createEntry,
}) {
  return (
    <div className="pop" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
      style={{ position: "absolute", left: pos.x, top: pos.y, width: 306, zIndex: 50,
      maxHeight: containerHeight - 20, display: "flex", flexDirection: "column", ...panelStyle }}>
      <Rivet corner="tr" /><Rivet corner="bl" />
      <PopupHeader color={factionColor} icon={<Ship size={13} />} title="FLEET ROSTER" onClose={onClose} />
      <div className="scroll" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 11, overflowY: "auto", minHeight: 0, flex: "1 1 auto" }}>
        <div>
          <div style={lbl}>Fleet name</div>
          <input style={{ ...inputStyle, marginTop: 4 }} value={fleet.name} disabled={!canEdit}
            onChange={(e) => patchFleet(fleet.id, { name: e.target.value })} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={lbl}>Affiliation</div>
            <select style={{ ...selStyle, marginTop: 4 }} value={fleet.factionId} disabled={!canEdit}
              onChange={(e) => patchFleet(fleet.id, { factionId: e.target.value })}>
              {factions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        </div>
        <div style={{ fontSize: 10.5, color: T.mut, display: "flex", alignItems: "center", gap: 5 }}>
          <Anchor size={12} style={{ color: T.faint }} />
          {home ? <span>Stationed at <b style={{ color: T.text }}>{home.name}</b></span> : <span>In transit</span>}
        </div>

        <CodexLink wiki={wiki} value={fleet.wikiId} canEdit={canEdit}
          onChange={(id) => patchFleet(fleet.id, { wikiId: id })}
          onNavigate={goToCodex} onCreate={createEntry}
          createTitle={fleet.name} createCategory="misc" />


        <div>
          <div style={{ ...lbl, marginBottom: 5, display: "flex", justifyContent: "space-between" }}>
            <span>Ships</span><span style={{ color: T.faint }}>{fleet.ships.length}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {fleet.ships.length === 0 && (
              <div style={{ fontSize: 11, color: T.faint, padding: "10px 6px", textAlign: "center",
                border: `1px dashed ${T.line}` }}>
                No ships. Add one below.
              </div>
            )}
            {fleet.ships.map((sh) => (
              <div key={sh.id}
                style={{ display: "flex", flexDirection: "column", gap: 6, background: T.panel2,
                  border: `1px solid ${T.line}`, borderRadius: 2, padding: 5 }}>
                <div onPointerDown={(e) => { if (!canEdit) return; e.stopPropagation(); onShipDragStart(sh, e); }}
                  style={{ display: "flex", gap: 5, alignItems: "center", touchAction: "none",
                    cursor: canEdit ? "grab" : "default" }}>
                  <GripVertical size={13} style={{ color: T.faint, flexShrink: 0, opacity: canEdit ? 1 : 0.35 }} />
                  <div style={{ width: 4, alignSelf: "stretch", background: factionColor, flexShrink: 0 }} />
                  <input value={sh.name} disabled={!canEdit} onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) => patchShip(fleet.id, sh.id, { name: e.target.value })}
                    style={{ ...inputStyle, padding: "3px 6px", flex: 1 }} />
                  <select value={sh.cls} disabled={!canEdit} onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) => patchShip(fleet.id, sh.id, { cls: e.target.value })}
                    style={{ ...selStyle, padding: "3px 4px", width: 92 }}>
                    {SHIP_CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {canEdit && (
                    <select value="" title="Move to fleet" onPointerDown={(e) => e.stopPropagation()}
                      onChange={(e) => { if (e.target.value) moveShip(fleet.id, e.target.value, sh.id); }}
                      style={{ ...selStyle, padding: "3px 2px", width: 26, color: T.faint }}>
                      <option value=""></option>
                      {fleets.filter((f) => f.id !== fleet.id).map((f) => (
                        <option key={f.id} value={f.id}>→ {f.name}</option>
                      ))}
                    </select>
                  )}
                  {canEdit && (
                    <button onClick={() => removeShip(fleet.id, sh.id)} onPointerDown={(e) => e.stopPropagation()}
                      title="Remove ship" style={{ background: "none", border: "none", color: T.danger, cursor: "pointer", padding: 2 }}>
                      <X size={14} />
                    </button>
                  )}
                </div>
                {canEdit && roles && roles.length > 0 && (
                  <div onPointerDown={(e) => e.stopPropagation()} style={{ paddingLeft: 9 }}>
                    <VisibilityRow roles={roles} value={sh.visibility} compact
                      onChange={(v) => patchShip(fleet.id, sh.id, { visibility: v })} />
                  </div>
                )}
              </div>
            ))}
          </div>
          {canEdit && (
            <>
              <div style={{ fontSize: 9.5, color: T.faint, marginTop: 6, display: "flex", alignItems: "center", gap: 4 }}>
                <GripVertical size={11} /> Drag a ship onto another fleet on the map to transfer it
              </div>
              <Btn kind="primary" onClick={() => addShip(fleet.id)}
                style={{ marginTop: 7, width: "100%", justifyContent: "center" }}>
                <Plus size={14} /> Add ship
              </Btn>
            </>
          )}
        </div>

        {canEdit && (
          <Btn kind="danger" onClick={() => deleteFleet(fleet.id)}
            style={{ width: "100%", justifyContent: "center" }}>
            <Trash2 size={14} /> Disband fleet
          </Btn>
        )}
      </div>
    </div>
  );
}
