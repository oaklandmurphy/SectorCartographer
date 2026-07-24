import { useState } from "react";
import { VenetianMask, Plus, Trash2, User, MapPin, ShieldAlert, ClipboardList, Send, Flag, Check, Clock } from "lucide-react";
import { T, inputStyle, selStyle, lbl } from "../theme.js";
import Btn from "./ui/Btn.jsx";
import ActionResolution from "./ui/ActionResolution.jsx";

// A subtab per faction, each holding that faction's covert agents. Which factions
// show up is decided by the caller (App.jsx) from the viewer: the GM sees every
// faction, a player sees only their own, an anonymous viewer none — so this
// component just renders the faction list it's handed, like ModifiersView.
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
  const activeId = factions.some((f) => f.id === activeFactionId)
    ? activeFactionId : (factions[0] && factions[0].id) || null;
  const activeFaction = factions.find((f) => f.id === activeId) || null;
  const facAgents = activeId ? agents.filter((a) => a.factionId === activeId) : [];

  // A player may manage their own faction's agents; the GM manages any. (The
  // faction rail only ever offers the player their own, so this is really just
  // belt-and-braces for the GM/player split.)
  const canManage = !!activeFaction && (canEdit
    || (viewer.kind === "player" && viewer.roleFactionId === activeFaction.id));
  const cap = Number(activeFaction && activeFaction.agentCap) || 0;
  // The modifiers a player may flag on a request — their own faction's.
  const facModifiers = activeId ? (modifiers || []).filter((m) => m.factionId === activeId) : [];

  const systemName = (id) => (systems.find((s) => s.id === id) || {}).name || "";

  const factionRail = (vertical) => (
    <div className={vertical ? "" : "scroll"} style={{ display: "flex", flexDirection: vertical ? "column" : "row",
      gap: 4, padding: vertical ? "10px 8px" : "8px", overflowX: vertical ? "visible" : "auto",
      borderBottom: vertical ? `1px solid ${T.line}` : `2px solid ${T.line}`, flexShrink: 0 }}>
      {factions.map((f) => {
        const on = f.id === activeId;
        const count = agents.filter((a) => a.factionId === f.id).length;
        return (
          <button key={f.id} onClick={() => setActiveFactionId(f.id)} title={f.name}
            style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", whiteSpace: "nowrap",
              border: `1px solid ${on ? f.color : T.line}`, borderRadius: 2, padding: "7px 10px",
              background: on ? `${f.color}26` : T.panel2, color: on ? f.color : T.text,
              fontFamily: "'Oswald', sans-serif", fontSize: 12.5, fontWeight: 600, letterSpacing: ".03em",
              textTransform: "uppercase", justifyContent: vertical ? "flex-start" : "center", flex: vertical ? "none" : "0 0 auto" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: f.color, flexShrink: 0 }} />
            <span style={{ flex: 1, textAlign: "left" }}>{f.name}</span>
            <span className="mono" style={{ fontSize: 10, color: on ? f.color : T.faint }}>{count}</span>
          </button>
        );
      })}
    </div>
  );

  const renderCard = (a, idx) => {
    const member = activeFaction.members.find((m) => m.id === a.memberId) || null;
    const label = member ? member.name : `Agent ${idx + 1}`;
    return (
      <div key={a.id} style={{ border: `1px solid ${T.line}`, borderRadius: 2, background: T.panel2,
        display: "flex", flexDirection: "column", gap: 8, flex: `0 1 ${isMobile ? "100%" : "340px"}`,
        maxWidth: isMobile ? "100%" : 400 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 10px",
          background: `${activeFaction.color}1f`, borderBottom: `2px solid ${activeFaction.color}` }}>
          <VenetianMask size={16} style={{ color: activeFaction.color, flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 800, fontFamily: "'Oswald', sans-serif",
            letterSpacing: ".05em", textTransform: "uppercase", color: activeFaction.color,
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 10px 10px" }}>
          <div>
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
              <div style={{ fontSize: 12.5, color: T.text }}>{member ? member.name : "—"}</div>
            )}
          </div>

          <div>
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
              <div style={{ fontSize: 12.5, color: T.text }}>{a.systemId ? systemName(a.systemId) : "Unplaced"}</div>
            )}
          </div>

          <div>
            <div style={{ ...lbl, marginBottom: 4 }}>Notes</div>
            {canManage ? (
              <textarea value={a.notes || ""} onChange={(e) => patchAgent(a.id, { notes: e.target.value })}
                placeholder="Orders, cover identity, status…"
                style={{ ...inputStyle, minHeight: 60, resize: "vertical", lineHeight: 1.6, fontSize: 12.5, padding: 10 }} />
            ) : (
              <div style={{ fontSize: 12.5, lineHeight: 1.6, color: T.text, whiteSpace: "pre-wrap" }}>{a.notes || "—"}</div>
            )}
          </div>

          <AgentActions
            agent={a} color={activeFaction.color} isMobile={isMobile}
            actions={(actions || []).filter((x) => x.agentId === a.id)}
            facModifiers={facModifiers} cap={Number(a.actionCap) || 0}
            canManage={canManage} canEdit={canEdit}
            submitAction={submitAction} removeAction={removeAction} patchAgent={patchAgent} />

          {canManage && (
            <Btn kind="danger" onClick={() => removeAgent(a.id)} style={{ alignSelf: "flex-start" }}>
              <Trash2 size={13} /> Remove
            </Btn>
          )}
        </div>
      </div>
    );
  };

  const content = () => {
    if (!activeFaction) {
      return (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 12, color: T.faint, padding: 24, textAlign: "center" }}>
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
    const atCap = facAgents.length >= cap;
    return (
      <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: isMobile ? 14 : 22,
        display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: activeFaction.color, flexShrink: 0 }} />
          <div className="stencil" style={{ fontSize: 20, fontWeight: 800, letterSpacing: ".03em", color: T.text }}>
            {activeFaction.name}
          </div>
          <span className="mono" style={{ fontSize: 12, color: atCap ? T.amber : T.mut, marginLeft: "auto" }}>
            {facAgents.length} / {cap} agents
          </span>
        </div>

        {/* GM sets the agent cap here; each agent's own action quota is set on its
            card below. Players see both read-only. */}
        {canEdit && (
          <div style={{ display: "flex", alignItems: "center", gap: 9, background: T.panel, border: `1px solid ${T.line}`,
            borderRadius: 2, padding: "9px 11px" }}>
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

        {facAgents.length === 0 && (
          <div style={{ fontSize: 11.5, color: T.faint, padding: "16px 8px", textAlign: "center",
            border: `1px dashed ${T.line}`, lineHeight: 1.6 }}>
            No agents yet.{canManage ? (cap > 0 ? " Add one below." : " The GM has not allotted any agent slots to this faction.") : ""}
          </div>
        )}

        {facAgents.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            {facAgents.map((a, i) => renderCard(a, i))}
          </div>
        )}

        {canManage && (
          <Btn kind="primary" onClick={() => addAgent(activeFaction.id)} disabled={atCap}
            title={atCap ? "At the GM's agent cap for this faction" : "Add an agent"}
            style={{ alignSelf: "flex-start" }}>
            <Plus size={14} /> Add agent
          </Btn>
        )}
      </div>
    );
  };

  if (isMobile) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: T.void }}>
        {factionRail(false)}
        {content()}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", background: T.void }}>
      <div style={{ width: 240, flexShrink: 0, borderRight: `2px solid ${T.line}`, background: T.panel,
        display: "flex", flexDirection: "column", minHeight: 0 }}>
        {factionRail(true)}
      </div>
      {content()}
    </div>
  );
}

