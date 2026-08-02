import { useMemo, useRef, useState } from "react";
import { Rocket, Trash2, Dices, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6,
  Users, Check, Clock, Wand2, Ship, Pencil, X } from "lucide-react";
import { T, F, inputStyle, selStyle, lbl, cut } from "../theme.js";
import {
  RATIO_COLS, EVEN_RATIO_INDEX, MIN_SHIFT, MAX_SHIFT,
  successGrade, casualtyPct, rollTwoD6, nearestRatioIndex, isBeyondTable,
} from "../lib/missionOdds.js";
import { useConfirm } from "../hooks/useConfirm.jsx";
import Btn from "./ui/Btn.jsx";
import MissionResolution from "./ui/MissionResolution.jsx";
import MobileTabRail from "./ui/MobileTabRail.jsx";

const rollDie = () => 1 + Math.floor(Math.random() * 6);
const DIE_FACES = { 1: Dice1, 2: Dice2, 3: Dice3, 4: Dice4, 5: Dice5, 6: Dice6 };
const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
const clampInt = (v, lo, hi) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
};
const detachmentSummary = (m) => (m.detachments || [])
  .map((d) => `${d.count}×${d.model || "unnamed"}`).join(", ");
const totalCraft = (m) => (m.detachments || []).reduce((n, d) => n + (Number(d.count) || 0), 0);

// Lets the GM correct a settled mission's outcome text (typo, added detail)
// without reopening the mission or touching the roll/casualty split — mirrors
// GMToolsView's ResolutionWithEdit for agent actions.
function MissionResolutionWithEdit({ mission, editResolution }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const editable = !!editResolution;

  if (editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder="What happens as a result…"
          style={{ ...inputStyle, minHeight: 56, resize: "vertical", lineHeight: 1.6, fontSize: 12.5, padding: 9,
            fontFamily: F.mono }} />
        <div style={{ display: "flex", gap: 6 }}>
          <Btn kind="primary" onClick={() => { editResolution(mission.id, !!mission.archived, draft.trim()); setEditing(false); }}>
            <Check size={13} /> Save
          </Btn>
          <Btn onClick={() => setEditing(false)}>
            <X size={13} /> Cancel
          </Btn>
        </div>
      </div>
    );
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <MissionResolution resolution={mission.resolution} />
      {editable && (
        <Btn onClick={() => { setDraft(mission.resolution.text || ""); setEditing(true); }}
          style={{ alignSelf: "flex-start" }} title="Edit the outcome text without reopening this mission">
          <Pencil size={12} /> Edit text
        </Btn>
      )}
    </div>
  );
}

