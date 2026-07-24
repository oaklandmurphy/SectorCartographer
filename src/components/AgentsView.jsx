import { useState } from "react";
import { VenetianMask, Plus, Trash2, User, MapPin, ShieldAlert, ClipboardList, Send, Flag, Check, Clock } from "lucide-react";
import { T, inputStyle, selStyle, lbl } from "../theme.js";
import Btn from "./ui/Btn.jsx";
import ActionResolution from "./ui/ActionResolution.jsx";

// Faction tabs run along the top (the GM, who sees every faction, picks one to
// work in; a lone-faction player gets no tab strip, there being nothing to pick).
// Under the active faction, its agents stack in a rail down the left, and the one
// selected there opens in the detail panel on the right — character, location,
// notes, and its action requests. Which factions show up is decided by the caller
// (App.jsx) from the viewer: the GM sees every faction, a player only their own.
//
// The number of agents a faction may field is a GM-set cap (faction.agentCap);
// the GM edits it here, players fill the slots by adding agents up to it, tying
// each to one of their characters and parking it at a system. Agents are strictly
// own-faction — even allies never see them — so there is no visibility control to
// manage here, unlike modifiers.
export default function AgentsView({
  factions, agents, systems, canEdit, isMobile, viewer,
  activeFactionId, setActiveFactionId, addAgent, patchAgent, removeAgent, patchFaction,
  actions, modifiers, submitAction, removeAction,
}) {
  const [selectedAgentId, setSelectedAgentId] = useState(null);

  const activeId = factions.some((f) => f.id === activeFactionId)
    ? activeFactionId : (factions[0] && factions[0].id) || null;
  const activeFaction = factions.find((f) => f.id === activeId) || null;
  const facAgents = activeId ? agents.filter((a) => a.factionId === activeId) : [];

  // Resolve the selected agent against the current faction's roster, falling back
  // to the first agent — so switching factions (or removing the open agent) never
  // leaves the detail panel pointing at nothing.
  const selectedAgent = facAgents.find((a) => a.id === selectedAgentId) || facAgents[0] || null;

  // A player may manage their own faction's agents; the GM manages any. (The
  // faction rail only ever offers the player their own, so this is really just
  // belt-and-braces for the GM/player split.)
  const canManage = !!activeFaction && (canEdit
    || (viewer.kind === "player" && viewer.roleFactionId === activeFaction.id));
  const cap = Number(activeFaction && activeFaction.agentCap) || 0;
  const atCap = facAgents.length >= cap;
  // The modifiers a player may flag on a request — their own faction's.
  const facModifiers = activeId ? (modifiers || []).filter((m) => m.factionId === activeId) : [];

  const systemName = (id) => (systems.find((s) => s.id === id) || {}).name || "";
  const agentLabel = (a) => {
    const member = activeFaction && activeFaction.members.find((m) => m.id === a.memberId);
    if (member) return member.name;
    const idx = facAgents.indexOf(a);
    return `Agent ${idx + 1}`;
  };
  const pendingCount = (a) => (actions || []).filter((x) => x.agentId === a.id && x.status !== "resolved").length;

  // The faction picker along the top — GM only in practice, since a player is
  // handed a single faction and gets no strip at all.
  const factionTabs = () => (
    <div className="scroll" style={{ display: "flex", gap: 4, padding: "8px", overflowX: "auto",
      borderBottom: `2px solid ${T.line}`, background: T.panel, flexShrink: 0 }}>
      {factions.map((f) => {
        const on = f.id === activeId;
        const count = agents.filter((a) => a.factionId === f.id).length;
        return (
          <button key={f.id} onClick={() => { setActiveFactionId(f.id); setSelectedAgentId(null); }} title={f.name}
            style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", whiteSpace: "nowrap",
              border: `1px solid ${on ? f.color : T.line}`, borderRadius: 2, padding: "7px 12px",
              background: on ? `${f.color}26` : T.panel2, color: on ? f.color : T.text,
              fontFamily: "'Oswald', sans-serif", fontSize: 12.5, fontWeight: 600, letterSpacing: ".03em",
              textTransform: "uppercase", flex: "0 0 auto" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: f.color, flexShrink: 0 }} />
            <span>{f.name}</span>
            <span className="mono" style={{ fontSize: 10, color: on ? f.color : T.faint }}>{count}</span>
          </button>
        );
      })}
    </div>
  );

  // The agent rail: vertical on desktop (a left menu), horizontal on mobile.
  const agentRail = (vertical) => (
    <div className={vertical ? "scroll" : "scroll"} style={{ display: "flex",
      flexDirection: vertical ? "column" : "row", gap: 5,
      padding: vertical ? "10px 8px" : "8px", overflowY: vertical ? "auto" : "visible",
      overflowX: vertical ? "visible" : "auto",
      borderRight: vertical ? `2px solid ${T.line}` : "none",
      borderBottom: vertical ? "none" : `2px solid ${T.line}`,
      background: T.panel, flexShrink: 0,
      width: vertical ? 240 : "auto", minHeight: 0 }}>
      {facAgents.length === 0 && (
        <div style={{ fontSize: 10.5, color: T.faint, padding: "12px 6px", textAlign: "center", lineHeight: 1.5 }}>
          {canManage ? (cap > 0 ? "No agents yet." : "No agent slots allotted.") : "No agents."}
        </div>
      )}
      {facAgents.map((a) => {
        const on = selectedAgent && a.id === selectedAgent.id;
        const pend = pendingCount(a);
        return (
          <button key={a.id} onClick={() => setSelectedAgentId(a.id)} title={agentLabel(a)}
            style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", whiteSpace: "nowrap",
              border: `1px solid ${on ? activeFaction.color : T.line}`, borderRadius: 2, padding: "9px 10px",
              background: on ? `${activeFaction.color}22` : T.panel2, color: on ? activeFaction.color : T.text,
              flex: vertical ? "none" : "0 0 auto", textAlign: "left", minWidth: vertical ? 0 : 150 }}>
            <VenetianMask size={15} style={{ color: on ? activeFaction.color : T.mut, flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis",
              fontFamily: "'Oswald', sans-serif", fontSize: 13, fontWeight: 600, letterSpacing: ".03em",
              textTransform: "uppercase" }}>{agentLabel(a)}</span>
            {pend > 0 && (
              <span className="mono" title={`${pend} pending request${pend === 1 ? "" : "s"}`}
                style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0,
                  border: `1px solid ${T.amber}`, borderRadius: 2, padding: "0 4px", fontSize: 9.5,
                  color: T.amber, background: `${T.amber}1f` }}>
                <Clock size={9} /> {pend}
              </span>
            )}
          </button>
        );
      })}
      {canManage && (
        <Btn kind="primary" onClick={() => addAgent(activeFaction.id)} disabled={atCap}
          title={atCap ? "At the GM's agent cap for this faction" : "Add an agent"}
          style={{ justifyContent: "center", flexShrink: 0, marginTop: vertical ? 4 : 0 }}>
          <Plus size={14} /> Add
        </Btn>
      )}
    </div>
  );

  // The header strip over the agent rail + detail: faction name, agent tally, and
  // (GM only) the agent-cap control.
  const factionHeader = () => (
    <div style={{ display: "flex", flexDirection: "column", gap: 9, padding: isMobile ? "12px 14px" : "16px 20px",
      borderBottom: `1px solid ${T.line}`, background: T.void, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ width: 11, height: 11, borderRadius: "50%", background: activeFaction.color, flexShrink: 0 }} />
        <div className="stencil" style={{ fontSize: 19, fontWeight: 800, letterSpacing: ".03em", color: T.text }}>
          {activeFaction.name}
        </div>
        <span className="mono" style={{ fontSize: 12, color: atCap ? T.amber : T.mut, marginLeft: "auto" }}>
          {facAgents.length} / {cap} agents
        </span>
      </div>
      {canEdit && (
        <div style={{ display: "flex", alignItems: "center", gap: 9, background: T.panel, border: `1px solid ${T.line}`,
          borderRadius: 2, padding: "8px 11px" }}>
          <ShieldAlert size={14} style={{ color: T.amber, flexShrink: 0 }} />
          <span style={{ ...lbl, color: T.mut }}>Agent cap</span>
          <input type="number" min={0} className="mono" value={cap}
            onChange={(e) => patchFaction(activeFaction.id, { agentCap: Math.max(0, Number(e.target.value) || 0) })}
            style={{ ...inputStyle, width: 80 }} />
          <span style={{ fontSize: 10.5, color: T.faint, lineHeight: 1.5 }}>
            How many agents this faction's players may field.
          </span>
        </div>
      )}
    </div>
  );

  // The detail panel for whichever agent is open in the rail.
  const detail = () => {
    if (!selectedAgent) {
      return (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 12, color: T.faint, padding: 24, textAlign: "center" }}>
          <VenetianMask size={36} strokeWidth={1.2} />
          <div style={{ fontSize: 11.5, lineHeight: 1.6, maxWidth: 320 }}>
            {facAgents.length === 0
              ? (canManage
                  ? (cap > 0 ? "No agents yet — add one from the rail." : "The GM has not allotted any agent slots to this faction.")
                  : "This faction has no agents.")
              : "Select an agent from the rail to see its detail."}
          </div>
        </div>
      );
    }
    const a = selectedAgent;
    const member = activeFaction.members.find((m) => m.id === a.memberId) || null;
    return (
      <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto",
        display: "flex", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 16px",
          background: `${activeFaction.color}1f`, borderBottom: `2px solid ${activeFaction.color}` }}>
          <VenetianMask size={18} style={{ color: activeFaction.color, flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: 800, fontFamily: "'Oswald', sans-serif",
            letterSpacing: ".05em", textTransform: "uppercase", color: activeFaction.color,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{agentLabel(a)}</span>
          {canManage && (
            <Btn kind="danger" onClick={() => { removeAgent(a.id); setSelectedAgentId(null); }}
              title="Remove this agent">
              <Trash2 size={13} /> Remove
            </Btn>
          )}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: isMobile ? 14 : 18 }}>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 220px" }}>
              <div style={{ ...lbl, display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                <User size={12} /> Character
              </div>
              {canManage ? (
                <select style={selStyle} value={a.memberId || ""}
                  onChange={(e) => patchAgent(a.id, { memberId: e.target.value || null })}>
                  <option value="">— unassigned —</option>
                  {activeFaction.members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              ) : (
                <div style={{ fontSize: 13, color: T.text }}>{member ? member.name : "—"}</div>
              )}
            </div>

            <div style={{ flex: "1 1 220px" }}>
              <div style={{ ...lbl, display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                <MapPin size={12} /> Location
              </div>
              {canManage ? (
                <select style={selStyle} value={a.systemId || ""}
                  onChange={(e) => patchAgent(a.id, { systemId: e.target.value || null })}>
                  <option value="">Unplaced (off-map)</option>
                  {systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              ) : (
                <div style={{ fontSize: 13, color: T.text }}>{a.systemId ? systemName(a.systemId) : "Unplaced"}</div>
              )}
            </div>
          </div>

          <div>
            <div style={{ ...lbl, marginBottom: 4 }}>Notes</div>
            {canManage ? (
              <textarea value={a.notes || ""} onChange={(e) => patchAgent(a.id, { notes: e.target.value })}
                placeholder="Orders, cover identity, status…"
                style={{ ...inputStyle, minHeight: 70, resize: "vertical", lineHeight: 1.6, fontSize: 13, padding: 10 }} />
            ) : (
              <div style={{ fontSize: 13, lineHeight: 1.6, color: T.text, whiteSpace: "pre-wrap" }}>{a.notes || "—"}</div>
            )}
          </div>

          <AgentActions
            agent={a} color={activeFaction.color} isMobile={isMobile}
            actions={(actions || []).filter((x) => x.agentId === a.id)}
            facModifiers={facModifiers} cap={Number(a.actionCap) || 0}
            canManage={canManage} canEdit={canEdit}
            submitAction={submitAction} removeAction={removeAction} patchAgent={patchAgent} />
        </div>
      </div>
    );
  };

  if (!activeFaction) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center",
        justifyContent: "center", gap: 12, color: T.faint, padding: 24, textAlign: "center", background: T.void }}>
        <VenetianMask size={40} strokeWidth={1.2} />
        <div className="stencil" style={{ fontSize: 15, letterSpacing: ".06em", color: T.mut }}>NO FACTION VISIBLE</div>
        <div style={{ fontSize: 11.5, lineHeight: 1.6, maxWidth: 320 }}>
          {canEdit
            ? "Add a faction on the map or politics tab first."
            : "You have no faction assigned, or none is visible to you yet."}
        </div>
      </div>
    );
  }

  const showTabs = factions.length > 1;

  if (isMobile) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: T.void }}>
        {showTabs && factionTabs()}
        {factionHeader()}
        {agentRail(false)}
        {detail()}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: T.void }}>
      {showTabs && factionTabs()}
      {factionHeader()}
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        {agentRail(true)}
        {detail()}
      </div>
    </div>
  );
}

