import { Trash2, User, Star, Send } from "lucide-react";
import { T, inputStyle, lbl } from "../theme.js";
import Btn from "./ui/Btn.jsx";
import PanelPopup from "./ui/PanelPopup.jsx";
import CodexLink from "./CodexLink.jsx";

// Focused editor for a single character clicked inside a faction on the
// politics map. Marking one "important" promotes it to the faction card's
// portrait grid; the rest stay in the list below it.
export default function MemberPopup({
  faction, member, pos, containerHeight, canEdit, wiki, viewer,
  patchMember, patchMemberTitle, removeMember, goToCodex, createEntry, onClose,
  agent, canManageAgent, onRequestAction,
}) {
  const star = !!member.star;
  const canEditTitle = canEdit || (viewer && viewer.kind === "player" && viewer.roleFactionId === faction.id);
  return (
    <PanelPopup frame={{ left: pos.x, top: pos.y, width: 288 }} maxHeight={containerHeight - 20} zIndex={55}
      color={faction.color} icon={<User size={13} />} title="CHARACTER" onClose={onClose}>
        <div style={{ fontSize: 10.5, color: T.mut }}>
          In <b style={{ color: faction.color }}>{faction.name}</b>
        </div>
        <div>
          <div style={lbl}>Name</div>
          <input style={{ ...inputStyle, marginTop: 4 }} value={member.name} disabled={!canEdit}
            onChange={(e) => patchMember(faction.id, member.id, { name: e.target.value })} />
        </div>
        <button type="button" disabled={!canEdit}
          onClick={() => patchMember(faction.id, member.id, { star: !star })}
          title="Important characters get a portrait in the faction card"
          style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left",
            padding: "7px 9px", cursor: canEdit ? "pointer" : "default",
            background: star ? `${T.amber}1f` : T.panel2, border: `1px solid ${star ? T.amber : T.line}`,
            borderRadius: 2, color: star ? T.amber : T.mut }}>
          <Star size={14} style={{ flexShrink: 0, fill: star ? T.amber : "none" }} />
          <span style={{ flex: 1, fontSize: 11.5, fontWeight: 600, color: star ? T.amber : T.text }}>
            Important character
          </span>
          <span className="mono" style={{ fontSize: 9.5, letterSpacing: ".06em", textTransform: "uppercase" }}>
            {star ? "portrait" : "in list"}
          </span>
        </button>
        <div>
          <div style={lbl}>Role / title</div>
          <input style={{ ...inputStyle, marginTop: 4 }} value={member.role || ""} disabled={!canEditTitle}
            placeholder="e.g. Fleet Admiral" onChange={(e) => patchMemberTitle(faction.id, member.id, e.target.value)} />
        </div>
        <CodexLink wiki={wiki} value={member.wikiId} canEdit={canEdit}
          onChange={(id) => patchMember(faction.id, member.id, { wikiId: id })}
          onNavigate={goToCodex} onCreate={createEntry}
          createTitle={member.name} createCategory="characters" />
        {agent && canManageAgent && onRequestAction && (
          <Btn kind="primary" onClick={onRequestAction} style={{ width: "100%", justifyContent: "center" }}>
            <Send size={14} /> Request Action
          </Btn>
        )}
        {canEdit && (
          <Btn kind="danger" onClick={() => removeMember(faction.id, member.id)} style={{ width: "100%", justifyContent: "center" }}>
            <Trash2 size={14} /> Remove character
          </Btn>
        )}
    </PanelPopup>
  );
}
