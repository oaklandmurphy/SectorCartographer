import { useEffect, useMemo, useRef, useState } from "react";
import { Gavel, Copy, Trash2, Dices, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6,
  ClipboardList, VenetianMask, Flag, Check, Clock, RotateCcw, Wand2, Users, Rocket, SkipForward,
  Pencil, X, MapPin, History, Star, Sparkles, ArrowLeftRight, ArrowRight, PackagePlus, Route, ListChecks } from "lucide-react";
import { T, F, inputStyle, selStyle, lbl, cut } from "../theme.js";
import { useConfirm } from "../hooks/useConfirm.jsx";
import { collectMovementViolations, effectiveMoveOrders } from "../lib/movement.js";
import { lineTotal } from "../lib/replenish.js";
import Btn from "./ui/Btn.jsx";
import ActionResolution from "./ui/ActionResolution.jsx";
import GMNotesPanel from "./ui/GMNotesPanel.jsx";
import SquadronMissionsPanel from "./SquadronMissionsPanel.jsx";
import ReplenishPanel from "./ReplenishPanel.jsx";
import EndTurnChecksPanel from "./EndTurnChecksPanel.jsx";
import { ossiteCheckPassed } from "../lib/endTurnChecks.js";
import MobileTabRail from "./ui/MobileTabRail.jsx";
import TurnMovementWarningModal from "./TurnMovementWarningModal.jsx";

const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
const rollDie = () => 1 + Math.floor(Math.random() * 6);
const DIE_FACES = { 1: Dice1, 2: Dice2, 3: Dice3, 4: Dice4, 5: Dice5, 6: Dice6 };

// One selectable move for a fleet in the Suggested Moves review — a radio-style
// row the GM clicks to pick the owner's own order or an ally/vassal's suggestion.
// A row for a suggestion that's still a draft is shown disabled (nothing to apply).
function MoveChoice({ selected, onSelect, color, label, note, disabled, hint }) {
  return (
    <button type="button" onClick={disabled ? undefined : onSelect} disabled={disabled}
      style={{ display: "flex", alignItems: "flex-start", gap: 8, width: "100%", textAlign: "left",
        background: selected ? `${color}1e` : "transparent", border: `1px solid ${selected ? color : T.line}`,
        borderRadius: 2, padding: "5px 7px", marginTop: 5, cursor: disabled ? "default" : "pointer",
        opacity: disabled ? 0.55 : 1 }}>
      <span style={{ width: 13, height: 13, borderRadius: "50%", flexShrink: 0, marginTop: 1,
        border: `2px solid ${selected ? color : T.faint}`, background: selected ? color : "transparent",
        boxShadow: selected ? `inset 0 0 0 2px ${T.ink}` : "none" }} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: T.text, fontWeight: 600 }}>
          {label}
          {hint && <span style={{ fontSize: 9.5, color: T.faint, fontWeight: 400 }}>· {hint}</span>}
        </span>
        {note && <span style={{ display: "block", fontSize: 10.5, color: T.mut, marginTop: 2, lineHeight: 1.4,
          whiteSpace: "pre-wrap" }}>{note}</span>}
      </span>
    </button>
  );
}

const OUTCOMES = [
  { id: "success", label: "Success", kind: "primary" },
  { id: "failure", label: "Failure", kind: "danger" },
  { id: "autoSuccess", label: "Auto Success", kind: "primary" },
  { id: "autoFailure", label: "Auto Failure", kind: "danger" },
];
const OUTCOME_LABEL = {
  success: "Success", failure: "Failure", autoSuccess: "Auto Success", autoFailure: "Auto Failure",
};

// A Claude prompt asking for exposition-style narration of exactly the events
// handed to it — nothing invented beyond what the GM marked important. `items`
// is [{ action, factionName, agentLabel, systemLabel }], oldest first.
function buildNarrativePrompt(turn, items) {
  const lines = [
    "You are a science fiction author providing narrative exposition for a tabletop strategy campaign.",
    `Write a vivid, atmospheric recap of Turn ${turn}, in the voice of a science fiction author delivering `
      + "exposition to their reader — evocative and dramatic, but grounded in exactly the events listed below. "
      + "Do not invent factions, characters, or outcomes beyond what's given. Weave the events into a cohesive "
      + "narrative passage rather than a bullet list.",
    "",
    `EVENTS FROM TURN ${turn}:`,
  ];
  items.forEach(({ action, factionName, agentLabel, systemLabel }, i) => {
    const resolution = action.resolution;
    const outcome = resolution && typeof resolution === "object" ? OUTCOME_LABEL[resolution.outcome] || resolution.outcome : "";
    const ruling = resolution && typeof resolution === "object" ? resolution.text : (typeof resolution === "string" ? resolution : "");
    lines.push("");
    lines.push(`${i + 1}. [${factionName}] ${agentLabel}${systemLabel ? ` at ${systemLabel}` : ""} — "${action.text}"`);
    if (outcome) lines.push(`   Outcome: ${outcome}`);
    if (ruling) lines.push(`   Result: ${ruling}`);
  });
  return lines.join("\n");
}