// The action-request block on an agent's detail: this agent's own GM-set quota
// (editable inline by the GM, read-only to players), the requests it has already
// raised — unresolved ones first, then those the GM has ruled on — and, while the
// agent has slots left and the viewer may manage it, a composer to write the next
// one and flag which of the faction's modifiers should bear on it.
function AgentActions({ agent, color, isMobile, actions, facModifiers, cap, canManage, canEdit, submitAction, removeAction, patchAgent }) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState([]); // flagged modifier ids
  const [open, setOpen] = useState(false);   // composer expanded

  const used = actions.length;
  const remaining = Math.max(0, cap - used);
  const modName = (id) => (facModifiers.find((m) => m.id === id) || {}).name || "";

  const pending = actions.filter((rq) => rq.status !== "resolved");
  const resolved = actions.filter((rq) => rq.status === "resolved");

  const togglePick = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const send = () => {
    if (!text.trim()) return;
    submitAction(agent.id, text, picked);
    setText(""); setPicked([]); setOpen(false);
  };

  const requestCard = (rq) => {
    const isResolved = rq.status === "resolved";
    return (
      <div key={rq.id} style={{ border: `1px solid ${T.line}`, borderRadius: 2, background: T.panel3,
        padding: "7px 8px", display: "flex", flexDirection: "column", gap: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9,
            fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
            color: isResolved ? T.accent : T.amber }}>
            {isResolved ? <Check size={10} /> : <Clock size={10} />}{isResolved ? "Resolved" : "Pending"}
          </span>
          {/* A pending request can be withdrawn by its faction (freeing the slot);
              the GM resolves rather than deletes here — that lives in GM Tools. */}
          {canManage && !isResolved && (
            <button onClick={() => removeAction(rq.id)} title="Withdraw this request"
              style={{ marginLeft: "auto", background: "none", border: "none", color: T.danger,
                cursor: "pointer", padding: 0, display: "flex" }}>
              <Trash2 size={12} />
            </button>
          )}
        </div>
        <div style={{ fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
          fontSize: 14, lineHeight: 1.65, color: T.text, whiteSpace: "pre-wrap",
          borderLeft: `2px solid ${color}`, paddingLeft: 12, marginTop: 2 }}>{rq.text}</div>
        {rq.modifierIds && rq.modifierIds.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {rq.modifierIds.map((id) => {
              const name = modName(id);
              if (!name) return null;
              return (
                <span key={id} style={{ display: "inline-flex", alignItems: "center", gap: 3,
                  border: `1px solid ${color}`, borderRadius: 2, padding: "1px 5px",
                  fontSize: 10, color, background: `${color}1f` }}>
                  <Flag size={9} /> {name}
                </span>
              );
            })}
          </div>
        )}
        {isResolved && (
          <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 6 }}>
            {rq.resolution
              ? <ActionResolution resolution={rq.resolution} />
              : <div style={{ fontSize: 11.5, color: T.mut }}>Resolved (no ruling recorded).</div>}
          </div>
        )}
      </div>
    );
  };

  const groupHead = (label) => (
    <div style={{ ...lbl, color: T.faint, marginTop: 2 }}>{label}</div>
  );
  const bothGroups = pending.length > 0 && resolved.length > 0;

  return (
    <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <ClipboardList size={13} style={{ color: T.mut }} />
        <span style={lbl}>Action Requests</span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4 }}>
          <span className="mono" style={{ fontSize: 10.5, color: remaining === 0 ? T.amber : T.mut }}>
            {used} /
          </span>
          {canEdit ? (
            <input type="number" min={0} className="mono" value={cap}
              onChange={(e) => patchAgent(agent.id, { actionCap: Math.max(0, Number(e.target.value) || 0) })}
              title="How many action requests this agent may raise"
              style={{ ...inputStyle, width: 52, padding: "2px 5px", textAlign: "right" }} />
          ) : (
            <span className="mono" style={{ fontSize: 10.5, color: remaining === 0 ? T.amber : T.mut }}>{cap}</span>
          )}
        </div>
      </div>

      {actions.length === 0 && (
        <div style={{ fontSize: 11, color: T.faint, lineHeight: 1.5 }}>
          {cap === 0
            ? (canEdit ? "Set a quota above to let this agent raise actions." : "The GM hasn't allotted this agent any actions.")
            : "No requests raised yet."}
        </div>
      )}

      {/* Unresolved first, then resolved. */}
      {pending.length > 0 && (
        <>
          {bothGroups && groupHead("Unresolved")}
          {pending.map(requestCard)}
        </>
      )}
      {resolved.length > 0 && (
        <>
          {bothGroups && groupHead("Resolved")}
          {resolved.map(requestCard)}
        </>
      )}

      {canManage && remaining > 0 && !open && (
        <Btn onClick={() => setOpen(true)} style={{ alignSelf: "flex-start" }}>
          <Plus size={13} /> New request
        </Btn>
      )}

      {canManage && remaining > 0 && open && (
        <div style={{ border: `1px solid ${T.line}`, borderRadius: 2, background: T.panel2,
          padding: 8, display: "flex", flexDirection: "column", gap: 7 }}>
          <textarea value={text} onChange={(e) => setText(e.target.value)} autoFocus
            placeholder="Describe the action this agent should attempt…"
            style={{ ...inputStyle, minHeight: 64, resize: "vertical",
              fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
              fontSize: 14, lineHeight: 1.65, padding: 10 }} />
          {facModifiers.length > 0 ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={{ ...lbl, display: "flex", alignItems: "center", gap: 5 }}>
                <Flag size={11} /> Flag modifiers you think apply
              </span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {facModifiers.map((m) => {
                  const on = picked.includes(m.id);
                  return (
                    <button key={m.id} onClick={() => togglePick(m.id)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer",
                        border: `1px solid ${on ? color : T.line}`, borderRadius: 2, padding: "3px 7px",
                        background: on ? `${color}26` : T.panel3, color: on ? color : T.mut,
                        fontFamily: "'Oswald', sans-serif", fontSize: 10.5, fontWeight: 600,
                        letterSpacing: ".03em", textTransform: "uppercase" }}>
                      {on && <Check size={10} />}{m.name || "Unnamed modifier"}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <span style={{ fontSize: 10.5, color: T.faint }}>
              No modifiers recorded for your faction to flag.
            </span>
          )}
          <div style={{ display: "flex", gap: 6 }}>
            <Btn kind="primary" onClick={send} disabled={!text.trim()}
              title={text.trim() ? "Send this request to the GM" : "Write the request first"}
              style={{ flex: 1, justifyContent: "center" }}>
              <Send size={13} /> Submit
            </Btn>
            <Btn onClick={() => { setText(""); setPicked([]); setOpen(false); }}
              style={{ justifyContent: "center" }}>
              Cancel
            </Btn>
          </div>
        </div>
      )}

      {canManage && remaining === 0 && cap > 0 && (
        <div style={{ fontSize: 10.5, color: T.faint }}>
          This agent has used all its action requests.
        </div>
      )}
    </div>
  );
}
