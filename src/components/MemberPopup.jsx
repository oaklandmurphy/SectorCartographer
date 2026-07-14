import { Trash2 } from "lucide-react";
import { T, panelStyle, inputStyle, selStyle, lbl } from "../theme.js";
import { MEMBER_KINDS } from "../constants.js";
import Btn from "./ui/Btn.jsx";
import Rivet from "./ui/Rivet.jsx";
import PopupHeader from "./ui/PopupHeader.jsx";
import CodexLink from "./CodexLink.jsx";

const kindMeta = (id) => MEMBER_KINDS.find((k) => k.id === id) || MEMBER_KINDS[0];

// Focused editor for a single subnode (a character or organization) clicked
// inside a faction on the politics map.
export default function MemberPopup({
  faction, member, pos, containerHeight, canEdit, wiki,
  patchMember, removeMember, goToCodex, createEntry, onClose,
}) {
  const Km = kindMeta(member.kind); const Ic = Km.icon;
  return (
    <div className="pop" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
      style={{ position: "absolute", left: pos.x, top: pos.y, width: 288, zIndex: 55,
        maxHeight: containerHeight - 20, display: "flex", flexDirection: "column", ...panelStyle }}>
      <Rivet corner="tr" /><Rivet corner="bl" />
      <PopupHeader color={faction.color} icon={<Ic size={13} />} title={Km.label.toUpperCase()} onClose={onClose} />
      <div className="scroll" style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12, overflowY: "auto", minHeight: 0, flex: "1 1 auto" }}>
        <div style={{ fontSize: 10.5, color: T.mut }}>
          In <b style={{ color: faction.color }}>{faction.name}</b>
        </div>
        <div>
          <div style={lbl}>Name</div>
          <input style={{ ...inputStyle, marginTop: 4 }} value={member.name} disabled={!canEdit}
            onChange={(e) => patchMember(faction.id, member.id, { name: e.target.value })} />
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <div style={{ flex: 1 }}>
            <div style={lbl}>Type</div>
            <select style={{ ...selStyle, marginTop: 4 }} value={member.kind} disabled={!canEdit}
              onChange={(e) => patchMember(faction.id, member.id, { kind: e.target.value })}>
              {MEMBER_KINDS.map((k) => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </div>
          <div style={{ flex: 1.4 }}>
            <div style={lbl}>Role / title</div>
            <input style={{ ...inputStyle, marginTop: 4 }} value={member.role || ""} disabled={!canEdit}
              placeholder="e.g. Fleet Admiral" onChange={(e) => patchMember(faction.id, member.id, { role: e.target.value })} />
          </div>
        </div>
        <CodexLink wiki={wiki} value={member.wikiId} canEdit={canEdit}
          onChange={(id) => patchMember(faction.id, member.id, { wikiId: id })}
          onNavigate={goToCodex} onCreate={createEntry}
          createTitle={member.name} createCategory={Km.defaultCat} />
        {canEdit && (
          <Btn kind="danger" onClick={() => removeMember(faction.id, member.id)} style={{ width: "100%", justifyContent: "center" }}>
            <Trash2 size={14} /> Remove {Km.label.toLowerCase()}
          </Btn>
        )}
      </div>
    </div>
  );
}