// GM-only workbench (App.jsx gates the tab and the render — see there for why
// nothing here re-checks isGM). A section switch up top picks between two
// otherwise-independent request queues, each with its own resolution tool:
//
//   AGENT ACTIONS — the queue of things players have asked their agents to
//      attempt, split into a tab per player. Each pending request can be pushed
//      straight into the resolution tool below, pre-filled with that player's
//      faction and the modifiers they flagged. Resolution here is a free
//      success/failure call, not gated by any table.
//   SQUADRON MISSIONS — the queue of fighters/bombers players have committed to
//      a mission from the Fleet tab (see SquadronMissionsPanel.jsx). Resolution
//      runs the mission odds table (lib/missionOdds.js): a force ratio plus an
//      independently-shifted roll for outcome and for casualties, and resolving
//      immediately returns the surviving craft to their fleet.
//   TRANSACTIONS — the read-only ledger of every resource a player has sent
//      (Assets tab → Resources → Send To), to another faction or to the GM,
//      newest first, with whatever purpose message they attached.
//
// NOTES — a freeform log plus any tracked roll resolutions — sits underneath
// whichever section is active; it's one shared log, not per-section.
//
// A modifier's point value is situational (the same modifier might swing +1 one
// week and +2 the next), so it's typed in at the moment of use, not stored.
export default function GMToolsView({ roles, factions, modifiers, notes, isMobile, addNote, removeNote,
  actions, archivedActions, agents, systems, links, resolveAction, reopenAction, removeAction, removeArchivedAction,
  editActionResolution, editArchivedActionResolution, setActionImportant, setArchivedActionImportant,
  fleets, missions, archivedMissions, resolveMission, removeMission, removeArchivedMission,
  editMissionResolutionText,
  orders, nextTurn, turnNumber, acceptSuggestion, clearSuggestionAcceptance,
  resourceTransactions, removeResourceTransaction,
  relations, replenishments, stageReplenishment,
  endTurnChecks, ensureOssiteChecks, rerollOssiteCheck, setOssiteCheckOverride, rerollAllOssiteChecks }) {
  const confirm = useConfirm();
  const [showMovementWarning, setShowMovementWarning] = useState(false);
  const [section, setSection] = useState("actions"); // "actions" | "missions" | "replenish" | "checks" | "narrative" | "transactions"
  const pendingMissionTotal = (missions || []).filter((m) => m.status !== "resolved" && m.status !== "delayed").length;
  // Ossite Surplus checks passing this turn (GM Tools: End of Turn Checks) — the
  // badge on the tab, and a nudge that a surplus award is queued for Next Turn.
  const ossitePassingTotal = (systems || []).filter((s) => s.hasOssite).filter((s) => {
    const c = (endTurnChecks || []).find((x) => x.type === "ossite" && x.turn === turnNumber && !x.appliedAt && x.systemId === s.id);
    return c && ossiteCheckPassed(c);
  }).length;
  // Strike craft staged for resupply this turn (GM Tools: Replenish) — applied on
  // Next Turn, so they count as pending work the turn advance will close out.
  const stagedReplenTotal = (replenishments || [])
    .filter((r) => (r.turn || 0) === turnNumber && !r.revealedAt)
    .reduce((n, r) => n + lineTotal(r), 0);
  // What "Next Turn" is about to do: land every committed move order and close
  // out every agent's action requests. Shown beside the button so the GM isn't
  // clicking blind — see App.jsx's nextTurn for what actually runs.
  const readyOrders = (orders || []).filter((o) => o.committed && o.path.length > 0);
  // The moves that will actually land — one per piece, with any accepted ally/
  // vassal suggestion standing in for the owner's order (see effectiveMoveOrders).
  // Counting these (not every committed order) keeps a fleet with both its own
  // order and a suggestion from double-counting in the turn summary.
  const effectiveMoves = useMemo(() => effectiveMoveOrders(orders), [orders]);
  const readyFleetMoves = effectiveMoves.filter((o) => o.pieceType === "fleet").length;
  const readyAgentMoves = effectiveMoves.filter((o) => o.pieceType === "agent").length;
  // "Delayed" (see resolveAction/resolveMission's `delayed` flag) counts as
  // resolved for turn-advance purposes — Next Turn is exactly what reveals it —
  // even though it doesn't count as resolved for the player yet.
  const resolvedActionsTotal = (actions || []).filter((a) => a.status === "resolved" || a.status === "delayed").length;
  const pendingActionsTotal = (actions || []).filter((a) => a.status !== "resolved" && a.status !== "delayed").length;
  // Squadron missions archive on the same turn-advance (see App.jsx's nextTurn),
  // so a turn with nothing but resolved missions still has work to close out —
  // without this, Next Turn would stay disabled and those missions would never
  // move into the archive.
  const resolvedMissionsTotal = (missions || []).filter((m) => m.status === "resolved" || m.status === "delayed").length;
  const turnHasWork = readyOrders.length > 0 || resolvedActionsTotal > 0 || pendingActionsTotal > 0
    || resolvedMissionsTotal > 0 || stagedReplenTotal > 0;
  // Committed orders that break the movement rules (lib/movement.js) — an
  // agent moving further than 3 systems (4 from a jump gate), a fleet further
  // than 1 (2 from a jump gate), or a route that skips a link. Recomputed
  // every render so a route the GM just fixed clears itself without a reopen.
  const movementViolations = useMemo(
    () => collectMovementViolations({ orders, agents, fleets, systems, links }),
    [orders, agents, fleets, systems, links],
  );
  function turnSummary() {
    const parts = [];
    if (readyFleetMoves > 0) parts.push(`${readyFleetMoves} fleet move${readyFleetMoves === 1 ? "" : "s"}`);
    if (readyAgentMoves > 0) parts.push(`${readyAgentMoves} agent move${readyAgentMoves === 1 ? "" : "s"}`);
    if (resolvedActionsTotal > 0) parts.push(`${resolvedActionsTotal} action request${resolvedActionsTotal === 1 ? "" : "s"} closed out`);
    if (pendingActionsTotal > 0) parts.push(`${pendingActionsTotal} still pending, carried over`);
    if (resolvedMissionsTotal > 0) parts.push(`${resolvedMissionsTotal} squadron mission${resolvedMissionsTotal === 1 ? "" : "s"} closed out`);
    if (stagedReplenTotal > 0) parts.push(`${stagedReplenTotal} strike craft replenished`);
    return parts.length > 0 ? parts.join(" · ") : "Nothing queued — no committed moves or open action requests.";
  }

  /* ------------------------------------------------ resolution tool state */
  const [roleId, setRoleId] = useState(roles[0]?.id || "");
  const [targetId, setTargetId] = useState(""); // the action being resolved, or "" for standalone use
  const toolRef = useRef(null);

  useEffect(() => {
    if (!roles.some((r) => r.id === roleId)) setRoleId(roles[0]?.id || "");
  }, [roles, roleId]);
  const role = roles.find((r) => r.id === roleId) || null;
  const faction = role ? factions.find((f) => f.id === role.factionId) : null;
  const factionMods = useMemo(
    () => (faction ? modifiers.filter((m) => m.factionId === faction.id) : []),
    [modifiers, faction],
  );

  const [selectedIds, setSelectedIds] = useState([]);
  const [modValues, setModValues] = useState({}); // modifierId -> typed-in value for this resolution
  const selectedMods = factionMods.filter((m) => selectedIds.includes(m.id));
  const sumSelected = selectedMods.reduce((s, m) => s + (Number(modValues[m.id]) || 0), 0);

  const [rollText, setRollText] = useState("");
  const [dice, setDice] = useState(null); // { d1, d2 } | null — the faces behind the last "Roll 2d6"
  function rollTwoD6() {
    const d1 = rollDie(), d2 = rollDie();
    setDice({ d1, d2 });
    setRollText(String(d1 + d2));
  }
  const [totalModText, setTotalModText] = useState("0");
  useEffect(() => { setTotalModText(String(sumSelected)); }, [sumSelected]);
  const totalMod = Number(totalModText) || 0;
  const rollValue = Number(rollText) || 0;

  const [outcomeText, setOutcomeText] = useState(""); // the GM's free ruling, appended to the outcome
  const [track, setTrack] = useState(false);
  // When checked, resolving pulls the request out of the unresolved queue but
  // holds the result back — the player still sees it as pending, and nothing
  // reveals until the GM presses Next Turn (see App.jsx's resolveAction).
  const [delayResolution, setDelayResolution] = useState(false);
  const [output, setOutput] = useState("");

  const targetAction = targetId ? (actions || []).find((a) => a.id === targetId) : null;

  // Reset the input fields but leave `output` alone, so the Discord text a resolve
  // just produced stays copyable after the request is closed and the tool clears.
  function clearTool() {
    setSelectedIds([]); setModValues({}); setDice(null); setRollText("");
    setTotalModText("0"); setOutcomeText(""); setDelayResolution(false);
  }
  // The player dropdown: switching player by hand drops the current picks (a
  // modifier chosen for one player means nothing for another), any request this
  // was tied to, and the stale output. Done here rather than in a roleId effect
  // so that programmatic prefill (startResolving) isn't wiped by its roleId change.
  function changePlayer(id) {
    setRoleId(id); setTargetId(""); clearTool(); setOutput("");
  }
  // "Resolve with tool" on a request: point the tool at that request, set the
  // player to whoever raised it (which pulls in their faction and its modifiers),
  // preselect the modifiers they flagged, and scroll the tool into view.
  function startResolving(action) {
    const creator = (action.createdBy && action.createdBy.roleId) || "";
    const fac = factions.find((f) => f.id === action.factionId);
    const facMods = fac ? modifiers.filter((m) => m.factionId === fac.id) : [];
    const preIds = (action.modifierIds || []).filter((id) => facMods.some((m) => m.id === id));
    setRoleId(creator);
    setTargetId(action.id);
    setSelectedIds(preIds);
    setModValues(Object.fromEntries(preIds.map((id) => [id, "1"])));
    setDice(null); setRollText(""); setTotalModText(String(preIds.length)); setOutcomeText("");
    setDelayResolution(false); setOutput("");
    requestAnimationFrame(() => toolRef.current &&
      toolRef.current.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function toggleMod(id) {
    setSelectedIds((ids) => {
      if (ids.includes(id)) {
        setModValues((vs) => { const { [id]: _drop, ...rest } = vs; return rest; });
        return ids.filter((x) => x !== id);
      }
      setModValues((vs) => ({ ...vs, [id]: vs[id] ?? "1" }));
      return [...ids, id];
    });
  }

  function resolve(outcomeId) {
    const isAuto = outcomeId === "autoSuccess" || outcomeId === "autoFailure";
    const extra = totalMod - sumSelected;
    const ruling = outcomeText.trim();

    // Discord-ready text — unchanged, plus the GM's ruling on the end.
    const lines = [];
    if (!isAuto) lines.push(`Roll: ${rollValue}`);
    selectedMods.forEach((m) => lines.push(`Mod: ${sign(Number(modValues[m.id]) || 0)} *${m.name || "Unnamed modifier"}*`));
    if (extra !== 0) lines.push(`Mod: ${sign(extra)} *Situational*`);
    lines.push(`**${OUTCOME_LABEL[outcomeId]}**`);
    if (ruling) lines.push(ruling);
    const text = lines.join("\n");
    setOutput(text);

    // Structured result the request preserves and both sides display.
    const resolution = {
      outcome: outcomeId,
      roll: isAuto ? null : rollValue,
      dice: !isAuto && dice ? dice : null,
      mods: selectedMods.map((m) => ({ name: m.name || "Unnamed modifier", value: Number(modValues[m.id]) || 0 })),
      situational: extra,
      total: totalMod,
      text: ruling,
    };

    if (targetAction) {
      resolveAction(targetAction.id, resolution, delayResolution);
      if (track) addNote(text, "roll", { playerName: role ? role.name : null });
      setTargetId(""); clearTool();
    } else if (track) {
      addNote(text, "roll", { playerName: role ? role.name : null });
    }
  }

  async function copyOutput() {
    try { await navigator.clipboard.writeText(output); } catch (e) { /* clipboard unavailable */ }
  }

  /* ------------------------------------------------ action-request queue, split per player */
  // One group per player who has raised a request (keyed by their role id; a
  // GM/open-mode submission with no role falls under a "GM" group), each
  // carrying both its live queue (`items`) and whatever's piled up in
  // `archivedActions` from turns already closed out (`archived`) — a player
  // with nothing live right after a fresh "Next Turn" still gets a tab here
  // so their Previous Actions stay reachable.
  const playerGroups = useMemo(() => {
    const map = new Map();
    const groupOf = (a) => {
      const key = (a.createdBy && a.createdBy.roleId) || "";
      if (!map.has(key)) {
        const name = (roles.find((r) => r.id === key) || {}).name
          || (a.createdBy && a.createdBy.roleName) || (key ? "Unknown player" : "GM / open");
        map.set(key, { key, name, items: [], archived: [] });
      }
      return map.get(key);
    };
    for (const a of actions || []) groupOf(a).items.push(a);
    for (const a of archivedActions || []) groupOf(a).archived.push(a);
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [actions, archivedActions, roles]);

  const [playerTab, setPlayerTab] = useState(null);
  const activeKey = playerGroups.some((g) => g.key === playerTab)
    ? playerTab : (playerGroups[0] ? playerGroups[0].key : null);
  const activeGroup = playerGroups.find((g) => g.key === activeKey) || null;
  const pendingTotal = (actions || []).filter((a) => a.status !== "resolved" && a.status !== "delayed").length;

  // "Current Turn" (the live unresolved/resolved stack) vs "Previous Actions"
  // (everything archived from turns already closed out) — a subtab per player
  // so a fresh turn's queue stays clean without anything actually being lost.
  const [requestView, setRequestView] = useState("current"); // "current" | "previous"

  // The active player's requests split for the two-tier stack: unresolved on top
  // (oldest first, the order they arrived), resolved below (newest first, a log).
  // A "delayed" request (see App.jsx's resolveAction) already has a ruling, just
  // one the player hasn't seen yet — it groups with resolved, not unresolved,
  // so resolving it actually clears it out of the GM's active queue.
  const { unresolved, resolved } = useMemo(() => {
    const items = activeGroup ? activeGroup.items : [];
    return {
      unresolved: items.filter((a) => a.status !== "resolved" && a.status !== "delayed")
        .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
      resolved: items.filter((a) => a.status === "resolved" || a.status === "delayed")
        .sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0)),
    };
  }, [activeGroup]);

  // The active player's archive, newest turn first.
  const archivedForActive = useMemo(() => {
    const items = activeGroup ? activeGroup.archived : [];
    return [...items].sort((a, b) => (b.turnEndedAt || 0) - (a.turnEndedAt || 0));
  }, [activeGroup]);

  const describeAgent = (action) => {
    const fac = factions.find((f) => f.id === action.factionId) || null;
    const agent = (agents || []).find((a) => a.id === action.agentId) || null;
    const member = agent && fac ? (fac.members || []).find((m) => m.id === agent.memberId) : null;
    const label = agent && agent.name && agent.name.trim()
      ? agent.name.trim() : (member ? member.name : (agent ? "Agent" : "Agent (removed)"));
    const system = agent && agent.systemId ? (systems || []).find((s) => s.id === agent.systemId) : null;
    const systemLabel = agent ? (system ? system.name : "Unplaced") : "";
    return { faction: fac, label, systemLabel };
  };
  const modName = (id) => (modifiers.find((m) => m.id === id) || {}).name || "";

  /* ------------------------------------------------ narrative prompt tool */
  // `nextTurn` archives a closed-out turn's resolved actions stamped with the
  // turn number that just ended, then bumps turnNumber — so "last turn" is
  // always turnNumber - 1 among archivedActions, no separate bookkeeping needed.
  const lastTurnNumber = (Number(turnNumber) || 0) - 1;
  const importantLastTurn = useMemo(
    () => (archivedActions || [])
      .filter((a) => a.important && a.turn === lastTurnNumber)
      .sort((a, b) => (a.resolvedAt || 0) - (b.resolvedAt || 0)),
    [archivedActions, lastTurnNumber],
  );
  const [narrativeOutput, setNarrativeOutput] = useState("");
  function generateNarrativePrompt() {
    const items = importantLastTurn.map((action) => {
      const { faction, label, systemLabel } = describeAgent(action);
      return { action, factionName: faction ? faction.name : "Unknown faction", agentLabel: label, systemLabel };
    });
    setNarrativeOutput(buildNarrativePrompt(lastTurnNumber, items));
  }
  async function copyNarrativeOutput() {
    try { await navigator.clipboard.writeText(narrativeOutput); } catch (e) { /* clipboard unavailable */ }
  }

  /* ------------------------------------------------ render helpers, one per zone
     so the same markup serves the desktop workspace (rail | requests | tool) and
     the stacked mobile layout without duplicating it. */
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

  // A player tab — vertical fills the left rail, horizontal is the mobile strip.
  const renderTab = (g, vertical) => {
    const on = g.key === activeKey;
    const pending = g.items.filter((a) => a.status !== "resolved" && a.status !== "delayed").length;
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

  const renderCard = (action) => {
    const { faction: fac, label, systemLabel } = describeAgent(action);
    return (
      <ActionCard key={action.id} action={action} faction={fac} agentLabel={label} systemLabel={systemLabel}
        modName={modName} isTarget={action.id === targetId}
        onResolveWithTool={() => startResolving(action)}
        reopenAction={reopenAction} removeAction={removeAction}
        editActionResolution={editActionResolution} setActionImportant={setActionImportant} />
    );
  };
  const renderArchivedCard = (action) => {
    const { faction: fac, label, systemLabel } = describeAgent(action);
    return (
      <ArchivedActionCard key={action.id} action={action} faction={fac} agentLabel={label} systemLabel={systemLabel}
        modName={modName} removeArchivedAction={removeArchivedAction}
        editArchivedActionResolution={editArchivedActionResolution} setArchivedActionImportant={setArchivedActionImportant} />
    );
  };

  // The Current Turn / Previous Actions subtab switch, shared by both panes.
  const requestViewSwitch = () => (
    <div style={{ display: "flex", gap: 3, background: T.panel3, padding: 3, border: `1px solid ${T.line}` }}>
      <Btn active={requestView === "current"} onClick={() => setRequestView("current")}
        style={{ border: "none", borderRadius: 0, flex: 1, justifyContent: "center" }}>
        Current Turn {countBadge(unresolved.length + resolved.length)}
      </Btn>
      <Btn active={requestView === "previous"} onClick={() => setRequestView("previous")}
        title="Actions from turns already closed out — nothing here is lost, just archived"
        style={{ border: "none", borderRadius: 0, flex: 1, justifyContent: "center" }}>
        Previous Actions {countBadge(archivedForActive.length)}
      </Btn>
    </div>
  );

  // The active player's two-tier stack: unresolved on top, resolved below —
  // or, on the Previous Actions subtab, the read-only archive from turns
  // already closed out.
  const requestsPane = () => {
    if (playerGroups.length === 0) {
      return (
        <div style={{ fontSize: 11.5, color: T.faint, padding: "16px 8px", textAlign: "center",
          border: `1px dashed ${T.line}`, lineHeight: 1.6 }}>
          No action requests yet. Players raise them through their agents on the Agents tab.
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
                No requests from this player this turn.
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
                No archived actions yet — these pile up here once "Next Turn" closes out a round.
              </div>
            )}
            {archivedForActive.map(renderArchivedCard)}
          </>
        )}
      </div>
    );
  };

  const toolPane = () => (
    <div>
      <div className="stencil" style={{ fontSize: 16, letterSpacing: ".06em", color: T.text,
        display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        <Gavel size={15} color={T.accent} /> ROLL RESOLUTION
      </div>

      <div style={{ background: T.panel, border: `1px solid ${targetAction ? T.accent : T.line}`, ...cut(10),
        padding: isMobile ? 12 : 16, display: "flex", flexDirection: "column", gap: 12 }}>

        {/* When driven from a request, a banner ties the tool to it and offers a way out. */}
        {targetAction && (
          <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "rgba(159,194,58,.1)",
            border: `1px solid ${T.accent}`, borderRadius: 2, padding: "8px 10px" }}>
            <Wand2 size={14} style={{ color: T.accent, flexShrink: 0, marginTop: 1 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ ...lbl, color: T.accent, marginBottom: 3 }}>Resolving request</div>
              <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5 }}>{targetAction.text}</div>
            </div>
            <button onClick={() => { setTargetId(""); clearTool(); }} title="Detach from this request"
              style={{ background: "none", border: "none", color: T.mut, cursor: "pointer", padding: 2 }}>
              <Trash2 size={13} />
            </button>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={lbl}>Player</span>
          <select value={roleId} onChange={(e) => changePlayer(e.target.value)} style={selStyle}>
            <option value="">— choose a player —</option>
            {roles.map((r) => <option key={r.id} value={r.id}>{r.name || "Unnamed player"}</option>)}
          </select>
          {roles.length === 0 && (
            <div style={{ fontSize: 10.5, color: T.faint }}>No player roles yet — add one from the access panel.</div>
          )}
        </div>

        {role && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={lbl}>Modifiers {faction ? `— ${faction.name}` : "(no faction assigned)"}</span>
            {factionMods.length === 0 && (
              <div style={{ fontSize: 10.5, color: T.faint, padding: "8px 0" }}>
                No modifiers recorded for this player's faction yet.
              </div>
            )}
            {factionMods.map((m) => {
              const on = selectedIds.includes(m.id);
              return (
                <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8,
                  border: `1px solid ${on ? T.accent : T.line}`, borderRadius: 2, padding: "6px 9px",
                  background: on ? "rgba(159,194,58,.12)" : T.panel2 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, cursor: "pointer" }}>
                    <input type="checkbox" checked={on} onChange={() => toggleMod(m.id)} />
                    <span style={{ fontSize: 12.5, color: on ? T.accent : T.text }}>
                      {m.name || "Unnamed modifier"}
                    </span>
                  </label>
                  {on && (
                    <input type="number" className="mono" value={modValues[m.id] ?? ""}
                      onChange={(e) => setModValues((vs) => ({ ...vs, [m.id]: e.target.value }))}
                      placeholder="value" style={{ ...inputStyle, width: 64 }} />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={lbl}>Roll</span>
            <input className="mono" type="number" value={rollText}
              onChange={(e) => { setRollText(e.target.value); setDice(null); }}
              placeholder="0" style={{ ...inputStyle, width: 90 }} />
          </div>
          <Btn kind="primary" onClick={rollTwoD6} title="Roll 2d6">
            <Dices size={14} /> Roll 2d6
          </Btn>
          {dice && (
            <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
              {[dice.d1, dice.d2].map((face, i) => {
                const Face = DIE_FACES[face];
                return <Face key={i} size={30} color={T.text} strokeWidth={1.5} />;
              })}
            </div>
          )}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={lbl}>Total mod</span>
            <input className="mono" type="number" value={totalModText} onChange={(e) => setTotalModText(e.target.value)}
              style={{ ...inputStyle, width: 90 }} />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={lbl}>Outcome text</span>
          <textarea value={outcomeText} onChange={(e) => setOutcomeText(e.target.value)}
            placeholder="What happens as a result… (appended after the success/failure line)"
            style={{ ...inputStyle, minHeight: 56, resize: "vertical", lineHeight: 1.6, fontSize: 12.5, padding: 9,
              fontFamily: F.mono }} />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 11.5, color: T.mut }}>
          <input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} />
          Also log this resolution in the notes below
        </label>

        <label title="Pulls this request out of the unresolved queue, but keeps the result hidden from the player — and doesn't return any craft it committed — until Next Turn"
          style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 11.5,
            color: delayResolution ? T.amber : T.mut }}>
          <input type="checkbox" checked={delayResolution} onChange={(e) => setDelayResolution(e.target.checked)} />
          Delay resolution — hide from player until Next Turn
        </label>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {OUTCOMES.map((o) => (
            <Btn key={o.id} kind={o.kind} onClick={() => resolve(o.id)} style={{ flex: "1 1 130px", justifyContent: "center" }}>
              {targetAction ? (delayResolution ? "Delay: " : "Resolve: ") : ""}{o.label}
            </Btn>
          ))}
        </div>

        {output && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={lbl}>Discord output</span>
            <pre className="mono" style={{ margin: 0, background: T.panel2, border: `1px solid ${T.line}`,
              borderRadius: 2, padding: 10, fontSize: 12.5, color: T.text, whiteSpace: "pre-wrap" }}>
              {output}
            </pre>
            <Btn onClick={copyOutput} style={{ alignSelf: "flex-start" }}>
              <Copy size={13} /> Copy
            </Btn>
          </div>
        )}
      </div>
    </div>
  );

  // The narrative prompt pane: the read-only list of what "Generate Prompt"
  // is about to feed in (every archived action from the last closed turn that
  // the GM starred important), the button itself, and the generated text with
  // a copy affordance — same shape as the roll tool's Discord output above.
  const narrativePane = () => (
    <div>
      <div className="stencil" style={{ fontSize: 16, letterSpacing: ".06em", color: T.text,
        display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        <Sparkles size={15} color={T.accent} /> NARRATIVE PROMPT
      </div>

      <div style={{ background: T.panel, border: `1px solid ${T.line}`, ...cut(10),
        padding: isMobile ? 12 : 16, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ fontSize: 11.5, color: T.mut, lineHeight: 1.5 }}>
          {lastTurnNumber > 0 ? `Turn ${lastTurnNumber}` : "No turn has closed yet"} — {importantLastTurn.length} event{importantLastTurn.length === 1 ? "" : "s"} marked important
        </div>

        {importantLastTurn.length === 0 ? (
          <div style={{ fontSize: 11.5, color: T.faint, padding: "16px 8px", textAlign: "center",
            border: `1px dashed ${T.line}`, lineHeight: 1.6 }}>
            {lastTurnNumber > 0
              ? "Nothing from last turn is starred important yet — flag a resolved action's star (Previous Actions) to include it here."
              : "Advance a turn and star a resolved action important to build a recap prompt for it."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {importantLastTurn.map((action) => {
              const { faction, label, systemLabel } = describeAgent(action);
              const color = faction ? faction.color : T.accent;
              return (
                <div key={action.id} style={{ border: `1px solid ${T.line}`, borderRadius: 2, background: T.panel2,
                  padding: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 10.5, color: T.mut }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    {faction ? faction.name : "Unknown faction"} · {label}{systemLabel ? ` · ${systemLabel}` : ""}
                  </div>
                  <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5 }}>{action.text}</div>
                </div>
              );
            })}
          </div>
        )}

        <Btn kind="primary" disabled={importantLastTurn.length === 0} onClick={generateNarrativePrompt}
          style={{ alignSelf: "flex-start" }}>
          <Sparkles size={14} /> Generate Prompt
        </Btn>

        {narrativeOutput && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={lbl}>Prompt for Claude</span>
            <pre className="mono" style={{ margin: 0, background: T.panel2, border: `1px solid ${T.line}`,
              borderRadius: 2, padding: 10, fontSize: 12.5, color: T.text, whiteSpace: "pre-wrap" }}>
              {narrativeOutput}
            </pre>
            <Btn onClick={copyNarrativeOutput} style={{ alignSelf: "flex-start" }}>
              <Copy size={13} /> Copy
            </Btn>
          </div>
        )}
      </div>
    </div>
  );

  // The full resource-send ledger (Assets tab → Resources subtab → Send To),
  // newest first — every transfer between factions, or to the GM, with
  // whatever purpose message the sender attached. A faction that's since
  // been deleted still shows up by whatever id it sent/received under,
  // labeled "Unknown faction" same as elsewhere in this app.
  const factionById = (id) => factions.find((f) => f.id === id) || null;
  const transactionsPane = () => {
    const sorted = [...(resourceTransactions || [])].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    const party = (id) => {
      if (id === "gm") return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: T.amber, fontWeight: 700 }}>
        <Gavel size={12} /> GM
      </span>;
      const fac = factionById(id);
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: fac ? fac.color : T.faint, flexShrink: 0 }} />
          {fac ? fac.name : "Unknown faction"}
        </span>
      );
    };
    return (
      <div>
        <div className="stencil" style={{ fontSize: 16, letterSpacing: ".06em", color: T.text,
          display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
          <ArrowLeftRight size={15} color={T.accent} /> RESOURCE TRANSACTIONS
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {sorted.length === 0 && (
            <div style={{ fontSize: 11.5, color: T.faint, padding: "16px 8px", textAlign: "center",
              border: `1px dashed ${T.line}`, lineHeight: 1.6 }}>
              No resources have been sent between players yet — see the Send To button on a resource in the Assets tab.
            </div>
          )}
          {sorted.map((t) => (
            <div key={t.id} style={{ border: `1px solid ${T.line}`, borderRadius: 2, background: T.panel2,
              padding: 10, display: "flex", flexDirection: "column", gap: 6 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 12 }}>
                {party(t.fromFactionId)}
                <ArrowRight size={12} color={T.faint} />
                {party(t.toFactionId)}
                <span className="mono" style={{ marginLeft: "auto", fontSize: 9.5, color: T.faint }}>
                  {t.createdAt ? new Date(t.createdAt).toLocaleString() : ""}
                </span>
              </div>
              <div style={{ fontSize: 13, color: T.text }}>
                <span className="mono" style={{ fontWeight: 800 }}>{t.amount}</span> × {t.resourceName || "resource"}
              </div>
              {t.message && (
                <div style={{ fontSize: 12, lineHeight: 1.5, color: T.mut, whiteSpace: "pre-wrap" }}>{t.message}</div>
              )}
              <Btn kind="danger" style={{ alignSelf: "flex-end" }}
                onClick={async () => { if (await confirm("Delete this transaction record?")) removeResourceTransaction(t.id); }}>
                <Trash2 size={13} /> Delete
              </Btn>
            </div>
          ))}
        </div>
      </div>
    );
  };

  // The section switch: agent actions vs. squadron missions vs. narrative
  // prompt vs. resource transactions. Each owns its own content; Notes stays
  // shared underneath either one.
  const sectionBar = () => (
    <div style={{ display: "flex", gap: 3, background: T.panel3, padding: 3, border: `1px solid ${T.line}`,
      margin: isMobile ? "0 0 14px" : "12px 12px 0", alignSelf: isMobile ? "stretch" : "flex-start" }}>
      <Btn active={section === "actions"} onClick={() => setSection("actions")} title="Agent action requests"
        style={{ border: "none", borderRadius: 0, flex: isMobile ? 1 : "none", justifyContent: "center" }}>
        <ClipboardList size={13} /> Agent Actions {countBadge(pendingTotal)}
      </Btn>
      <Btn active={section === "missions"} onClick={() => setSection("missions")} title="Squadron mission requests"
        style={{ border: "none", borderRadius: 0, flex: isMobile ? 1 : "none", justifyContent: "center" }}>
        <Rocket size={13} /> Squadron Missions {countBadge(pendingMissionTotal)}
      </Btn>
      <Btn active={section === "replenish"} onClick={() => setSection("replenish")} title="Top up strike craft on carriers in friendly space"
        style={{ border: "none", borderRadius: 0, flex: isMobile ? 1 : "none", justifyContent: "center" }}>
        <PackagePlus size={13} /> Replenish {countBadge(stagedReplenTotal)}
      </Btn>
      <Btn active={section === "checks"} onClick={() => setSection("checks")} title="Checks that resolve when the turn advances — the Ossite Surplus check"
        style={{ border: "none", borderRadius: 0, flex: isMobile ? 1 : "none", justifyContent: "center" }}>
        <ListChecks size={13} /> End of Turn Checks {countBadge(ossitePassingTotal)}
      </Btn>
      <Btn active={section === "narrative"} onClick={() => setSection("narrative")} title="Generate a narration prompt from last turn's important events"
        style={{ border: "none", borderRadius: 0, flex: isMobile ? 1 : "none", justifyContent: "center" }}>
        <Sparkles size={13} /> Narrative {countBadge(importantLastTurn.length)}
      </Btn>
      <Btn active={section === "transactions"} onClick={() => setSection("transactions")} title="Resource transfers between factions, and to the GM"
        style={{ border: "none", borderRadius: 0, flex: isMobile ? 1 : "none", justifyContent: "center" }}>
        <ArrowLeftRight size={13} /> Transactions
      </Btn>
    </div>
  );

  // Bulk "resolve the round" control: lands every committed fleet/agent move
  // order, then archives every *resolved* action request (still-pending ones
  // carry over instead — see App.jsx's nextTurn) and bumps the turn counter,
  // which is what Previous Actions stamps onto an entry to record which turn
  // it was resolved on. Always visible (not tied to either section) since it
  // spans both movement and agent actions.
  // Suggested moves an ally/vassal has filed for another faction's fleet, grouped
  // by the fleet they target. Per fleet the GM picks the owner's own order (the
  // default) or overrides it with one of the suggestions — the pick is exactly
  // what effectiveMoveOrders/nextTurn read to decide where the fleet lands.
  // Absent entirely when there are no suggestions on the board.
  function suggestionReview() {
    const suggestions = (orders || []).filter((o) => o.suggestion && o.path && o.path.length > 0);
    if (suggestions.length === 0) return null;
    const facById = (id) => factions.find((f) => f.id === id);
    const sysName = (id) => ((systems || []).find((s) => s.id === id) || {}).name || "?";
    const destName = (o) => sysName(o.path[o.path.length - 1]);
    const pieceOrder = [];
    const groups = new Map();
    for (const s of suggestions) {
      if (!groups.has(s.pieceId)) { groups.set(s.pieceId, []); pieceOrder.push(s.pieceId); }
      groups.get(s.pieceId).push(s);
    }
    return (
      <div style={{ margin: isMobile ? "0 0 14px" : "10px 12px 0", border: `1px solid ${T.line}`,
        borderRadius: 2, background: T.panel, padding: "10px 12px" }}>
        <div className="stencil" style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap",
          fontSize: 12, letterSpacing: ".07em", color: T.text, marginBottom: 8 }}>
          <Route size={13} color={T.accent} /> SUGGESTED MOVES
          <span style={{ fontSize: 10, color: T.faint, fontWeight: 400, letterSpacing: 0 }}>
            an ally/vassal's proposed route for another faction's fleet — pick which move to apply this turn
          </span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {pieceOrder.map((pieceId) => {
            const fleet = (fleets || []).find((f) => f.id === pieceId);
            const list = groups.get(pieceId);
            const owner = (orders || []).find((o) => o.pieceType === "fleet" && o.pieceId === pieceId && !o.suggestion);
            const ownerReady = !!(owner && owner.committed && owner.path.length > 0);
            const anyAccepted = list.some((s) => s.accepted);
            const ownerFac = fleet ? facById(fleet.factionId) : null;
            return (
              <div key={pieceId} style={{ border: `1px solid ${T.line}`, borderRadius: 2, background: T.panel2, padding: 8 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                  <span style={{ width: 9, height: 9, background: ownerFac ? ownerFac.color : T.faint, ...cut(2), flexShrink: 0 }} />
                  <span style={{ fontSize: 12.5, fontWeight: 700, color: T.text }}>{fleet ? fleet.name : "Unknown fleet"}</span>
                  <span style={{ fontSize: 10, color: T.faint }}>{ownerFac ? ownerFac.name : ""}</span>
                </div>
                <MoveChoice
                  selected={!anyAccepted}
                  onSelect={() => clearSuggestionAcceptance("fleet", pieceId)}
                  color={ownerFac ? ownerFac.color : T.faint}
                  label={ownerReady
                    ? `Keep ${ownerFac ? ownerFac.name : "owner"}'s order → ${destName(owner)}`
                    : `No move — ${ownerFac ? ownerFac.name : "owner"} filed no order`}
                  note={ownerReady ? (owner.notes || "") : ""}
                  disabled={false}
                />
                {list.map((s) => {
                  const sug = facById(s.suggesterFactionId);
                  const ready = !!(s.committed && s.path.length > 0);
                  return (
                    <MoveChoice key={s.id}
                      selected={!!s.accepted}
                      onSelect={ready ? () => acceptSuggestion(s.id) : undefined}
                      color={sug ? sug.color : T.accent}
                      label={`${sug ? sug.name : "An ally"} suggests → ${destName(s)}`}
                      note={s.notes || ""}
                      disabled={!ready}
                      hint={ready ? "" : "still drafting"}
                    />
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  const turnBar = () => (
    <>
    <div style={{ display: "flex", alignItems: "center", gap: 9, flexWrap: "wrap",
      margin: isMobile ? "0 0 14px" : "12px 12px 0" }}>
      <span className="mono" title="The current turn — stamped onto action requests as they're resolved"
        style={{ fontSize: 10.5, color: T.faint, border: `1px solid ${T.line}`, borderRadius: 2, padding: "3px 7px" }}>
        Turn {turnNumber || 0}
      </span>
      <Btn kind="primary" disabled={!turnHasWork}
        onClick={async () => {
          // Movement violations gate the turn behind their own dialog instead
          // of the plain yes/no confirm — the GM needs to see which agents or
          // fleets broke the rules before deciding whether to advance anyway.
          if (movementViolations.length > 0) { setShowMovementWarning(true); return; }
          if (await confirm(`Advance the turn — ${turnSummary()}?`)) nextTurn();
        }}
        title={turnHasWork ? `Advance the turn — ${turnSummary()}` : "Nothing queued to resolve yet"}>
        <SkipForward size={13} /> Next Turn
      </Btn>
      <span style={{ fontSize: 10.5, color: turnHasWork ? T.mut : T.faint, lineHeight: 1.4 }}>
        {turnSummary()}
      </span>
      {showMovementWarning && (
        <TurnMovementWarningModal violations={movementViolations} factions={factions} systems={systems}
          turnSummary={turnSummary()}
          onCancel={() => setShowMovementWarning(false)}
          onConfirm={() => { setShowMovementWarning(false); nextTurn(); }} />
      )}
    </div>
    {suggestionReview()}
    </>
  );
  const notes_ = <GMNotesPanel notes={notes} addNote={addNote} removeNote={removeNote} />;

  // Mobile: one scroll column — the section switch, then the active section's
  // queue + tool, then notes. `toolRef` rides the agent-action tool so "Resolve
  // with tool" can scroll to it (squadron missions manage their own scroll).
  if (isMobile) {
    return (
      <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", background: T.void, padding: 12 }}>
        {sectionBar()}
        {turnBar()}
        {section === "missions" ? (
          <SquadronMissionsPanel roles={roles} factions={factions} fleets={fleets} missions={missions}
            archivedMissions={archivedMissions}
            isMobile={isMobile} resolveMission={resolveMission} removeMission={removeMission}
            removeArchivedMission={removeArchivedMission} editMissionResolutionText={editMissionResolutionText} />
        ) : section === "replenish" ? (
          <ReplenishPanel fleets={fleets} systems={systems} relations={relations} factions={factions}
            replenishments={replenishments} turnNumber={turnNumber} isMobile={isMobile}
            stageReplenishment={stageReplenishment} />
        ) : section === "checks" ? (
          <EndTurnChecksPanel systems={systems} factions={factions} endTurnChecks={endTurnChecks}
            turnNumber={turnNumber} isMobile={isMobile} ensureOssiteChecks={ensureOssiteChecks}
            rerollOssiteCheck={rerollOssiteCheck} setOssiteCheckOverride={setOssiteCheckOverride}
            rerollAllOssiteChecks={rerollAllOssiteChecks} />
        ) : section === "narrative" ? (
          narrativePane()
        ) : section === "transactions" ? (
          transactionsPane()
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
            <div>
              <div className="stencil" style={{ fontSize: 16, letterSpacing: ".06em", color: T.text,
                display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
                <ClipboardList size={15} color={T.accent} /> ACTION REQUESTS {countBadge(pendingTotal, true)}
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
        )}
        <div style={{ marginTop: 20 }}>{notes_}</div>
      </div>
    );
  }

  // Desktop: the workspace — vertical player rail, the active player's request
  // stack, and the resolution tool (+ notes) pinned on the right, all in view.
  if (section === "missions") {
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: T.void }}>
        {sectionBar()}
        {turnBar()}
        <SquadronMissionsPanel roles={roles} factions={factions} fleets={fleets} missions={missions}
          archivedMissions={archivedMissions}
          isMobile={isMobile} resolveMission={resolveMission} removeMission={removeMission}
          removeArchivedMission={removeArchivedMission} editMissionResolutionText={editMissionResolutionText}
          notesPane={notes_} />
      </div>
    );
  }
  if (section === "replenish") {
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: T.void }}>
        {sectionBar()}
        {turnBar()}
        <ReplenishPanel fleets={fleets} systems={systems} relations={relations} factions={factions}
          replenishments={replenishments} turnNumber={turnNumber} isMobile={isMobile}
          stageReplenishment={stageReplenishment} notesPane={notes_} />
      </div>
    );
  }
  if (section === "checks") {
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: T.void }}>
        {sectionBar()}
        {turnBar()}
        <EndTurnChecksPanel systems={systems} factions={factions} endTurnChecks={endTurnChecks}
          turnNumber={turnNumber} isMobile={isMobile} ensureOssiteChecks={ensureOssiteChecks}
          rerollOssiteCheck={rerollOssiteCheck} setOssiteCheckOverride={setOssiteCheckOverride}
          rerollAllOssiteChecks={rerollAllOssiteChecks} notesPane={notes_} />
      </div>
    );
  }
  if (section === "narrative") {
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: T.void }}>
        {sectionBar()}
        {turnBar()}
        <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 18,
          display: "flex", gap: 22, maxWidth: 900 }}>
          <div style={{ flex: 1, minWidth: 0 }}>{narrativePane()}</div>
          <div style={{ width: 320, flexShrink: 0 }}>{notes_}</div>
        </div>
      </div>
    );
  }
  if (section === "transactions") {
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: T.void }}>
        {sectionBar()}
        {turnBar()}
        <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 18, maxWidth: 700 }}>
          {transactionsPane()}
        </div>
      </div>
    );
  }
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: T.void }}>
      {sectionBar()}
      {turnBar()}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div style={{ width: 212, flexShrink: 0, borderRight: `2px solid ${T.line}`, background: T.panel,
          display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div className="stencil" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5,
            letterSpacing: ".08em", color: T.text, padding: "12px 12px 8px", flexShrink: 0 }}>
            <ClipboardList size={14} color={T.accent} /> REQUESTS {countBadge(pendingTotal)}
          </div>
          <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 8px 10px" }}>
            {playerGroups.length === 0
              ? <div style={{ fontSize: 10.5, color: T.faint, padding: "8px 4px", lineHeight: 1.5 }}>No requests yet.</div>
              : playerRail(true)}
          </div>
        </div>

        <div className="scroll" style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: 18 }}>
          {requestsPane()}
        </div>

        <div ref={toolRef} className="scroll" style={{ width: 392, flexShrink: 0, borderLeft: `2px solid ${T.line}`,
          background: T.void, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 22 }}>
          {toolPane()}
          {notes_}
        </div>
      </div>
    </div>
  );
}

