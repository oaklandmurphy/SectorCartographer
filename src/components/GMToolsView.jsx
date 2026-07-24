import { useEffect, useMemo, useRef, useState } from "react";
import { Gavel, NotebookPen, Copy, Trash2, Plus, Dices, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6,
  ClipboardList, VenetianMask, Flag, Check, Clock, RotateCcw, Wand2, Users } from "lucide-react";
import { T, inputStyle, selStyle, lbl, cut } from "../theme.js";
import Btn from "./ui/Btn.jsx";
import ActionResolution from "./ui/ActionResolution.jsx";

const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
const rollDie = () => 1 + Math.floor(Math.random() * 6);
const DIE_FACES = { 1: Dice1, 2: Dice2, 3: Dice3, 4: Dice4, 5: Dice5, 6: Dice6 };

const OUTCOMES = [
  { id: "success", label: "Success", kind: "primary" },
  { id: "failure", label: "Failure", kind: "danger" },
  { id: "autoSuccess", label: "Auto Success", kind: "primary" },
  { id: "autoFailure", label: "Auto Failure", kind: "danger" },
];
const OUTCOME_LABEL = {
  success: "Success", failure: "Failure", autoSuccess: "Auto Success", autoFailure: "Auto Failure",
};

// GM-only workbench (App.jsx gates the tab and the render — see there for why
// nothing here re-checks isGM). Three stacked tools:
//
//   1. ACTION REQUESTS — the queue of things players have asked their agents to
//      attempt, split into a tab per player. Each pending request can be pushed
//      straight into the resolution tool below, pre-filled with that player's
//      faction and the modifiers they flagged.
//   2. ROLL RESOLUTION — resolve a roll against a faction's modifiers. When it's
//      driven from a request it writes the full result (roll, mods, verdict, and
//      the GM's outcome text) back onto that request and closes it; used
//      standalone it just produces the Discord-ready text as before.
//   3. NOTES — freeform log plus any tracked roll resolutions.
//
// A modifier's point value is situational (the same modifier might swing +1 one
// week and +2 the next), so it's typed in at the moment of use, not stored.
export default function GMToolsView({ roles, factions, modifiers, notes, isMobile, addNote, removeNote,
  actions, agents, resolveAction, reopenAction, removeAction }) {
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
  const [output, setOutput] = useState("");

  const targetAction = targetId ? (actions || []).find((a) => a.id === targetId) : null;

  // Reset the input fields but leave `output` alone, so the Discord text a resolve
  // just produced stays copyable after the request is closed and the tool clears.
  function clearTool() {
    setSelectedIds([]); setModValues({}); setDice(null); setRollText("");
    setTotalModText("0"); setOutcomeText("");
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
    setDice(null); setRollText(""); setTotalModText(String(preIds.length)); setOutcomeText(""); setOutput("");
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
      resolveAction(targetAction.id, resolution);
      if (track) addNote(text, "roll", { playerName: role ? role.name : null });
      setTargetId(""); clearTool();
    } else if (track) {
      addNote(text, "roll", { playerName: role ? role.name : null });
    }
  }

  async function copyOutput() {
    try { await navigator.clipboard.writeText(output); } catch (e) { /* clipboard unavailable */ }
  }

  const [noteInput, setNoteInput] = useState("");
  function submitNote() {
    const text = noteInput.trim();
    if (!text) return;
    addNote(text, "note");
    setNoteInput("");
  }
  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [notes],
  );

  /* ------------------------------------------------ action-request queue, split per player */
  // One group per player who has raised a request (keyed by their role id; a
  // GM/open-mode submission with no role falls under a "GM" group).
  const playerGroups = useMemo(() => {
    const map = new Map();
    for (const a of actions || []) {
      const key = (a.createdBy && a.createdBy.roleId) || "";
      if (!map.has(key)) {
        const name = (roles.find((r) => r.id === key) || {}).name
          || (a.createdBy && a.createdBy.roleName) || (key ? "Unknown player" : "GM / open");
        map.set(key, { key, name, items: [] });
      }
      map.get(key).items.push(a);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [actions, roles]);

  const [playerTab, setPlayerTab] = useState(null);
  const activeKey = playerGroups.some((g) => g.key === playerTab)
    ? playerTab : (playerGroups[0] ? playerGroups[0].key : null);
  const activeGroup = playerGroups.find((g) => g.key === activeKey) || null;
  const pendingTotal = (actions || []).filter((a) => a.status !== "resolved").length;

  // The active player's requests split for the two-tier stack: unresolved on top
  // (oldest first, the order they arrived), resolved below (newest first, a log).
  const { unresolved, resolved } = useMemo(() => {
    const items = activeGroup ? activeGroup.items : [];
    return {
      unresolved: items.filter((a) => a.status !== "resolved").sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
      resolved: items.filter((a) => a.status === "resolved").sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0)),
    };
  }, [activeGroup]);

  const describeAgent = (action) => {
    const fac = factions.find((f) => f.id === action.factionId) || null;
    const agent = (agents || []).find((a) => a.id === action.agentId) || null;
    const member = agent && fac ? (fac.members || []).find((m) => m.id === agent.memberId) : null;
    const label = member ? member.name : (agent ? "Agent" : "Agent (removed)");
    return { faction: fac, label };
  };
  const modName = (id) => (modifiers.find((m) => m.id === id) || {}).name || "";

  /* ------------------------------------------------ render helpers, one per zone
     so the same markup serves the desktop workspace (rail | requests | tool) and
     the stacked mobile layout without duplicating it. */
  const countBadge = (n, big) => (n > 0 ? (
    <span className="mono" style={{ background: T.amber, color: "#0f1207", borderRadius: big ? 8 : 7,
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
    const pending = g.items.filter((a) => a.status !== "resolved").length;
    return (
      <button key={g.key || "_gm"} onClick={() => setPlayerTab(g.key)} title={g.name}
        style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", whiteSpace: "nowrap",
          border: `1px solid ${on ? T.accent : T.line}`, borderRadius: 2, padding: "7px 10px",
          background: on ? "rgba(159,194,58,.14)" : T.panel2, color: on ? T.accent : T.text,
          fontFamily: "'Oswald', sans-serif", fontSize: 12.5, fontWeight: 600, letterSpacing: ".03em",
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
    const { faction: fac, label } = describeAgent(action);
    return (
      <ActionCard key={action.id} action={action} faction={fac} agentLabel={label}
        modName={modName} isTarget={action.id === targetId}
        onResolveWithTool={() => startResolving(action)}
        reopenAction={reopenAction} removeAction={removeAction} />
    );
  };

  // The active player's two-tier stack: unresolved on top, resolved below.
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
          <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: T.mut }}>
            {unresolved.length} new · {resolved.length} resolved
          </span>
        </div>
        {unresolved.length === 0 && resolved.length === 0 && (
          <div style={{ fontSize: 11.5, color: T.faint, padding: "16px 8px", textAlign: "center",
            border: `1px dashed ${T.line}` }}>
            No requests from this player.
          </div>
        )}
        {unresolved.length > 0 && sectionLabel("UNRESOLVED")}
        {unresolved.map(renderCard)}
        {resolved.length > 0 && sectionLabel("RESOLVED")}
        {resolved.map(renderCard)}
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
            style={{ ...inputStyle, minHeight: 56, resize: "vertical", lineHeight: 1.6, fontSize: 12.5, padding: 9 }} />
        </div>

        <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 11.5, color: T.mut }}>
          <input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} />
          Also log this resolution in the notes below
        </label>

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {OUTCOMES.map((o) => (
            <Btn key={o.id} kind={o.kind} onClick={() => resolve(o.id)} style={{ flex: "1 1 130px", justifyContent: "center" }}>
              {targetAction ? "Resolve: " : ""}{o.label}
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

  const notesPane = () => (
    <div>
      <div className="stencil" style={{ fontSize: 16, letterSpacing: ".06em", color: T.text,
        display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        <NotebookPen size={15} color={T.accent} /> NOTES
      </div>

      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        <input value={noteInput} onChange={(e) => setNoteInput(e.target.value)}
          placeholder="Add a note…" style={{ ...inputStyle, flex: 1 }}
          onKeyDown={(e) => { if (e.key === "Enter") submitNote(); }} />
        <Btn kind="primary" onClick={submitNote} disabled={!noteInput.trim()}>
          <Plus size={13} /> Add
        </Btn>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {sortedNotes.length === 0 && (
          <div style={{ fontSize: 11.5, color: T.faint, padding: "16px 8px", textAlign: "center",
            border: `1px dashed ${T.line}` }}>
            No notes yet.
          </div>
        )}
        {sortedNotes.map((n) => (
          <div key={n.id} style={{ border: `1px solid ${T.line}`, borderRadius: 2, background: T.panel2,
            padding: 9, display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase",
                color: n.kind === "roll" ? T.accent : T.faint, fontWeight: 700 }}>
                {n.kind === "roll" ? `Roll${n.playerName ? ` · ${n.playerName}` : ""}` : "Note"}
              </span>
              <span style={{ fontSize: 9.5, color: T.faint, marginLeft: "auto" }}>
                {n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}
              </span>
              <button onClick={() => removeNote(n.id)} title="Remove note"
                style={{ background: "none", border: "none", color: T.danger, cursor: "pointer", padding: 2 }}>
                <Trash2 size={13} />
              </button>
            </div>
            <div className={n.kind === "roll" ? "mono" : undefined}
              style={{ fontSize: 12.5, lineHeight: 1.6, color: T.text, whiteSpace: "pre-wrap" }}>
              {n.text}
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // Mobile: one scroll column — the player strip and its requests, then the tool,
  // then notes. `toolRef` rides the tool so "Resolve with tool" can scroll to it.
  if (isMobile) {
    return (
      <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", background: T.void, padding: 12 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div>
            <div className="stencil" style={{ fontSize: 16, letterSpacing: ".06em", color: T.text,
              display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
              <ClipboardList size={15} color={T.accent} /> ACTION REQUESTS {countBadge(pendingTotal, true)}
            </div>
            {playerGroups.length > 0 && <div style={{ marginBottom: 10 }}>{playerRail(false)}</div>}
            {requestsPane()}
          </div>
          <div ref={toolRef}>{toolPane()}</div>
          {notesPane()}
        </div>
      </div>
    );
  }

  // Desktop: the workspace — vertical player rail, the active player's request
  // stack, and the resolution tool (+ notes) pinned on the right, all in view.
  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", background: T.void }}>
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
        {notesPane()}
      </div>
    </div>
  );
}

// One action request in the GM's queue. Pending requests offer "Resolve with
// tool" (which loads the resolution tool with this request's player + flagged
// modifiers); resolved ones show the full result the tool wrote back — roll,
// mods, verdict, and ruling — with Reopen. Either can be deleted outright.
function ActionCard({ action, faction, agentLabel, modName, isTarget, onResolveWithTool, reopenAction, removeAction }) {
  const resolved = action.status === "resolved";
  const color = faction ? faction.color : T.accent;
  const flagged = (action.modifierIds || []).map((id) => ({ id, name: modName(id) })).filter((m) => m.name);

  return (
    <div style={{ border: `1px solid ${isTarget ? T.accent : (resolved ? T.line : color)}`, borderRadius: 2,
      background: T.panel2, display: "flex", flexDirection: "column", gap: 8, padding: 10,
      opacity: resolved ? 0.9 : 1, boxShadow: isTarget ? `0 0 0 1px ${T.accent}` : "none" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: "'Oswald', sans-serif",
          letterSpacing: ".03em", color: T.text }}>{faction ? faction.name : "Unknown faction"}</span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: T.mut }}>
          <VenetianMask size={12} /> {agentLabel}
        </span>
        <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5,
          fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
          color: resolved ? T.accent : T.amber }}>
          {resolved ? <Check size={11} /> : <Clock size={11} />}{resolved ? "Resolved" : "Pending"}
        </span>
      </div>

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

      {resolved ? (
        <>
          <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 6 }}>
            {action.resolution
              ? <ActionResolution resolution={action.resolution} />
              : <div style={{ fontSize: 12, color: T.mut }}>Resolved with no result recorded.</div>}
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <Btn onClick={() => reopenAction(action.id)}>
              <RotateCcw size={13} /> Reopen
            </Btn>
            <Btn kind="danger" onClick={() => removeAction(action.id)} style={{ marginLeft: "auto" }}>
              <Trash2 size={13} /> Delete
            </Btn>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", gap: 6 }}>
          <Btn kind="primary" onClick={onResolveWithTool} title="Load this request into the resolution tool">
            <Wand2 size={13} /> {isTarget ? "In tool below" : "Resolve with tool"}
          </Btn>
          <Btn kind="danger" onClick={() => removeAction(action.id)} style={{ marginLeft: "auto" }}>
            <Trash2 size={13} /> Delete
          </Btn>
        </div>
      )}
    </div>
  );
}
