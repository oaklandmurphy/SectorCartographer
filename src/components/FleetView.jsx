import { useMemo, useState } from "react";
import { Ship, Anchor, Plus, X, Columns2, StickyNote, Rocket, Clock, Check, SplitSquareHorizontal,
  History, ChevronDown, ChevronUp, Route } from "lucide-react";
import { T, F, inputStyle, selStyle, lbl, cut } from "../theme.js";
import { squadronsOf, craftInCarrier, craftInFleet, knownModels, knownCarrierModels } from "../lib/carriers.js";
import { mergeNames } from "../lib/shipArt.js";
import Btn from "./ui/Btn.jsx";
import ShipArt from "./ui/ShipArt.jsx";
import ArtLibrary from "./ArtLibrary.jsx";
import SquadronOrderModal from "./SquadronOrderModal.jsx";
import MissionResolution from "./ui/MissionResolution.jsx";

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
  addShip, patchShip, removeShip, renameFleet,
  addSquadron, patchSquadron, removeSquadron,
  art = [], addArt, patchArt, removeArt,
  missions = [], archivedMissions = [], canOrderFor, canSuggestFor, submitMission, onOpenFleetTransfer, onOrderFleetMove,
}) {
  // Which fleet's squadron-order composer is open, if any (by fleet id).
  const [orderFleetId, setOrderFleetId] = useState(null);
  // Per-fleet: whether that fleet's archived (previous-turn) missions are
  // revealed below the current ones — keyed by fleet id so comparing two
  // fleets side by side doesn't share one toggle between them.
  const [openMissionHistory, setOpenMissionHistory] = useState({});
  const orderFleet = fleets.find((f) => f.id === orderFleetId) || null;
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

  /* ------------------------------------------------ one squadron: a count of one model.
     Editing on mobile: the hangar column only has ~170px to work with once the hull
     column takes its share, so squeezing count + × + model name + remove into one row
     left the model input a sliver wide. Edit mode wraps to a second line there instead —
     view mode (a single line of text) fits fine either way. */
  const squadronRow = (fleet, sh, sq) => (
    <div key={sq.id} style={{ display: "flex", flexDirection: canEdit && isMobile ? "column" : "row",
      gap: canEdit && isMobile ? 4 : 6 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <ShipArt art={art} model={sq.model} size={SQ_ART_W} height={SQ_ART_H} plate
          placeholder={showSlots} color={fleetColor(fleet)} />
        {canEdit ? (
          <>
            <input className="mono" type="number" min="0" step="1" value={sq.count}
              onChange={(e) => patchSquadron(fleet.id, sh.id, sq.id,
                { count: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
              style={{ ...inputStyle, padding: "3px 4px", width: 52, textAlign: "right" }} />
            <span style={{ color: T.faint, fontSize: 11, flexShrink: 0 }}>×</span>
            {!isMobile && (
              <input className="mono" list={MODELS_ID} value={sq.model || ""} placeholder="model"
                onChange={(e) => patchSquadron(fleet.id, sh.id, sq.id, { model: e.target.value })}
                style={{ ...inputStyle, padding: "3px 6px", flex: 1, minWidth: 0 }} />
            )}
            <button onClick={() => removeSquadron(fleet.id, sh.id, sq.id)} title="Remove squadron"
              style={{ background: "none", border: "none", color: T.danger, cursor: "pointer", padding: 2,
                flexShrink: 0, marginLeft: isMobile ? "auto" : 0 }}>
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
      {canEdit && isMobile && (
        <input className="mono" list={MODELS_ID} value={sq.model || ""} placeholder="model"
          onChange={(e) => patchSquadron(fleet.id, sh.id, sq.id, { model: e.target.value })}
          style={{ ...inputStyle, padding: "3px 6px", width: "100%" }} />
      )}
    </div>
  );

  /* ------------------------------------------------ one carrier: hull on the left, hangar on the right */
  const carrierCard = (fleet, sh, facColor) => (
    <div key={sh.id} style={{ display: "flex", flexDirection: "column", gap: 8, background: T.panel2,
      border: `1px solid ${T.line}`, borderRadius: 2, padding: 8 }}>

     <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
      <div style={{ width: HULL_COL, flexShrink: 0, display: "flex", gap: 6 }}>
        <div style={{ width: 4, background: facColor, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
          {/* the hull, big enough to actually look at */}
          <ShipArt art={art} model={sh.model} size={ART_W} height={ART_H} plate
            placeholder={showSlots} title={sh.model || undefined} color={facColor} />
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

      {/* free-form notes on this carrier — round-trips as ship.notes (see sectorSchema fleets codec).
          Hidden entirely for read-only viewers when there's nothing written yet. */}
      {(canEdit || sh.notes) && (
        <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 8, display: "flex",
          flexDirection: "column", gap: 4 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <StickyNote size={11} style={{ color: T.faint, flexShrink: 0 }} />
            <span style={lbl}>Notes</span>
          </div>
          {canEdit ? (
            <textarea value={sh.notes || ""} placeholder="Track anything about this ship…"
              onChange={(e) => patchShip(fleet.id, sh.id, { notes: e.target.value })} rows={2}
              style={{ ...inputStyle, padding: "5px 8px", resize: "vertical", minHeight: 44,
                lineHeight: 1.5 }} />
          ) : (
            <div style={{ fontSize: 12, color: T.mut, whiteSpace: "pre-wrap", wordBreak: "break-word",
              lineHeight: 1.5 }}>{sh.notes}</div>
          )}
        </div>
      )}
    </div>
  );

  /* ------------------------------------------------ pane header: whose fleet, where, how big */
  const paneHeader = (fleet) => {
    const fac = factionById(fleet.factionId) || {};
    const home = fleet.systemId ? systems.find((s) => s.id === fleet.systemId) : null;
    const n = fleet.ships.length;
    const canGiveOrder = !!canOrderFor && canOrderFor(fleet.factionId);
    // Not your fleet, but a friendly (ally/vassal) one you may suggest a move for.
    const canSuggest = !canGiveOrder && !!canSuggestFor && canSuggestFor(fleet.factionId);
    return (
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${T.line}`, background: T.panel,
        flexShrink: 0, display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 10, height: 10, background: fac.color, flexShrink: 0, ...cut(2) }} />
          {(canEdit || canGiveOrder) ? (
            <input value={fleet.name} onChange={(e) => renameFleet(fleet.id, e.target.value)}
              className="stencil" style={{ ...inputStyle, flex: "0 1 auto", minWidth: 80, maxWidth: 220,
                fontSize: 17, fontWeight: 800, letterSpacing: ".04em", padding: "3px 6px" }} />
          ) : (
            <span className="stencil" style={{ fontSize: 17, fontWeight: 800, letterSpacing: ".04em",
              color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {fleet.name}
            </span>
          )}
          {canGiveOrder && (
            <Btn kind="primary" onClick={() => setOrderFleetId(fleet.id)} disabled={craftInFleet(fleet) === 0}
              title={craftInFleet(fleet) === 0 ? "No craft in this fleet's hangars" : "Send fighters/bombers on a mission"}
              style={{ marginLeft: "auto", flexShrink: 0 }}>
              <Rocket size={12} /> {!isMobile && "Squadron order"}
            </Btn>
          )}
          {canGiveOrder && (
            <Btn onClick={() => onOpenFleetTransfer(fleet.id)}
              title="Transfer carriers or squadrons to another fleet in this system" style={{ flexShrink: 0 }}>
              <SplitSquareHorizontal size={12} /> {!isMobile && "Transfer"}
            </Btn>
          )}
          {canGiveOrder && (
            <Btn onClick={() => onOrderFleetMove(fleet.id)}
              title="Jump to the map, zoomed in on this fleet, ready to plot its move order" style={{ flexShrink: 0 }}>
              <Route size={12} /> {!isMobile && "Move"}
            </Btn>
          )}
          {canSuggest && (
            <Btn onClick={() => onOrderFleetMove(fleet.id)}
              title="Suggest a move for this ally/vassal fleet — the GM decides at turn resolution whether to apply it"
              style={{ marginLeft: "auto", flexShrink: 0 }}>
              <Route size={12} /> {!isMobile && "Suggest move"}
            </Btn>
          )}
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

  /* ------------------------------------------------ one squadron mission request */
  const detachmentSummary = (m) => (m.detachments || [])
    .map((d) => `${d.count}×${d.model || "unnamed"}`).join(", ");
  const missionCard = (fleet, m) => {
    const resolved = m.status === "resolved";
    return (
      <div key={m.id} style={{ border: `1px solid ${resolved ? T.line : T.accent}`, borderRadius: 2,
        background: T.panel3, display: "flex", flexDirection: "column", gap: 6, padding: 9 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5,
            fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
            color: resolved ? T.accent : T.amber }}>
            {resolved ? <Check size={11} /> : <Clock size={11} />}{resolved ? "Resolved" : "On mission"}
          </span>
          <span className="mono" style={{ fontSize: 10.5, color: T.mut }}>{detachmentSummary(m)}</span>
        </div>
        <div style={{ fontFamily: F.mono,
          fontSize: 13, lineHeight: 1.6, color: T.text, whiteSpace: "pre-wrap" }}>{m.text}</div>
        {resolved && (
          <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 6 }}>
            {m.resolution
              ? <MissionResolution resolution={m.resolution} />
              : <div style={{ fontSize: 11.5, color: T.mut }}>Resolved (no ruling recorded).</div>}
          </div>
        )}
      </div>
    );
  };

  /* ------------------------------------------------ one fleet column */
  const fleetColor = (fleet) => (factionById(fleet.factionId) || {}).color;
  const pane = (fleet, isCompare) => {
    const fleetMissions = missions.filter((m) => m.fleetId === fleet.id);
    const pendingMissions = fleetMissions.filter((m) => m.status !== "resolved")
      .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const resolvedMissions = fleetMissions.filter((m) => m.status === "resolved")
      .sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0));
    // Previous turns' resolved missions — see App.jsx's nextTurn — hidden by
    // default behind the toggle below, same idea as AgentsView's Past Turns.
    const archivedFleetMissions = archivedMissions.filter((m) => m.fleetId === fleet.id)
      .sort((a, b) => (b.turnEndedAt || 0) - (a.turnEndedAt || 0));
    const historyOpen = !!openMissionHistory[fleet.id];
    return (
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
        {(fleetMissions.length > 0 || archivedFleetMissions.length > 0) && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingTop: 8, marginTop: 2,
            borderTop: `1px solid ${T.line}` }}>
            <span style={{ ...lbl, display: "flex", alignItems: "center", gap: 5 }}>
              <Rocket size={11} /> Squadron missions
            </span>
            {pendingMissions.map((m) => missionCard(fleet, m))}
            {resolvedMissions.map((m) => missionCard(fleet, m))}
            {archivedFleetMissions.length > 0 && (
              <>
                <Btn onClick={() => setOpenMissionHistory((o) => ({ ...o, [fleet.id]: !o[fleet.id] }))}
                  title={historyOpen ? "Hide previous turns' missions" : "See this fleet's missions from previous turns"}
                  style={{ justifyContent: "center", marginTop: 2 }}>
                  <History size={13} /> {historyOpen ? "Hide" : "Show"} past missions ({archivedFleetMissions.length})
                  {historyOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                </Btn>
                {historyOpen && archivedFleetMissions.map((m) => missionCard(fleet, m))}
              </>
            )}
          </div>
        )}
      </div>
    </div>
    );
  };

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
      {orderFleet && (
        <SquadronOrderModal fleet={orderFleet} isMobile={isMobile}
          onClose={() => setOrderFleetId(null)}
          onSubmit={(detachments, text) => { submitMission(orderFleet.id, detachments, text); setOrderFleetId(null); }} />
      )}
    </div>
  );
}