// The action-request block on an agent's card: this agent's own GM-set quota
// (editable inline by the GM, read-only to players), the requests it has already
// raised (with the GM's resolution once it lands), and — while the agent has
// slots left and the viewer may manage it — a composer to write the next one and
// flag which of the faction's modifiers should bear on it.
function AgentActions({ agent, color, isMobile, actions, facModifiers, cap, canManage, canEdit, submitAction, removeAction, patchAgent }) {
  const [text, setText] = useState("");
  const [picked, setPicked] = useState([]); // flagged modifier ids
  const [open, setOpen] = useState(false);   // composer expanded

  const used = actions.length;
  const remaining = Math.max(0, cap - used);
  const modName = (id) => (facModifiers.find((m) => m.id === id) || {}).name || "";

  const togglePick = (id) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const send = () => {
    if (!text.trim()) return;
    submitAction(agent.id, text, picked);
    setText(""); setPicked([]); setOpen(false);
  };

  return (
    <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <ClipboardList size={12} style={{ color: T.mut }} />
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

      {actions.map((rq) => {
        const resolved = rq.status === "resolved";
        return (
          <div key={rq.id} style={{ border: `1px solid ${T.line}`, borderRadius: 2, background: T.panel3,
            padding: "7px 8px", display: "flex", flexDirection: "column", gap: 5 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9,
                fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
                color: resolved ? T.accent : T.amber }}>
                {resolved ? <Check size={10} /> : <Clock size={10} />}{resolved ? "Resolved" : "Pending"}
              </span>
              {/* A pending request can be withdrawn by its faction (freeing the slot);
                  the GM resolves rather than deletes here — that lives in GM Tools. */}
              {canManage && !resolved && (
                <button onClick={() => removeAction(rq.id)} title="Withdraw this request"
                  style={{ marginLeft: "auto", background: "none", border: "none", color: T.danger,
                    cursor: "pointer", padding: 0, display: "flex" }}>
                  <Trash2 size={12} />
                </button>
              )}
            </div>
            <div style={{ fontSize: 12, lineHeight: 1.55, color: T.text, whiteSpace: "pre-wrap" }}>{rq.text}</div>
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
            {resolved && (
              <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 6 }}>
                {rq.resolution
                  ? <ActionResolution resolution={rq.resolution} />
                  : <div style={{ fontSize: 11.5, color: T.mut }}>Resolved (no ruling recorded).</div>}
              </div>
            )}
          </div>
        );
      })}

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
            style={{ ...inputStyle, minHeight: 64, resize: "vertical", lineHeight: 1.6, fontSize: 12.5, padding: 9 }} />
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
