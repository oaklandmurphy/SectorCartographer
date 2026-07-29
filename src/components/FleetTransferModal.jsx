import { useEffect, useMemo, useState } from "react";
import { ArrowRight, ArrowLeft, ChevronDown, ChevronUp, GripVertical, SplitSquareHorizontal } from "lucide-react";
import { T, panelStyle, inputStyle, selStyle, lbl, cut } from "../theme.js";
import { squadronsOf, craftInCarrier } from "../lib/carriers.js";
import { friendlyFleetsInSystem } from "../lib/fleets.js";
import Btn from "./ui/Btn.jsx";
import PopupHeader from "./ui/PopupHeader.jsx";
import ShipArt from "./ui/ShipArt.jsx";

// Fleet transfer: move whole carriers or a single squadron between the source
// fleet and a friendly fleet in the same system (or spin off a brand-new
// one), via drag-and-drop or the arrow/transfer controls. Carrier/squadron
// editing (model, counts) stays FleetView's job — this modal only moves
// things between fleets (though it can rename either fleet along the way).
export default function FleetTransferModal({
  fleetId, fleets, systems, factionById, art = [], isMobile, onClose,
  transferShips, transferSquadron, transferVessel, splitToNewFleet, renameFleet,
}) {
  const [targetMode, setTargetMode] = useState("existing"); // "existing" | "new"
  const [targetFleetId, setTargetFleetId] = useState("");
  const [newFleetName, setNewFleetName] = useState("");
  const [dragPayload, setDragPayload] = useState(null); // { kind: "ship"|"squadron", fromFleetId, shipId, squadronId?, fromShipId? }
  const [expandedSquadronId, setExpandedSquadronId] = useState(null); // squadron whose carrier list is open

  const source = fleets.find((f) => f.id === fleetId) || null;
  const siblings = useMemo(
    () => (source ? friendlyFleetsInSystem(fleets, source.systemId, source.factionId, source.id) : []),
    [fleets, source]
  );

  // Keep the picked target valid as fleets change (including right after our
  // own transfers), and fall back to "new fleet" mode when there's no
  // eligible existing target left to offer.
  useEffect(() => {
    if (targetMode === "existing" && !siblings.some((f) => f.id === targetFleetId)) {
      if (siblings.length > 0) setTargetFleetId(siblings[0].id);
      else setTargetMode("new");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siblings]);

  if (!source) return null;
  const target = targetMode === "existing" ? (fleets.find((f) => f.id === targetFleetId) || null) : null;
  const facColor = (fid) => (factionById(fid) || {}).color;
  const home = (fleet) => (fleet.systemId ? systems.find((s) => s.id === fleet.systemId) : null);

  const startShipDrag = (e, fromFleetId, shipId) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", shipId);
    setDragPayload({ kind: "ship", fromFleetId, shipId });
  };
  const startSquadronDrag = (e, fromFleetId, fromShipId, squadronId) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", squadronId);
    setDragPayload({ kind: "squadron", fromFleetId, fromShipId, squadronId });
  };
  const endDrag = () => setDragPayload(null);

  // A column's own area: a whole carrier dropped from the other side.
  const columnDrop = (toFleetId) => (e) => {
    e.preventDefault();
    const p = dragPayload;
    setDragPayload(null);
    if (!p || p.kind !== "ship" || p.fromFleetId === toFleetId) return;
    transferShips(p.fromFleetId, toFleetId, [p.shipId]);
  };
  // The not-yet-created "new fleet" placeholder: the first carrier dropped
  // here spawns it.
  const newFleetDrop = (e) => {
    e.preventDefault();
    const p = dragPayload;
    setDragPayload(null);
    if (!p || p.kind !== "ship") return;
    const newId = splitToNewFleet(p.fromFleetId, [p.shipId], newFleetName);
    if (newId) { setTargetMode("existing"); setTargetFleetId(newId); }
  };
  // A carrier card's own drop target: a single squadron, from either side —
  // including the same fleet, which just reassigns it to a different carrier.
  const carrierDrop = (toFleetId, toShipId) => (e) => {
    const p = dragPayload;
    if (!p || p.kind !== "squadron") return; // let a "ship" drop bubble up to the column handler
    e.preventDefault();
    e.stopPropagation();
    setDragPayload(null);
    if (p.fromShipId === toShipId) return;
    transferSquadron(p.fromFleetId, p.fromShipId, toFleetId, toShipId, p.squadronId);
  };

  const handleShipArrow = (fleet, sh, other) => {
    if (other) transferShips(fleet.id, other.id, [sh.id]);
    else if (targetMode === "new") {
      const newId = splitToNewFleet(fleet.id, [sh.id], newFleetName);
      if (newId) { setTargetMode("existing"); setTargetFleetId(newId); }
    }
  };

  const emptyState = (
    <div style={{ fontSize: 11, color: T.faint, padding: "20px 6px", textAlign: "center", border: `1px dashed ${T.line}` }}>
      No carriers
    </div>
  );

  // Every other carrier across both fleets that could receive one vessel out
  // of this squadron — not limited to the opposite column, since a vessel can
  // also move to another carrier in its own fleet.
  const squadronRow = (fleet, sh, sq) => {
    const groups = [source, ...(target ? [target] : [])]
      .map((f) => ({ fleet: f, ships: f.ships.filter((s) => s.id !== sh.id) }))
      .filter((g) => g.ships.length > 0);
    const hasTargets = groups.length > 0;
    const expanded = expandedSquadronId === sq.id;
    return (
      <div key={sq.id} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <div draggable onDragStart={(e) => startSquadronDrag(e, fleet.id, sh.id, sq.id)} onDragEnd={endDrag}
          style={{ display: "flex", alignItems: "center", gap: 6, cursor: "grab" }}>
          <GripVertical size={11} style={{ color: T.faint, flexShrink: 0 }} />
          <ShipArt art={art} model={sq.model} size={20} placeholder={false} color={facColor(fleet.factionId)} />
          <div className="mono" style={{ display: "flex", gap: 5, alignItems: "baseline", fontSize: 11.5, flex: 1, minWidth: 0 }}>
            <span style={{ color: T.accent, fontWeight: 700, minWidth: 24, textAlign: "right", flexShrink: 0 }}>
              {Number(sq.count) || 0}
            </span>
            <span style={{ color: T.faint, flexShrink: 0 }}>×</span>
            <span style={{ color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {sq.model || <span style={{ color: T.faint, fontStyle: "italic" }}>unnamed model</span>}
            </span>
          </div>
          <Btn kind="primary" active={expanded} disabled={!hasTargets}
            onClick={() => setExpandedSquadronId(expanded ? null : sq.id)}
            title={hasTargets ? "Transfer one vessel to a carrier" : "No other carrier to receive it"}
            style={{ padding: "4px 8px", fontSize: 10, flexShrink: 0, gap: 4 }}>
            {!isMobile && "Transfer"} {expanded ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
          </Btn>
        </div>
        {expanded && hasTargets && (
          <div style={{ marginLeft: 21, marginTop: 5, marginBottom: 1, borderRadius: 3, overflow: "hidden",
            border: `1px solid ${T.accent}`, boxShadow: "0 6px 16px rgba(0,0,0,.4)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 9px",
              background: "rgba(159,194,58,.16)", borderBottom: `1px solid ${T.line}` }}>
              <ArrowRight size={11} style={{ color: T.accent, flexShrink: 0 }} />
              <span style={{ fontSize: 10.5, color: T.text }}>
                Send 1 <b style={{ color: T.accent }}>{sq.model || "vessel"}</b> to
              </span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", background: T.panel3 }}>
              {groups.map((g) => (
                <div key={g.fleet.id}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: T.faint, textTransform: "uppercase",
                    letterSpacing: ".08em", padding: "5px 9px 3px" }}>
                    {g.fleet.name}
                  </div>
                  {g.ships.map((s) => (
                    <Btn key={s.id} onClick={() => transferVessel(fleet.id, sh.id, g.fleet.id, s.id, sq.id)}
                      title={`Send 1 ${sq.model || "vessel"} to ${s.name}`}
                      style={{ width: "100%", justifyContent: "flex-start", borderRadius: 0, border: "none",
                        borderTop: `1px solid ${T.line}`, background: "none", boxShadow: "none",
                        padding: "6px 9px", fontSize: 11, fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
                      <ShipArt art={art} model={s.model} size={18} placeholder={false} color={facColor(g.fleet.factionId)} />
                      <span style={{ flex: 1, minWidth: 0, textAlign: "left", overflow: "hidden",
                        textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                      <ArrowRight size={11} style={{ color: T.accent, flexShrink: 0 }} />
                    </Btn>
                  ))}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  };

  const carrierCard = (fleet, sh, other, direction) => (
    <div key={sh.id} draggable onDragStart={(e) => startShipDrag(e, fleet.id, sh.id)} onDragEnd={endDrag}
      onDragOver={(e) => e.preventDefault()} onDrop={carrierDrop(fleet.id, sh.id)}
      style={{ display: "flex", flexDirection: "column", gap: 6, background: T.panel2,
        border: `1px solid ${T.line}`, borderRadius: 2, padding: 6, cursor: "grab" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <GripVertical size={12} style={{ color: T.faint, flexShrink: 0 }} />
        <div style={{ width: 3, alignSelf: "stretch", background: facColor(fleet.factionId), flexShrink: 0 }} />
        <ShipArt art={art} model={sh.model} size={30} placeholder={false} color={facColor(fleet.factionId)} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="stencil" style={{ fontSize: 13, fontWeight: 700, color: T.text,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sh.name}</div>
          <div className="mono" style={{ fontSize: 9.5, color: T.faint }}>
            {craftInCarrier(sh)} craft · {squadronsOf(sh).length} sqn
          </div>
        </div>
        <Btn kind="primary" disabled={!other && targetMode !== "new"}
          onClick={() => handleShipArrow(fleet, sh, other)}
          title={other ? `Move to ${other.name}` : targetMode === "new" ? "Spin off into the new fleet" : "No target fleet selected"}
          style={{ padding: "5px 8px", flexShrink: 0 }}>
          {direction === "right" ? <ArrowRight size={13} /> : <ArrowLeft size={13} />}
        </Btn>
      </div>
      <div style={{ paddingLeft: 21, display: "flex", flexDirection: "column", gap: 4 }}>
        {squadronsOf(sh).length === 0 && (
          <div style={{ fontSize: 10, color: T.faint, fontStyle: "italic" }}>Empty hangar</div>
        )}
        {squadronsOf(sh).map((sq) => squadronRow(fleet, sh, sq))}
      </div>
    </div>
  );

  const columnHeader = (fleet) => {
    const fac = factionById(fleet.factionId) || {};
    const h = home(fleet);
    const n = fleet.ships.length;
    return (
      <div style={{ padding: "9px 10px", borderBottom: `1px solid ${T.line}`, background: T.panel2,
        display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <div style={{ width: 9, height: 9, background: fac.color, flexShrink: 0, ...cut(2) }} />
          <input value={fleet.name} onChange={(e) => renameFleet(fleet.id, e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            className="stencil" style={{ ...inputStyle, flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700,
              padding: "4px 7px" }} />
        </div>
        <div className="mono" style={{ fontSize: 9.5, color: T.faint, display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ color: fac.color }}>{fac.name}</span>
          <span style={{ color: T.line }}>·</span>
          <span>{h ? h.name : "In transit"}</span>
          <span style={{ color: T.line }}>·</span>
          <span>{n} carrier{n === 1 ? "" : "s"}</span>
        </div>
      </div>
    );
  };

  return (
    <div onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: "fixed", inset: 0, zIndex: 900, background: "rgba(6,5,3,.72)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div onPointerDown={(e) => e.stopPropagation()}
        style={{ ...panelStyle, ...cut(10), width: "100%", maxWidth: 880, maxHeight: "90vh",
          display: "flex", flexDirection: "column", background: T.panel }}>
        <PopupHeader color={facColor(source.factionId)} icon={<SplitSquareHorizontal size={14} />}
          title="FLEET TRANSFER" onClose={onClose} />

        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: isMobile ? "column" : "row" }}>
          {/* left: the fleet this popup was opened from */}
          <div style={{ flex: 1, minWidth: 0, minHeight: isMobile ? 160 : undefined, display: "flex",
            flexDirection: "column", borderRight: isMobile ? "none" : `1px solid ${T.line}`,
            borderBottom: isMobile ? `1px solid ${T.line}` : "none" }}>
            {columnHeader(source)}
            <div className="scroll" onDragOver={(e) => e.preventDefault()} onDrop={columnDrop(source.id)}
              style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10, display: "flex",
                flexDirection: "column", gap: 8 }}>
              {source.ships.length === 0 && emptyState}
              {source.ships.map((sh) => carrierCard(source, sh, target, "right"))}
            </div>
          </div>

          {/* middle: target picker */}
          <div style={{ width: isMobile ? "100%" : 210, flexShrink: 0, display: "flex",
            flexDirection: isMobile ? "row" : "column", alignItems: "center", justifyContent: "center", gap: 12,
            padding: isMobile ? 12 : 18, background: T.void,
            borderRight: isMobile ? "none" : `1px solid ${T.line}`,
            borderBottom: isMobile ? `1px solid ${T.line}` : "none" }}>
            {!isMobile && <ArrowRight size={16} style={{ color: T.faint, flexShrink: 0 }} />}
            <div style={{ display: "flex", flexDirection: "column", gap: 6, width: isMobile ? "auto" : "100%" }}>
              <div style={lbl}>Target fleet</div>
              <select value={targetMode === "new" ? "__new__" : targetFleetId}
                onChange={(e) => {
                  if (e.target.value === "__new__") setTargetMode("new");
                  else { setTargetMode("existing"); setTargetFleetId(e.target.value); }
                }}
                style={{ ...selStyle, width: isMobile ? "auto" : "100%" }}>
                {siblings.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
                <option value="__new__">+ New Fleet</option>
              </select>
              {targetMode === "new" && (
                <input value={newFleetName} onChange={(e) => setNewFleetName(e.target.value)}
                  placeholder="New Fleet" style={{ ...inputStyle, width: isMobile ? "auto" : "100%" }} />
              )}
            </div>
          </div>

          {/* right: the chosen target fleet, or the not-yet-created new one */}
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            {target ? columnHeader(target) : (
              <div style={{ padding: "9px 10px", borderBottom: `1px solid ${T.line}`, background: T.panel2,
                flexShrink: 0, display: "flex", alignItems: "center", gap: 8 }}>
                <span className="stencil" style={{ fontSize: 13.5, fontWeight: 700, color: T.faint, flex: 1, minWidth: 0,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {newFleetName.trim() || "New Fleet"}
                </span>
                <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
                  color: T.faint, background: T.panel3, border: `1px solid ${T.line}`, borderRadius: 2,
                  padding: "2px 6px", flexShrink: 0 }}>
                  Not yet created
                </span>
              </div>
            )}
            {target ? (
              <div className="scroll" onDragOver={(e) => e.preventDefault()} onDrop={columnDrop(target.id)}
                style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10, display: "flex",
                  flexDirection: "column", gap: 8 }}>
                {target.ships.length === 0 && emptyState}
                {target.ships.map((sh) => carrierCard(target, sh, source, "left"))}
              </div>
            ) : (
              <div onDragOver={(e) => e.preventDefault()} onDrop={newFleetDrop}
                style={{ flex: 1, minHeight: 0, display: "flex", alignItems: "center", justifyContent: "center",
                  textAlign: "center", margin: 10, border: `1px dashed ${T.line}`, borderRadius: 2, padding: 16,
                  color: T.faint, fontSize: 11.5 }}>
                Drag a carrier here, or use its arrow button, to spin off this new fleet
              </div>
            )}
          </div>
        </div>

        <div style={{ fontSize: 9.5, color: T.faint, padding: "7px 12px", borderTop: `1px solid ${T.line}`,
          background: T.panel2, display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
          <GripVertical size={11} style={{ flexShrink: 0 }} />
          Drag a carrier or squadron to the other column, or use the arrow and transfer controls
        </div>
      </div>
    </div>
  );
}