// One action request in the GM's queue. The faction it belongs to isn't
// labeled here — the player rail already puts you in that faction's queue,
// so repeating its name on every card would just be noise; the color dot
// still ties each card back to it at a glance. Pending requests offer
// "Resolve with tool" (which loads the resolution tool with this request's
// player + flagged modifiers); resolved ones show the full result the tool
// wrote back — roll, mods, verdict, and ruling — with Reopen. Either can be
// deleted outright.
// A resolved request's outcome, with an inline "Edit response" affordance so
// the GM can fix a typo or reword the ruling text — the free-text line under
// the success/failure verdict — without Reopen, which would drop the request
// back to pending and lose the roll/mods it was resolved with. Only offered
// for the structured resolution shape (an object); older plain-string
// resolutions just render read-only, same as ActionResolution always has.
function ResolutionWithEdit({ action, editResolution }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const editable = editResolution && action.resolution && typeof action.resolution === "object";

  if (editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder="What happens as a result…"
          style={{ ...inputStyle, minHeight: 56, resize: "vertical", lineHeight: 1.6, fontSize: 12.5, padding: 9,
            fontFamily: F.mono }} />
        <div style={{ display: "flex", gap: 6 }}>
          <Btn kind="primary" onClick={() => { editResolution(action.id, draft.trim()); setEditing(false); }}>
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
      <ActionResolution resolution={action.resolution} />
      {editable && (
        <Btn onClick={() => { setDraft(action.resolution.text || ""); setEditing(true); }}
          style={{ alignSelf: "flex-start" }} title="Edit the response text without reopening this request">
          <Pencil size={12} /> Edit response
        </Btn>
      )}
    </div>
  );
}

