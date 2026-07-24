import { VenetianMask, Plus, Trash2, User, MapPin, ShieldAlert } from "lucide-react";
import { T, inputStyle, selStyle, lbl } from "../theme.js";
import Btn from "./ui/Btn.jsx";

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

        {/* GM sets the cap; players see it read-only in the counter above. */}
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
