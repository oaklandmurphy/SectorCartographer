import { useMemo } from "react";
import { Ship, Anchor, Plus, X, Columns2 } from "lucide-react";
import { T, inputStyle, selStyle, lbl, cut } from "../theme.js";
import { squadronsOf, craftInCarrier, craftInFleet, knownModels, knownCarrierModels } from "../lib/carriers.js";
import { mergeNames } from "../lib/shipArt.js";
import Btn from "./ui/Btn.jsx";
import ShipArt from "./ui/ShipArt.jsx";
import ArtLibrary from "./ArtLibrary.jsx";

// A whole fleet at a glance: carriers stacked down a scrolling column, each
// carrier's hangar laid out to its right. A second fleet can be pinned beside
// the first to compare the two.
//
// NOTE: like WikiView, the pane/card/row renderers below are plain functions
// returning JSX (called, not mounted as <Components>) — mounting them would
// remount the subtree on every keystroke and drop focus out of the inputs.
export default function FleetView({
  fleets, systems, canEdit, isMobile, factionById,
  primaryId, setPrimaryId, compareId, setCompareId,
  addShip, patchShip, removeShip,
  addSquadron, patchSquadron, removeSquadron,
  art = [], addArt, patchArt, removeArt,
}) {
  const artNames = useMemo(() => art.map((a) => a.name), [art]);
  // suggest library entries alongside names already in use, so picking a model
  // that has a picture is the path of least resistance
  const models = useMemo(() => mergeNames(knownModels(fleets), artNames), [fleets, artNames]);
  const carrierModels = useMemo(() => mergeNames(knownCarrierModels(fleets), artNames), [fleets, artNames]);
  const MODELS_ID = "fleetview-models";
  const CARRIER_MODELS_ID = "fleetview-carrier-models";

  // Art big enough to actually read the hull. Ships are wide, so these boxes are
  // landscape; the hull column is sized from the art rather than the other way round.
  const ART_W = isMobile ? 132 : 188;
  const ART_H = isMobile ? 76 : 106;
  const HULL_COL = ART_W + 10;      // + the faction stripe and its gap
  const SQ_ART_W = isMobile ? 42 : 56;
  const SQ_ART_H = isMobile ? 28 : 36;
  // Empty slots only once the sector has art: they keep rows aligned when some
  // ships have a picture and some don't, but a sector with no art at all
  // shouldn't be a grid of dashed boxes.
  const showSlots = art.length > 0;

  // Fall back to the first fleet so the tab always opens on something, and so an
  // id that's been deleted — or hidden from this viewer — can't strand the view
  // on a blank pane.
  const primary = fleets.find((f) => f.id === primaryId) || fleets[0] || null;
  const compare = fleets.find((f) => f.id === compareId) || null;

  // setPrimaryId drops a self-comparison itself (see App.jsx) — doing it here
  // too would be a second URL change, i.e. two Back presses for one pick.
  const selectPrimary = (id) => setPrimaryId(id);

  /* ------------------------------------------------ one squadron: a count of one model */
  const squadronRow = (fleet, sh, sq) => (
    <div key={sq.id} style={{ display: "flex", gap: 6, alignItems: "center" }}>
      <ShipArt art={art} model={sq.model} size={SQ_ART_W} height={SQ_ART_H} plate
        placeholder={showSlots} />
      {canEdit ? (
        <>
          <input className="mono" type="number" min="0" step="1" value={sq.count}
            onChange={(e) => patchSquadron(fleet.id, sh.id, sq.id,
              { count: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
            style={{ ...inputStyle, padding: "3px 4px", width: 52, textAlign: "right" }} />
          <span style={{ color: T.faint, fontSize: 11, flexShrink: 0 }}>×</span>
          <input className="mono" list={MODELS_ID} value={sq.model || ""} placeholder="model"
            onChange={(e) => patchSquadron(fleet.id, sh.id, sq.id, { model: e.target.value })}
            style={{ ...inputStyle, padding: "3px 6px", flex: 1, minWidth: 0 }} />
          <button onClick={() => removeSquadron(fleet.id, sh.id, sq.id)} title="Remove squadron"
            style={{ background: "none", border: "none", color: T.danger, cursor: "pointer", padding: 2, flexShrink: 0 }}>
            <X size={12} />
          </button>
        </>
      ) : (
        <div className="mono" style={{ display: "flex", gap: 6, alignItems: "baseline", fontSize: 12, minWidth: 0 }}>
          <span style={{ color: T.accent, fontWeight: 700, minWidth: 30, textAlign: "right" }}>
            {Number(sq.count) || 0}
          </span>
          <span style={{ color: T.faint }}>×</span>
          <span style={{ color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {sq.model || <span style={{ color: T.faint, fontStyle: "italic" }}>unnamed model</span>}
          </span>
        </div>
      )}
    </div>
  );

  /* ------------------------------------------------ one carrier: hull on the left, hangar on the right */
  const carrierCard = (fleet, sh, facColor) => (
    <div key={sh.id} style={{ display: "flex", gap: 10, alignItems: "stretch", background: T.panel2,
      border: `1px solid ${T.line}`, borderRadius: 2, padding: 8 }}>

      <div style={{ width: HULL_COL, flexShrink: 0, display: "flex", gap: 6 }}>
        <div style={{ width: 4, background: facColor, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {/* the hull, big enough to actually look at */}
          <ShipArt art={art} model={sh.model} size={ART_W} height={ART_H} plate
            placeholder={showSlots} title={sh.model || undefined} />
          <div style={{ display: "flex", gap: 3, alignItems: "center" }}>
            {canEdit ? (
              <input value={sh.name} onChange={(e) => patchShip(fleet.id, sh.id, { name: e.target.value })}
                style={{ ...inputStyle, padding: "3px 6px", fontWeight: 600, minWidth: 0 }} />
            ) : (
              <div className="stencil" style={{ flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 700,
                letterSpacing: ".03em", color: T.text, overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap" }}>
                {sh.name}
              </div>
            )}
            {canEdit && (
              <button onClick={() => removeShip(fleet.id, sh.id)} title="Remove carrier"
                style={{ background: "none", border: "none", color: T.danger, cursor: "pointer",
                  padding: 2, flexShrink: 0 }}>
                <X size={13} />
              </button>
            )}
          </div>
          {/* the carrier's design — sister ships share it, and the art library matches on it */}
          {canEdit ? (
            <input className="mono" list={CARRIER_MODELS_ID} value={sh.model || ""} placeholder="class"
              onChange={(e) => patchShip(fleet.id, sh.id, { model: e.target.value })}
              style={{ ...inputStyle, padding: "2px 6px", fontSize: 10.5, minWidth: 0 }} />
          ) : sh.model ? (
            <div className="mono" style={{ fontSize: 10, color: T.mut, overflow: "hidden",
              textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sh.model}</div>
          ) : null}
          <div className="mono" style={{ fontSize: 10, color: T.faint }}>
            {craftInCarrier(sh)} craft · {squadronsOf(sh).length} sqn
          </div>
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0, borderLeft: `1px solid ${T.line}`, paddingLeft: 10,
        display: "flex", flexDirection: "column", gap: 4 }}>
        {squadronsOf(sh).length === 0 && (
          <div style={{ fontSize: 10.5, color: T.faint, fontStyle: "italic" }}>Empty hangar</div>
        )}
        {squadronsOf(sh).map((sq) => squadronRow(fleet, sh, sq))}
        {canEdit && (
          <Btn onClick={() => addSquadron(fleet.id, sh.id)}
            style={{ marginTop: 2, alignSelf: "flex-start", padding: "3px 8px", fontSize: 10.5 }}>
            <Plus size={12} /> Add squadron
          </Btn>
        )}
      </div>
    </div>
  );

  /* ------------------------------------------------ pane header: whose fleet, where, how big */
  const paneHeader = (fleet) => {
    const fac = factionById(fleet.factionId) || {};
    const home = fleet.systemId ? systems.find((s) => s.id === fleet.systemId) : null;
    const n = fleet.ships.length;
    return (
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${T.line}`, background: T.panel,
        flexShrink: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 10, height: 10, background: fac.color, flexShrink: 0, ...cut(2) }} />
          <span className="stencil" style={{ fontSize: 17, fontWeight: 800, letterSpacing: ".04em",
            color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {fleet.name}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
          fontSize: 10.5, color: T.mut }}>
          <span>{fac.name}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <Anchor size={11} style={{ color: T.faint }} />
            {home ? home.name : "In transit"}
          </span>
          <span className="mono" style={{ color: T.faint }}>
            {n} carrier{n === 1 ? "" : "s"} · {craftInFleet(fleet)} craft
          </span>
        </div>
      </div>
    );
  };

  /* ------------------------------------------------ one fleet column */
  const fleetColor = (fleet) => (factionById(fleet.factionId) || {}).color;
  const pane = (fleet, isCompare) => (
    <div key={isCompare ? "cmp" : "pri"}
      style={{ flex: 1, minWidth: 0, minHeight: isMobile ? "auto" : 0, display: "flex",
        flexDirection: "column",
        borderLeft: isCompare && !isMobile ? `2px solid ${T.line}` : undefined,
        borderTop: isCompare && isMobile ? `2px solid ${T.line}` : undefined }}>
      {paneHeader(fleet)}
      <div className={isMobile ? "" : "scroll"}
        style={{ flex: 1, minHeight: 0, overflowY: isMobile ? "visible" : "auto", padding: 10,
          display: "flex", flexDirection: "column", gap: 8 }}>
        {fleet.ships.length === 0 && (
          <div style={{ fontSize: 11.5, color: T.faint, padding: "16px 8px", textAlign: "center",
            border: `1px dashed ${T.line}`, lineHeight: 1.6 }}>
            No carriers in this fleet.{canEdit ? " Add one below." : ""}
          </div>
        )}
        {fleet.ships.map((sh) => carrierCard(fleet, sh, fleetColor(fleet)))}
        {canEdit && (
          <Btn kind="primary" onClick={() => addShip(fleet.id)} style={{ justifyContent: "center" }}>
            <Plus size={14} /> Add carrier
          </Btn>
        )}
      </div>
    </div>
  );

  /* ------------------------------------------------ fleet pickers */
  const bar = (
    <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", padding: "8px 10px",
      background: `linear-gradient(180deg, ${T.panel}, ${T.panel2})`, borderBottom: `2px solid ${T.line}`,
      flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Ship size={14} style={{ color: T.accent, flexShrink: 0 }} />
        <span style={lbl}>Fleet</span>
        <select value={primary ? primary.id : ""} onChange={(e) => selectPrimary(e.target.value)}
          disabled={fleets.length === 0}
          style={{ ...selStyle, width: "auto", minWidth: isMobile ? 130 : 180 }}>
          {fleets.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Columns2 size={14} style={{ color: compare ? T.accent : T.faint, flexShrink: 0 }} />
        <span style={lbl}>Compare</span>
        <select value={compare ? compare.id : ""} onChange={(e) => setCompareId(e.target.value || null)}
          disabled={fleets.length < 2}
          style={{ ...selStyle, width: "auto", minWidth: isMobile ? 130 : 180,
            color: compare ? T.text : T.faint }}>
          <option value="">— none —</option>
          {fleets.filter((f) => !primary || f.id !== primary.id)
            .map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        {compare && (
          <button onClick={() => setCompareId(null)} title="Stop comparing"
            style={{ background: "none", border: `1px solid ${T.line}`, borderRadius: 2, color: T.faint,
              cursor: "pointer", padding: 4, display: "flex", flexShrink: 0 }}>
            <X size={13} />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: T.void }}>
      {/* every model already flying in the sector, plus every named art entry */}
      <datalist id={MODELS_ID}>
        {models.map((m) => <option key={m} value={m} />)}
      </datalist>
      <datalist id={CARRIER_MODELS_ID}>
        {carrierModels.map((m) => <option key={m} value={m} />)}
      </datalist>
      <ArtLibrary art={art} fleets={fleets} canEdit={canEdit}
        addArt={addArt} patchArt={patchArt} removeArt={removeArt} />
      {bar}
      {!primary ? (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 12, color: T.faint, padding: 24, textAlign: "center" }}>
          <Ship size={40} strokeWidth={1.2} />
          <div className="stencil" style={{ fontSize: 15, letterSpacing: ".06em", color: T.mut }}>NO FLEETS</div>
          <div style={{ fontSize: 11.5, lineHeight: 1.6, maxWidth: 320 }}>
            This sector has no fleets{canEdit ? " — add one from the map's toolbar." : " visible to you."}
          </div>
        </div>
      ) : (
        <div className={isMobile ? "scroll" : ""}
          style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: isMobile ? "column" : "row",
            overflowY: isMobile ? "auto" : "hidden" }}>
          {pane(primary, false)}
          {compare && pane(compare, true)}
        </div>
      )}
    </div>
  );
}