function ActionCard({ action, faction, agentLabel, systemLabel, modName, isTarget, onResolveWithTool, reopenAction, removeAction,
  editActionResolution, setActionImportant }) {
  const confirm = useConfirm();
  const resolved = action.status === "resolved";
  // Ruled on with "delay resolution" checked (see App.jsx's resolveAction) —
  // has a resolution just like `resolved`, but the player still sees it as
  // pending until Next Turn reveals it.
  const delayed = action.status === "delayed";
  const settled = resolved || delayed;
  const color = faction ? faction.color : T.accent;
  const flagged = (action.modifierIds || []).map((id) => ({ id, name: modName(id) })).filter((m) => m.name);

  return (
    <div style={{ border: `1px solid ${isTarget ? T.accent : (settled ? T.line : color)}`, borderRadius: 2,
      background: T.panel2, display: "flex", flexDirection: "column", gap: 8, padding: 10,
      opacity: settled ? 0.9 : 1, boxShadow: isTarget ? `0 0 0 1px ${T.accent}` : "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: T.mut }}>
          <VenetianMask size={12} /> {agentLabel}
        </span>
        {systemLabel && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: T.mut }}>
            <MapPin size={12} /> {systemLabel}
          </span>
        )}
        {/* GM-private flag for future turn-summary tooling — only meaningful once
            there's a ruling to summarize, so it only shows up once settled.
            Never rendered anywhere a player can see (AgentsView has no
            equivalent control, and doesn't read the field). */}
        {settled && (
          <button onClick={() => setActionImportant(action.id, !action.important)}
            title={action.important ? "Marked narratively important — click to unmark" : "Mark as narratively important"}
            style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", padding: 0,
              display: "flex", color: action.important ? T.amber : T.faint }}>
            <Star size={14} fill={action.important ? T.amber : "none"} />
          </button>
        )}
        <span style={{ marginLeft: settled ? 0 : "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5,
          fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
          color: resolved ? T.accent : T.amber }}
          title={delayed ? "Ruled on, but held back from the player until Next Turn" : undefined}>
          {resolved ? <Check size={11} /> : <Clock size={11} />}{resolved ? "Resolved" : delayed ? "Delayed" : "Pending"}
        </span>
      </div>

      {action.carriedOver && !settled && (
        <span title="This request went unresolved when the turn advanced and held over into the current one"
          style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5,
          fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase", color: T.faint, alignSelf: "flex-start" }}>
          <History size={11} /> Carried over from a previous turn
        </span>
      )}

      <div style={{ fontSize: 9.5, color: T.faint }}>
        {action.createdAt ? new Date(action.createdAt).toLocaleString() : ""}
      </div>

      <div style={{ fontSize: 13, lineHeight: 1.6, color: T.text, whiteSpace: "pre-wrap" }}>{action.text}</div>

      {flagged.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
          <span style={{ ...lbl, color: T.mut }}>Flagged</span>
          {flagged.map((m) => (
            <span key={m.id} style={{ display: "inline-flex", alignItems: "center", gap: 3,
              border: `1px solid ${color}`, borderRadius: 2, padding: "2px 6px",
              fontSize: 10.5, color, background: `${color}1f` }}>
              <Flag size={10} /> {m.name}
            </span>
          ))}
        </div>
      )}

      {settled ? (
        <>
          <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 6 }}>
            {action.resolution
              ? <ResolutionWithEdit action={action} editResolution={editActionResolution} />
              : <div style={{ fontSize: 12, color: T.mut }}>Resolved with no result recorded.</div>}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn onClick={() => reopenAction(action.id)}>
              <RotateCcw size={13} /> Reopen
            </Btn>
            <Btn kind="danger" style={{ marginLeft: "auto" }}
              onClick={async () => { if (await confirm("Delete this action request?")) removeAction(action.id); }}>
              <Trash2 size={13} /> Delete
            </Btn>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <Btn kind="primary" onClick={onResolveWithTool} title="Load this request into the resolution tool">
            <Wand2 size={13} /> {isTarget ? "In tool below" : "Resolve with tool"}
          </Btn>
          <Btn kind="danger" style={{ marginLeft: "auto" }}
            onClick={async () => { if (await confirm("Delete this action request?")) removeAction(action.id); }}>
            <Trash2 size={13} /> Delete
          </Btn>
        </div>
      )}
    </div>
  );
}

