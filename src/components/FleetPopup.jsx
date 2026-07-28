import { useMemo, useState } from "react";
import { Ship, Anchor, GripVertical, Plus, Trash2, X, Maximize2, Rocket } from "lucide-react";
import { T, inputStyle, selStyle, lbl } from "../theme.js";
import { squadronsOf, craftInCarrier, craftInFleet, knownModels, knownCarrierModels } from "../lib/carriers.js";
import { mergeNames } from "../lib/shipArt.js";
import { useConfirm } from "../hooks/useConfirm.jsx";
import Btn from "./ui/Btn.jsx";
import MapPopup from "./ui/MapPopup.jsx";
import ShipArt from "./ui/ShipArt.jsx";
import VisibilityRow from "./VisibilityRow.jsx";
import SquadronOrderModal from "./SquadronOrderModal.jsx";

export default function FleetPopup({
  fleet, anchor, containerSize, isMobile, canEdit, factions, fleets, factionColor, home,
  patchFleet, addShip, patchShip, removeShip, moveShip, deleteFleet, onClose, onShipDragStart,
  addSquadron, patchSquadron, removeSquadron, goToFleet, roles, art = [],
  canOrderFor, submitMission,
}) {
  const confirm = useConfirm();
  const [orderOpen, setOrderOpen] = useState(false);
  const artNames = useMemo(() => art.map((a) => a.name), [art]);
  const models = useMemo(() => mergeNames(knownModels(fleets), artNames), [fleets, artNames]);
  const carrierModels = useMemo(() => mergeNames(knownCarrierModels(fleets), artNames), [fleets, artNames]);
  const modelsId = `sqn-models-${fleet.id}`; // only one roster is open at a time, but keep it fleet-scoped anyway
  const carrierModelsId = `car-models-${fleet.id}`;
  const canGiveOrder = !!canOrderFor && canOrderFor(fleet.factionId);
  return (
    <>
    <MapPopup anchor={anchor} containerSize={containerSize} isMobile={isMobile} width={306} gap={11}
      color={factionColor} icon={<Ship size={13} />} title="FLEET ROSTER" onClose={onClose}>
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

        {/* the whole roster, with room to breathe — replaces the old per-fleet codex link */}
        <Btn onClick={() => goToFleet(fleet.id)} title="Open this fleet's full roster in the Fleet tab"
          style={{ width: "100%", justifyContent: "center" }}>
          <Maximize2 size={13} /> Open in Fleet view
        </Btn>

        {canGiveOrder && (
          <Btn kind="primary" onClick={() => setOrderOpen(true)} disabled={craftInFleet(fleet) === 0}
            title={craftInFleet(fleet) === 0 ? "No craft in this fleet's hangars" : "Send fighters/bombers on a mission"}
            style={{ width: "100%", justifyContent: "center" }}>
            <Rocket size={13} /> Squadron order
          </Btn>
        )}


        {/* every model already flying in the sector — shared by every model field below */}
        <datalist id={modelsId}>
          {models.map((m) => <option key={m} value={m} />)}
        </datalist>
        <datalist id={carrierModelsId}>
          {carrierModels.map((m) => <option key={m} value={m} />)}
        </datalist>

        <div>
          <div style={{ ...lbl, marginBottom: 5, display: "flex", justifyContent: "space-between" }}>
            <span>Carriers</span>
            <span style={{ color: T.faint }}>
              {fleet.ships.length} · {craftInFleet(fleet)} craft
            </span>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {fleet.ships.length === 0 && (
              <div style={{ fontSize: 11, color: T.faint, padding: "10px 6px", textAlign: "center",
                border: `1px dashed ${T.line}` }}>
                No carriers. Add one below.
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
                  <ShipArt art={art} model={sh.model} size={26} placeholder={false} color={factionColor} />
                  <input value={sh.name} disabled={!canEdit} onPointerDown={(e) => e.stopPropagation()}
                    onChange={(e) => patchShip(fleet.id, sh.id, { name: e.target.value })}
                    style={{ ...inputStyle, padding: "3px 6px", flex: 1 }} />
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
                      title="Remove carrier" style={{ background: "none", border: "none", color: T.danger, cursor: "pointer", padding: 2 }}>
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* the carrier's design — what the art library matches on */}
                {canEdit && (
                  <div onPointerDown={(e) => e.stopPropagation()} style={{ paddingLeft: 9 }}>
                    <input className="mono" list={carrierModelsId} value={sh.model || ""} placeholder="class / design"
                      onChange={(e) => patchShip(fleet.id, sh.id, { model: e.target.value })}
                      style={{ ...inputStyle, padding: "2px 6px", fontSize: 10.5 }} />
                  </div>
                )}

                {/* hangar: the carrier's squadrons, each a count of one model */}
                <div style={{ paddingLeft: 9, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ ...lbl, fontSize: 9, display: "flex", justifyContent: "space-between" }}>
                    <span>Hangar</span>
                    <span style={{ color: T.faint }}>{craftInCarrier(sh)} craft</span>
                  </div>
                  {squadronsOf(sh).length === 0 && (
                    <div style={{ fontSize: 10.5, color: T.faint, fontStyle: "italic" }}>Empty hangar</div>
                  )}
                  {squadronsOf(sh).map((sq) => (
                    <div key={sq.id} style={{ display: "flex", gap: 4, alignItems: "center" }}>
                      <ShipArt art={art} model={sq.model} size={18} placeholder={false} color={factionColor} />
                      {canEdit ? (
                        <>
                          <input className="mono" type="number" min="0" step="1" value={sq.count}
                            onPointerDown={(e) => e.stopPropagation()}
                            onChange={(e) => patchSquadron(fleet.id, sh.id, sq.id,
                              { count: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                            style={{ ...inputStyle, padding: "3px 4px", width: 48, textAlign: "right" }} />
                          <span style={{ color: T.faint, fontSize: 11, flexShrink: 0 }}>×</span>
                          <input className="mono" list={modelsId} value={sq.model || ""}
                            placeholder="model" onPointerDown={(e) => e.stopPropagation()}
                            onChange={(e) => patchSquadron(fleet.id, sh.id, sq.id, { model: e.target.value })}
                            style={{ ...inputStyle, padding: "3px 6px", flex: 1, minWidth: 0 }} />
                          <button onClick={() => removeSquadron(fleet.id, sh.id, sq.id)}
                            onPointerDown={(e) => e.stopPropagation()} title="Remove squadron"
                            style={{ background: "none", border: "none", color: T.danger, cursor: "pointer", padding: 2, flexShrink: 0 }}>
                            <X size={12} />
                          </button>
                        </>
                      ) : (
                        // read-only: plain text, not a disabled number input — the spinner
                        // arrows on <input type=number> stay visible when disabled and crowd
                        // out the value in this narrow box.
                        <div className="mono" style={{ display: "flex", gap: 5, alignItems: "baseline",
                          fontSize: 11.5, flex: 1, minWidth: 0 }}>
                          <span style={{ color: T.accent, fontWeight: 700, minWidth: 26, textAlign: "right",
                            flexShrink: 0 }}>{Number(sq.count) || 0}</span>
                          <span style={{ color: T.faint, flexShrink: 0 }}>×</span>
                          <span style={{ color: T.text, overflow: "hidden", textOverflow: "ellipsis",
                            whiteSpace: "nowrap" }}>
                            {sq.model || <span style={{ color: T.faint, fontStyle: "italic" }}>unnamed model</span>}
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                  {canEdit && (
                    <Btn onClick={() => addSquadron(fleet.id, sh.id)}
                      style={{ marginTop: 2, width: "100%", justifyContent: "center", padding: "3px 6px", fontSize: 10.5 }}>
                      <Plus size={12} /> Add squadron
                    </Btn>
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
                <GripVertical size={11} /> Drag a carrier onto another fleet on the map to transfer it
              </div>
              <Btn kind="primary" onClick={() => addShip(fleet.id)}
                style={{ marginTop: 7, width: "100%", justifyContent: "center" }}>
                <Plus size={14} /> Add carrier
              </Btn>
            </>
          )}
        </div>

        {canEdit && (
          <Btn kind="danger" style={{ width: "100%", justifyContent: "center" }}
            onClick={async () => { if (await confirm(`Disband fleet "${fleet.name}"? This cannot be undone.`)) deleteFleet(fleet.id); }}>
            <Trash2 size={14} /> Disband fleet
          </Btn>
        )}
    </MapPopup>
    {orderOpen && (
      <SquadronOrderModal fleet={fleet} isMobile={isMobile}
        onClose={() => setOrderOpen(false)}
        onSubmit={(detachments, text) => { submitMission(fleet.id, detachments, text); setOrderOpen(false); }} />
    )}
    </>
  );
}
