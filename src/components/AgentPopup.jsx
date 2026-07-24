import { VenetianMask, User, MapPin, Trash2, Send } from "lucide-react";
import { T, inputStyle, selStyle, lbl } from "../theme.js";
import Btn from "./ui/Btn.jsx";
import MapPopup from "./ui/MapPopup.jsx";

// The map's popup for an agent — the same fields as an AgentsView card, anchored
// beside the agent's marker. Only the owning faction's players (and the GM) ever
// reach it, since agents are strictly own-faction and only they render on the
// map. `canManage` gates editing; a read-only viewer never sees this popup in
// practice, but the fields fall back to plain text just in case. Location is
// the one field `canManage` does NOT unlock — only the GM places an agent on
// the map; a player requests a move instead, same as a fleet.
export default function AgentPopup({
  agent, faction, anchor, containerSize, isMobile, canManage, canEdit,
  patchAgent, removeAgent, systems, onClose, onRequestAction,
}) {
  const members = (faction && faction.members) || [];
  const member = members.find((m) => m.id === agent.memberId) || null;
  const systemName = (id) => (systems.find((s) => s.id === id) || {}).name || "";
  return (
    <MapPopup anchor={anchor} containerSize={containerSize} isMobile={isMobile} width={288} gap={10}
      color={faction ? faction.color : T.accent} icon={<VenetianMask size={13} />} title="AGENT" onClose={onClose}>
      <div>
        <div style={{ ...lbl, display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
          <User size={12} /> Character
        </div>
        {canManage ? (
          <select style={selStyle} value={agent.memberId || ""}
            onChange={(e) => patchAgent(agent.id, { memberId: e.target.value || null })}>
            <option value="">— unassigned —</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
        ) : (
          <div style={{ fontSize: 12.5, color: T.text }}>{member ? member.name : "—"}</div>
        )}
      </div>

      <div>
        <div style={{ ...lbl, display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
          <MapPin size={12} /> Location
        </div>
        {canEdit ? (
          <select style={selStyle} value={agent.systemId || ""}
            onChange={(e) => patchAgent(agent.id, { systemId: e.target.value || null })}>
            <option value="">Unplaced (off-map)</option>
            {systems.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        ) : (
          <div style={{ fontSize: 12.5, color: T.text }}>{agent.systemId ? systemName(agent.systemId) : "Unplaced"}</div>
        )}
      </div>

      <div>
        <div style={{ ...lbl, marginBottom: 4 }}>Notes</div>
        {canManage ? (
          <textarea value={agent.notes || ""} onChange={(e) => patchAgent(agent.id, { notes: e.target.value })}
            placeholder="Orders, cover identity, status…"
            style={{ ...inputStyle, minHeight: 64, resize: "vertical", lineHeight: 1.6, fontSize: 12.5, padding: 10 }} />
        ) : (
          <div style={{ fontSize: 12.5, lineHeight: 1.6, color: T.text, whiteSpace: "pre-wrap" }}>{agent.notes || "—"}</div>
        )}
      </div>

      {canManage && onRequestAction && (
        <Btn kind="primary" onClick={onRequestAction} style={{ alignSelf: "flex-start" }}>
          <Send size={13} /> Request Action
        </Btn>
      )}

      {canManage && (
        <Btn kind="danger" onClick={() => { removeAgent(agent.id); onClose(); }} style={{ alignSelf: "flex-start" }}>
          <Trash2 size={13} /> Remove agent
        </Btn>
      )}
    </MapPopup>
  );
}