// A read-only entry in a player's Previous Actions archive — the same request
// data an ActionCard shows, minus the controls that only make sense on the
// live queue (Resolve/Reopen touch a turn that's already closed; a request
// that never got resolved before the turn ended just says so). The only
// action left is Delete, to prune the archive itself if it grows too large.
function ArchivedActionCard({ action, faction, agentLabel, systemLabel, modName, removeArchivedAction,
  editArchivedActionResolution, setArchivedActionImportant }) {
  const confirm = useConfirm();
  const resolved = action.status === "resolved";
  const color = faction ? faction.color : T.accent;
  const flagged = (action.modifierIds || []).map((id) => ({ id, name: modName(id) })).filter((m) => m.name);

  return (
    <div style={{ border: `1px solid ${T.line}`, borderRadius: 2,
      background: T.panel2, display: "flex", flexDirection: "column", gap: 8, padding: 10, opacity: 0.9 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: T.mut }}>
          <VenetianMask size={12} /> {agentLabel}
        </span>
        {systemLabel && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: T.mut }}>
            <MapPin size={12} /> {systemLabel}
          </span>
        )}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 }}>
          {/* Same GM-private importance flag as the live queue's ActionCard —
              still settable once a request has moved to Previous Actions,
              since that's exactly where a future turn-summary tool would look. */}
          {resolved && (
            <button onClick={() => setArchivedActionImportant(action.id, !action.important)}
              title={action.important ? "Marked narratively important — click to unmark" : "Mark as narratively important"}
              style={{ background: "none", border: "none", cursor: "pointer", padding: 0,
                display: "flex", color: action.important ? T.amber : T.faint }}>
              <Star size={14} fill={action.important ? T.amber : "none"} />
            </button>
          )}
          {action.turn && (
            <span className="mono" title="The turn this request was resolved on" style={{
              fontSize: 9.5, color: T.faint, border: `1px solid ${T.line}`, borderRadius: 2, padding: "1px 5px" }}>
              Turn {action.turn}
            </span>
          )}
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5,
            fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
            color: resolved ? T.accent : T.faint }}>
            {resolved ? <Check size={11} /> : <Clock size={11} />}{resolved ? "Resolved" : "Never resolved"}
          </span>
        </div>
      </div>

      <div style={{ fontSize: 9.5, color: T.faint }}>
        {action.createdAt ? new Date(action.createdAt).toLocaleString() : ""}
        {action.turnEndedAt ? ` · turn ended ${new Date(action.turnEndedAt).toLocaleString()}` : ""}
      </div>

      <div style={{ fontSize: 13, lineHeight: 1.6, color: T.text, whiteSpace: "pre-wrap" }}>{action.text}</div>

      {flagged.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
          <span style={{ ...lbl, color: T.mut }}>Flagged</span>
          {flagged.map((m) => (
            <span key={m.id} style={{ display: "inline-flex", alignItems: "center", gap: 3,
              border: `1px solid ${color}`, borderRadius: 2, padding: "2px 6px",
              fontSize: 10.5, color, background: `${color}1f` }}>
              <Flag size={10} /> {m.name}
            </span>
          ))}
        </div>
      )}

      <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 6 }}>
        {resolved
          ? (action.resolution
            ? <ResolutionWithEdit action={action} editResolution={editArchivedActionResolution} />
            : <div style={{ fontSize: 12, color: T.mut }}>Resolved with no result recorded.</div>)
          : <div style={{ fontSize: 12, color: T.faint }}>Turn ended before the GM resolved this one.</div>}
      </div>

      <Btn kind="danger" style={{ alignSelf: "flex-end" }}
        onClick={async () => { if (await confirm("Delete this archived action?")) removeArchivedAction(action.id); }}>
        <Trash2 size={13} /> Delete
      </Btn>
    </div>
  );
}