// GM's squadron-mission workbench: the queue of fighters/bombers players have
// committed to a mission from the Fleet tab, split per player like the agent
// action queue, plus a resolution tool that runs the mission odds table
// (lib/missionOdds.js) instead of a free success/failure call. Resolving a
// mission is one step — it computes the outcome grade and casualty percentage
// and immediately hands the surviving craft back to their fleet (App.jsx
// resolveMission), so there is no separate "reopen" here: once craft are home,
// redoing the roll would double-count them. "Delay resolution" defers that
// hand-back — and hides the result from the player — until Next Turn; deleting
// a delayed mission before then is the only way to get its craft back early
// (see removeMission).
export default function SquadronMissionsPanel({
  roles, factions, fleets, missions, archivedMissions, isMobile, resolveMission, removeMission,
  removeArchivedMission, editMissionResolutionText, notesPane,
}) {
  const confirm = useConfirm();
  const [targetId, setTargetId] = useState("");
  const toolRef = useRef(null);

  const targetMission = targetId ? (missions || []).find((m) => m.id === targetId) : null;
  const mine = targetMission ? totalCraft(targetMission) : 0;
  const targetFleet = targetMission ? (fleets || []).find((f) => f.id === targetMission.fleetId) : null;
  const shipNameFor = (shipId) =>
    ((targetFleet && targetFleet.ships.find((s) => s.id === shipId)) || {}).name || "Unknown ship";

  const [theirsText, setTheirsText] = useState("10");
  const [ratioIdx, setRatioIdx] = useState(EVEN_RATIO_INDEX);
  const [outShiftText, setOutShiftText] = useState("0");
  const [casShiftText, setCasShiftText] = useState("0");
  const [rollText, setRollText] = useState("");
  const [dice, setDice] = useState(null);
  const [outcomeText, setOutcomeText] = useState("");
  // When checked, resolving pulls the mission out of the unresolved queue but
  // holds the result — and the surviving craft — back until the GM presses
  // Next Turn (see App.jsx's resolveMission).
  const [delayResolution, setDelayResolution] = useState(false);
  // Per-squadron loss overrides, keyed by squadronId, raw typed text. A
  // squadron with no entry here just follows the calculated split live as the
  // roll/shifts change; typing a value pins that one squadron until Reset.
  const [lossTexts, setLossTexts] = useState({});

  const theirsValue = clampInt(theirsText, 0, Infinity);
  const outShiftValue = clampInt(outShiftText, MIN_SHIFT, MAX_SHIFT);
  const casShiftValue = clampInt(casShiftText, MIN_SHIFT, MAX_SHIFT);
  const rollValue = clampInt(rollText, 2, 12);
  const ratio = RATIO_COLS[ratioIdx];
  const snapped = nearestRatioIndex(mine, theirsValue);
  const beyond = isBeyondTable(mine, theirsValue);

  const outE = rollValue + ratio.shift + outShiftValue;
  const casE = rollValue + ratio.shift + casShiftValue;
  const grade = successGrade(outE);
  const cas = casualtyPct(casE);

  // The calculated split (casualty % spread evenly, per squadron) with any GM
  // overrides applied on top, plus a live comparison of where the GM's actual
  // total losses sit against that calculated casualty %.
  const lossRows = useMemo(() => (targetMission ? targetMission.detachments || [] : []).map((d) => {
    const calculated = Math.max(0, Math.min(d.count, Math.round(d.count * (cas / 100))));
    const text = lossTexts[d.squadronId];
    const loss = text === undefined ? calculated : clampInt(text, 0, d.count);
    return { ...d, calculated, loss, shipName: shipNameFor(d.shipId) };
  }), [targetMission, cas, lossTexts, targetFleet]);
  const totalLoss = lossRows.reduce((n, r) => n + r.loss, 0);
  const actualPct = mine > 0 ? Math.round((totalLoss / mine) * 1000) / 10 : 0;
  const deviation = Math.round((actualPct - cas) * 10) / 10;
  const deviationAbs = Math.abs(deviation);
  const trackerColor = deviationAbs <= 5 ? T.accent : deviationAbs <= 15 ? T.amber : T.danger;

  function setLossText(squadronId, v) {
    setLossTexts((t) => ({ ...t, [squadronId]: v }));
  }
  function resetLosses() {
    setLossTexts({});
  }

  function onTheirsChange(e) {
    setTheirsText(e.target.value);
    const idx = nearestRatioIndex(mine, clampInt(e.target.value, 0, Infinity));
    if (idx !== null) setRatioIdx(idx);
  }
  function rollForMe() {
    const d1 = rollDie(), d2 = rollDie();
    setDice({ d1, d2 });
    setRollText(String(d1 + d2));
  }
  function clearTool() {
    setTheirsText("10"); setRatioIdx(EVEN_RATIO_INDEX); setOutShiftText("0"); setCasShiftText("0");
    setDice(null); setRollText(""); setOutcomeText(""); setLossTexts({}); setDelayResolution(false);
  }
  function startResolving(mission) {
    setTargetId(mission.id);
    clearTool();
    const idx = nearestRatioIndex(totalCraft(mission), 10);
    if (idx !== null) setRatioIdx(idx);
    requestAnimationFrame(() => toolRef.current &&
      toolRef.current.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  function resolve() {
    if (!targetMission) return;
    const detachmentLosses = lossRows.map((r) => ({
      shipId: r.shipId, squadronId: r.squadronId, model: r.model, shipName: r.shipName,
      count: r.count, loss: r.loss,
    }));
    const resolution = {
      mine, enemyCount: theirsValue, ratioLabel: ratio.label, ratioShift: ratio.shift,
      outcomeShift: outShiftValue, casualtyShift: casShiftValue,
      roll: rollValue, dice: dice || null,
      outcomeE: outE, casualtyE: casE, grade, casualtyPct: cas,
      actualCasualtyPct: actualPct, detachmentLosses,
      text: outcomeText.trim(),
    };
    resolveMission(targetMission.id, resolution, delayResolution);
    setTargetId(""); clearTool();
  }

  /* ------------------------------------------------ queue, split per player.
     Mirrors GMToolsView's action-request grouping: each player group carries
     both its live queue (`items`) and whatever's piled up in `archivedMissions`
     from turns already closed out (`archived`, see App.jsx's nextTurn) — kept
     as a separate subtab (see requestView below) rather than folded into the
     live resolved list, so a fresh turn's queue doesn't keep growing forever
     with every turn's history mixed in. */
  const playerGroups = useMemo(() => {
    const map = new Map();
    const groupOf = (m) => {
      const key = (m.createdBy && m.createdBy.roleId) || "";
      if (!map.has(key)) {
        const name = (roles.find((r) => r.id === key) || {}).name
          || (m.createdBy && m.createdBy.roleName) || (key ? "Unknown player" : "GM / open");
        map.set(key, { key, name, items: [], archived: [] });
      }
      return map.get(key);
    };
    for (const m of missions || []) groupOf(m).items.push(m);
    for (const m of archivedMissions || []) groupOf(m).archived.push({ ...m, archived: true });
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [missions, archivedMissions, roles]);

  const [playerTab, setPlayerTab] = useState(null);
  const activeKey = playerGroups.some((g) => g.key === playerTab)
    ? playerTab : (playerGroups[0] ? playerGroups[0].key : null);
  const activeGroup = playerGroups.find((g) => g.key === activeKey) || null;
  const pendingTotal = (missions || []).filter((m) => m.status !== "resolved" && m.status !== "delayed").length;

  // "Current Turn" (the live unresolved/resolved stack) vs "Previous Missions"
  // (everything archived from turns already closed out) — a subtab per player
  // so a fresh turn's queue stays clean without anything actually being lost.
  const [requestView, setRequestView] = useState("current"); // "current" | "previous"

  // A "delayed" mission (see App.jsx's resolveMission) already has a ruling —
  // it groups with resolved, not unresolved, so resolving it actually clears
  // it out of the GM's active queue even though its craft haven't come home yet.
  const { unresolved, resolved } = useMemo(() => {
    const items = activeGroup ? activeGroup.items : [];
    return {
      unresolved: items.filter((m) => m.status !== "resolved" && m.status !== "delayed")
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
      resolved: items.filter((m) => m.status === "resolved" || m.status === "delayed")
        .sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0)),
    };
  }, [activeGroup]);

  // The active player's archive, newest turn first.
  const archivedForActive = useMemo(() => {
    const items = activeGroup ? activeGroup.archived : [];
    return [...items].sort((a, b) => (b.turnEndedAt || 0) - (a.turnEndedAt || 0));
  }, [activeGroup]);

  const countBadge = (n, big) => (n > 0 ? (
    <span className="mono" style={{ background: T.amber, color: T.onAccent, borderRadius: big ? 8 : 7,
      minWidth: big ? 16 : 14, height: big ? 16 : 14, padding: big ? "0 5px" : "0 4px",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: big ? 10 : 9, fontWeight: 700 }}>{n}</span>
  ) : null);
  const sectionLabel = (text) => (
    <div className="stencil" style={{ fontSize: 11, letterSpacing: ".1em", color: T.faint, margin: "6px 0 1px" }}>
      {text}
    </div>
  );

  const renderTab = (g, vertical) => {
    const on = g.key === activeKey;
    const pending = g.items.filter((m) => m.status !== "resolved" && m.status !== "delayed").length;
    return (
      <button key={g.key || "_gm"} onClick={() => setPlayerTab(g.key)} title={g.name}
        style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", whiteSpace: "nowrap",
          border: `1px solid ${on ? T.accent : T.line}`, borderRadius: 2, padding: "7px 10px",
          background: on ? "rgba(159,194,58,.14)" : T.panel2, color: on ? T.accent : T.text,
          fontFamily: F.body, fontSize: 12.5, fontWeight: 600, letterSpacing: ".03em",
          textTransform: "uppercase", justifyContent: vertical ? "flex-start" : "center",
          flex: vertical ? "none" : "0 0 auto", width: vertical ? "100%" : "auto" }}>
        <Users size={13} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis" }}>{g.name}</span>
        {countBadge(pending)}
      </button>
    );
  };
  const playerRail = (vertical) => (
    <div className={vertical ? "" : "scroll"} style={{ display: "flex", gap: 4,
      flexDirection: vertical ? "column" : "row", overflowX: vertical ? "visible" : "auto",
      ...(vertical ? {} : { paddingBottom: 2 }) }}>
      {playerGroups.map((g) => renderTab(g, vertical))}
    </div>
  );

  const renderCard = (m) => {
    const fac = factions.find((f) => f.id === m.factionId) || null;
    const fleet = (fleets || []).find((f) => f.id === m.fleetId) || null;
    const resolvedM = m.status === "resolved";
    // Ruled on with "delay resolution" checked (see App.jsx's resolveMission) —
    // has a resolution just like `resolvedM`, but the player still sees it as
    // on-mission and the surviving craft haven't come home yet.
    const delayedM = m.status === "delayed";
    const settledM = resolvedM || delayedM;
    const color = fac ? fac.color : T.accent;
    return (
      <div key={m.id} style={{ border: `1px solid ${m.id === targetId ? T.accent : (settledM ? T.line : color)}`,
        borderRadius: 2, background: T.panel2, display: "flex", flexDirection: "column", gap: 8, padding: 10,
        opacity: settledM ? 0.9 : 1, boxShadow: m.id === targetId ? `0 0 0 1px ${T.accent}` : "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0 }} />
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: T.mut }}>
            <Ship size={12} /> {fleet ? fleet.name : "Fleet (removed)"}
          </span>
          {m.archived && (
            <span className="mono" style={{ marginLeft: "auto", fontSize: 9, color: T.faint }}>Turn {m.turn}</span>
          )}
          <span style={{ marginLeft: m.archived ? undefined : "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5,
            fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
            color: resolvedM ? T.accent : T.amber }}
            title={delayedM ? "Ruled on, but held back from the player until Next Turn" : undefined}>
            {resolvedM ? <Check size={11} /> : <Clock size={11} />}{resolvedM ? "Resolved" : delayedM ? "Delayed" : "On mission"}
          </span>
        </div>

        <div className="mono" style={{ fontSize: 11, color: T.mut }}>{detachmentSummary(m)}</div>
        <div style={{ fontSize: 9.5, color: T.faint }}>
          {m.createdAt ? new Date(m.createdAt).toLocaleString() : ""}
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: T.text, whiteSpace: "pre-wrap" }}>{m.text}</div>

        {settledM ? (
          <>
            <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 6 }}>
              {m.resolution
                ? <MissionResolutionWithEdit mission={m} editResolution={editMissionResolutionText} />
                : <div style={{ fontSize: 12, color: T.mut }}>Resolved with no result recorded.</div>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn kind="danger" style={{ marginLeft: "auto" }}
                title={delayedM ? "Delete and return its surviving craft now" : undefined}
                onClick={async () => {
                  if (await confirm("Delete this mission?")) {
                    if (m.archived) removeArchivedMission(m.id); else removeMission(m.id);
                  }
                }}>
                <Trash2 size={13} /> Delete
              </Btn>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", gap: 6 }}>
            <Btn kind="primary" onClick={() => startResolving(m)} title="Load this mission into the resolution tool">
              <Wand2 size={13} /> {m.id === targetId ? "In tool below" : "Resolve with tool"}
            </Btn>
            <Btn kind="danger" style={{ marginLeft: "auto" }} title="Withdraw and return its craft"
              onClick={async () => { if (await confirm("Withdraw this mission and return its craft?")) removeMission(m.id); }}>
              <Trash2 size={13} /> Delete
            </Btn>
          </div>
        )}
      </div>
    );
  };

  // The Current Turn / Previous Missions subtab switch, shared by both panes.
  const requestViewSwitch = () => (
    <div style={{ display: "flex", gap: 3, background: T.panel3, padding: 3, border: `1px solid ${T.line}` }}>
      <Btn active={requestView === "current"} onClick={() => setRequestView("current")}
        style={{ border: "none", borderRadius: 0, flex: 1, justifyContent: "center" }}>
        Current Turn {countBadge(unresolved.length + resolved.length)}
      </Btn>
      <Btn active={requestView === "previous"} onClick={() => setRequestView("previous")}
        title="Missions from turns already closed out — nothing here is lost, just archived"
        style={{ border: "none", borderRadius: 0, flex: 1, justifyContent: "center" }}>
        Previous Missions {countBadge(archivedForActive.length)}
      </Btn>
    </div>
  );

  const requestsPane = () => {
    if (playerGroups.length === 0) {
      return (
        <div style={{ fontSize: 11.5, color: T.faint, padding: "16px 8px", textAlign: "center",
          border: `1px dashed ${T.line}`, lineHeight: 1.6 }}>
          No squadron missions yet. Players raise them from a fleet's hangar on the Fleet tab.
        </div>
      );
    }
    if (!activeGroup) return null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Users size={16} color={T.accent} />
          <div className="stencil" style={{ fontSize: 18, fontWeight: 800, letterSpacing: ".03em", color: T.text }}>
            {activeGroup.name}
          </div>
        </div>
        {requestViewSwitch()}
        {requestView === "current" ? (
          <>
            {unresolved.length === 0 && resolved.length === 0 && (
              <div style={{ fontSize: 11.5, color: T.faint, padding: "16px 8px", textAlign: "center",
                border: `1px dashed ${T.line}` }}>
                No missions from this player this turn.
              </div>
            )}
            {unresolved.length > 0 && sectionLabel("UNRESOLVED")}
            {unresolved.map(renderCard)}
            {resolved.length > 0 && sectionLabel("RESOLVED")}
            {resolved.map(renderCard)}
          </>
        ) : (
          <>
            {archivedForActive.length === 0 && (
              <div style={{ fontSize: 11.5, color: T.faint, padding: "16px 8px", textAlign: "center",
                border: `1px dashed ${T.line}` }}>
                No archived missions yet — these pile up here once "Next Turn" closes out a round.
              </div>
            )}
            {archivedForActive.map(renderCard)}
          </>
        )}
      </div>
    );
  };

  const field = (label, node) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={lbl}>{label}</span>
      {node}
    </div>
  );

  const toolPane = () => (
    <div>
      <div className="stencil" style={{ fontSize: 16, letterSpacing: ".06em", color: T.text,
        display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        <Rocket size={15} color={T.accent} /> MISSION RESOLUTION
      </div>

      <div style={{ background: T.panel, border: `1px solid ${targetMission ? T.accent : T.line}`, ...cut(10),
        padding: isMobile ? 12 : 16, display: "flex", flexDirection: "column", gap: 12 }}>

        {!targetMission ? (
          <div style={{ fontSize: 11.5, color: T.faint, lineHeight: 1.6, padding: "8px 2px" }}>
            Select a pending mission and click "Resolve with tool" to adjudicate it here.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "rgba(159,194,58,.1)",
              border: `1px solid ${T.accent}`, borderRadius: 2, padding: "8px 10px" }}>
              <Wand2 size={14} style={{ color: T.accent, flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...lbl, color: T.accent, marginBottom: 3 }}>Resolving mission</div>
                <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5 }}>{targetMission.text}</div>
                <div className="mono" style={{ fontSize: 10.5, color: T.mut, marginTop: 3 }}>
                  {mine} craft committed — {detachmentSummary(targetMission)}
                </div>
              </div>
              <button onClick={() => { setTargetId(""); clearTool(); }} title="Detach from this mission"
                style={{ background: "none", border: "none", color: T.mut, cursor: "pointer", padding: 2 }}>
                <Trash2 size={13} />
              </button>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              {field("Your craft", (
                <div className="mono" style={{ ...inputStyle, width: 82, textAlign: "right", opacity: .85 }}>{mine}</div>
              ))}
              {field("Enemy craft", (
                <input className="mono" type="number" step="1" min="0" value={theirsText} onChange={onTheirsChange}
                  style={{ ...inputStyle, width: 82, textAlign: "right" }} />
              ))}
              {field("Force ratio", (
                <select value={ratioIdx} onChange={(e) => setRatioIdx(Number(e.target.value))}
                  className="mono" style={{ ...selStyle, width: isMobile ? 118 : 132 }}>
                  {RATIO_COLS.map((c, i) => <option key={c.label} value={i}>{c.label} ({sign(c.shift)})</option>)}
                </select>
              ))}
            </div>
            {snapped !== null && (
              <div style={{ fontSize: 11, color: T.faint, fontFamily: F.body, letterSpacing: ".02em" }}>
                {mine}:{theirsValue} → nearest column <b style={{ color: T.mut }}>{RATIO_COLS[snapped].label}</b>
                {beyond && <span style={{ color: T.amber }}> · beyond the table, clamped to the end column</span>}
                {snapped !== ratioIdx && (
                  <span style={{ color: T.amber }}> · overridden to {ratio.label} ({sign(ratio.shift)})</span>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              {field("Outcome shift", (
                <input className="mono" type="number" step="1" value={outShiftText}
                  onChange={(e) => setOutShiftText(e.target.value)} style={{ ...inputStyle, width: 82, textAlign: "right" }} />
              ))}
              {field("Casualty shift", (
                <input className="mono" type="number" step="1" value={casShiftText}
                  onChange={(e) => setCasShiftText(e.target.value)} style={{ ...inputStyle, width: 82, textAlign: "right" }} />
              ))}
              {field("2d6 roll", (
                <input className="mono" type="number" step="1" value={rollText}
                  onChange={(e) => { setRollText(e.target.value); setDice(null); }}
                  style={{ ...inputStyle, width: 82, textAlign: "right" }} />
              ))}
              <Btn kind="primary" onClick={rollForMe} title="Roll 2d6">
                <Dices size={14} /> Roll 2d6
              </Btn>
              {dice && (
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  {[dice.d1, dice.d2].map((face, i) => {
                    const Face = DIE_FACES[face];
                    return <Face key={i} size={26} color={T.text} strokeWidth={1.5} />;
                  })}
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: isMobile ? 14 : 24, alignItems: "flex-start",
              background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 2, padding: 10 }}>
              <div>
                <div style={lbl}>Mission Success Rating</div>
                <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: T.accent }}>{grade}/5</div>
              </div>
              <div>
                <div style={lbl}>Casualties</div>
                <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: T.text }}>{cas}%</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, background: T.panel2,
              border: `1px solid ${T.line}`, borderRadius: 2, padding: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={lbl}>Ship losses</span>
                <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: trackerColor }}>
                  {totalLoss}/{mine} lost · {actualPct}% (calc {cas}%, {sign(deviation)})
                </span>
                <Btn onClick={resetLosses} title="Reset every squadron's losses back to the calculated split">
                  Reset
                </Btn>
              </div>

              <div title={`Actual ${actualPct}% vs calculated ${cas}%`}
                style={{ position: "relative", height: 8, background: T.void,
                  border: `1px solid ${T.line}`, borderRadius: 2 }}>
                <div style={{ position: "absolute", top: 0, bottom: 0, left: 0,
                  width: `${Math.min(100, Math.max(0, actualPct))}%`, background: trackerColor, opacity: .85 }} />
                <div title={`Calculated ${cas}%`} style={{ position: "absolute", top: -2, bottom: -2,
                  left: `${Math.min(100, Math.max(0, cas))}%`, width: 2, background: T.text }} />
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {lossRows.map((r) => (
                  <div key={r.squadronId} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, color: T.text, overflow: "hidden", textOverflow: "ellipsis",
                        whiteSpace: "nowrap" }}>
                        {r.model || <span style={{ color: T.faint, fontStyle: "italic" }}>unnamed model</span>}
                      </div>
                      <div className="mono" style={{ fontSize: 10, color: T.faint }}>
                        {r.shipName} · {r.count} committed
                      </div>
                    </div>
                    <input className="mono" type="number" min="0" max={r.count} step="1"
                      value={lossTexts[r.squadronId] ?? String(r.calculated)}
                      onChange={(e) => setLossText(r.squadronId, e.target.value)}
                      style={{ ...inputStyle, width: 60, textAlign: "right", padding: "4px 6px",
                        borderColor: r.loss !== r.calculated ? T.amber : T.line }} />
                    <span className="mono" style={{ fontSize: 10, color: T.faint, width: 34, flexShrink: 0 }}>
                      lost /{r.count}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={lbl}>Outcome text</span>
              <textarea value={outcomeText} onChange={(e) => setOutcomeText(e.target.value)}
                placeholder="What happens as a result…"
                style={{ ...inputStyle, minHeight: 56, resize: "vertical", lineHeight: 1.6, fontSize: 12.5, padding: 9,
                  fontFamily: F.mono }} />
            </div>

            <label title="Pulls this mission out of the unresolved queue, but keeps the result hidden from the player — and doesn't return its surviving craft — until Next Turn"
              style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 11.5,
                color: delayResolution ? T.amber : T.mut }}>
              <input type="checkbox" checked={delayResolution} onChange={(e) => setDelayResolution(e.target.checked)} />
              Delay resolution — hide from player until Next Turn
            </label>

            <Btn kind="primary" onClick={resolve} style={{ justifyContent: "center" }}>
              <Check size={14} /> {delayResolution ? "Delay Resolution" : "Resolve & Return Craft"}
            </Btn>
          </>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <div className="stencil" style={{ fontSize: 16, letterSpacing: ".06em", color: T.text,
            display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
            <Rocket size={15} color={T.accent} /> SQUADRON MISSIONS {countBadge(pendingTotal, true)}
          </div>
          {playerGroups.length > 0 && (
            <div style={{ marginBottom: 10 }}>
              <MobileTabRail label={activeGroup ? activeGroup.name : "Select player"} icon={<Users size={15} />}>
                {playerRail(true)}
              </MobileTabRail>
            </div>
          )}
          {requestsPane()}
        </div>
        <div ref={toolRef}>{toolPane()}</div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", background: T.void }}>
      <div style={{ width: 212, flexShrink: 0, borderRight: `2px solid ${T.line}`, background: T.panel,
        display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div className="stencil" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5,
          letterSpacing: ".08em", color: T.text, padding: "12px 12px 8px", flexShrink: 0 }}>
          <Rocket size={14} color={T.accent} /> MISSIONS {countBadge(pendingTotal)}
        </div>
        <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 8px 10px" }}>
          {playerGroups.length === 0
            ? <div style={{ fontSize: 10.5, color: T.faint, padding: "8px 4px", lineHeight: 1.5 }}>No missions yet.</div>
            : playerRail(true)}
        </div>
      </div>

      <div className="scroll" style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: 18 }}>
        {requestsPane()}
      </div>

      <div ref={toolRef} className="scroll" style={{ width: 392, flexShrink: 0, borderLeft: `2px solid ${T.line}`,
        background: T.void, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 22 }}>
        {toolPane()}
        {notesPane}
      </div>
    </div>
  );
}
