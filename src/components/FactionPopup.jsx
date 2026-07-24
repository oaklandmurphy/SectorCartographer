import { useState } from "react";
import { Users, Trash2, Plus, X, Share2, ChevronRight, Star } from "lucide-react";
import { T, inputStyle, selStyle, lbl } from "../theme.js";
import { RELATION_TYPES, MEMBER_KINDS, relationType } from "../constants.js";
import Btn from "./ui/Btn.jsx";
import PanelPopup from "./ui/PanelPopup.jsx";
import CodexLink from "./CodexLink.jsx";

const kindMeta = (id) => MEMBER_KINDS.find((k) => k.id === id) || MEMBER_KINDS[0];

export default function FactionPopup({
  faction, factions, relations, pos, containerHeight, canEdit, wiki, viewer,
  patchFaction, deleteFaction, setRelation,
  addMember, patchMember, patchMemberTitle, removeMember,
  goToCodex, createEntry, onClose,
}) {
  const canEditTitle = canEdit || (viewer && viewer.kind === "player" && viewer.roleFactionId === faction.id);
  const others = factions.filter((f) => f.id !== faction.id);
  const relOf = (otherId) => {
    const r = relations.find((x) => (x.a === faction.id && x.b === otherId) || (x.a === otherId && x.b === faction.id));
    return r ? r.type : "";
  };
  const members = faction.members || [];
  const relCount = others.reduce((n, o) => (relOf(o.id) ? n + 1 : n), 0);

  // Sections start collapsed and expand on click; the popup grew with the roster
  // and ran off the edge of small screens otherwise.
  const [open, setOpen] = useState({ rel: false, mem: false });
  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  // A collapsible section: header toggles it; open, the body is a fixed-height
  // scrolling box so a long list can't push the popup off-screen, with an
  // optional footer (e.g. Add buttons) pinned below. A called function, not a
  // mounted <Component>, so its inputs keep focus across the parent's re-renders.
  const section = (key, title, count, body, footer = null) => (
    <div style={{ border: `1px solid ${T.line}`, borderRadius: 2 }}>
      <button type="button" onClick={() => toggle(key)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 6, background: T.panel2,
          border: "none", cursor: "pointer", padding: "8px 8px" }}>
        <ChevronRight size={13} style={{ color: T.faint, flexShrink: 0,
          transform: open[key] ? "rotate(90deg)" : "none", transition: "transform .12s" }} />
        <span style={{ ...lbl, flex: 1, textAlign: "left" }}>{title}</span>
        <span className="mono" style={{ fontSize: 10, color: T.faint }}>{count}</span>
      </button>
      {open[key] && (
        <>
          <div className="scroll" style={{ maxHeight: 210, overflowY: "auto", padding: 8,
            borderTop: `1px solid ${T.line}` }}>
            {body}
          </div>
          {footer && <div style={{ padding: 8, borderTop: `1px solid ${T.line}` }}>{footer}</div>}
        </>
      )}
    </div>
  );

  return (
    <PanelPopup frame={{ left: pos.x, top: pos.y, width: 320 }} maxHeight={containerHeight - 20}
      color={faction.color} icon={<Users size={13} />} title="FACTION" onClose={onClose}>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
          <div style={{ flex: 1 }}>
            <div style={lbl}>Name</div>
            <input style={{ ...inputStyle, marginTop: 4 }} value={faction.name} disabled={!canEdit}
              onChange={(e) => patchFaction(faction.id, { name: e.target.value })} />
          </div>
          <label style={{ position: "relative", width: 34, height: 30, flexShrink: 0, cursor: canEdit ? "pointer" : "default" }} title="Faction color">
            <span style={{ display: "block", width: "100%", height: "100%", borderRadius: 2, background: faction.color,
              border: `1px solid ${T.line}`, boxShadow: "inset 0 1px 2px rgba(255,255,255,.2), inset 0 -2px 3px rgba(0,0,0,.5)" }} />
            <input type="color" value={faction.color} disabled={!canEdit}
              onChange={(e) => patchFaction(faction.id, { color: e.target.value })}
              style={{ position: "absolute", inset: 0, opacity: 0, cursor: canEdit ? "pointer" : "default" }} />
          </label>
        </div>

        <CodexLink wiki={wiki} value={faction.wikiId} canEdit={canEdit}
          onChange={(id) => patchFaction(faction.id, { wikiId: id })}
          onNavigate={goToCodex} onCreate={createEntry}
          createTitle={faction.name} createCategory="factions" />

        {/* relationships to other factions */}
        {section("rel",
          <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Share2 size={12} /> Relationships</span>,
          `${relCount}/${others.length}`,
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {others.map((o) => {
              const cur = relOf(o.id);
              const meta = cur ? relationType(cur) : null;
              return (
                <div key={o.id} style={{ display: "flex", gap: 6, alignItems: "center",
                  background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 2, padding: "4px 6px" }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: o.color, flexShrink: 0, border: "1px solid #14110b" }} />
                  <span style={{ flex: 1, minWidth: 0, fontSize: 11.5, color: T.text, overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.name}</span>
                  {canEdit ? (
                    <select value={cur} onChange={(e) => setRelation(faction.id, o.id, e.target.value || "none")}
                      style={{ ...selStyle, width: 116, padding: "3px 4px",
                        color: meta ? meta.color : T.faint, borderColor: meta ? meta.color : T.line }}>
                      <option value="">— none —</option>
                      {RELATION_TYPES.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  ) : (
                    <span className="mono" style={{ fontSize: 10, letterSpacing: ".06em", textTransform: "uppercase",
                      color: meta ? meta.color : T.faint }}>{meta ? meta.label : "—"}</span>
                  )}
                </div>
              );
            })}
            {others.length === 0 && (
              <div style={{ fontSize: 11, color: T.faint, padding: "8px 6px", textAlign: "center", border: `1px dashed ${T.line}` }}>
                No other factions to relate to yet.
              </div>
            )}
          </div>
        )}

        {/* characters */}
        {section("mem", "Characters", members.length,
          <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
            {members.length === 0 && (
              <div style={{ fontSize: 11, color: T.faint, padding: "10px 6px", textAlign: "center", border: `1px dashed ${T.line}` }}>
                No characters yet.{canEdit ? " Add one below." : ""}
              </div>
            )}
            {members.map((m) => {
              const Km = kindMeta(m.kind); const Ic = Km.icon;
              return (
                <div key={m.id} style={{ display: "flex", flexDirection: "column", gap: 5,
                  background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 2, padding: 6 }}>
                  <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                    <div style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 2, display: "flex",
                      alignItems: "center", justifyContent: "center", background: "#14110b",
                      border: `1px solid ${faction.color}`, color: faction.color }}>
                      <Ic size={13} />
                    </div>
                    <input value={m.name} disabled={!canEdit} onChange={(e) => patchMember(faction.id, m.id, { name: e.target.value })}
                      style={{ ...inputStyle, padding: "3px 6px", flex: 1 }} />
                    <button onClick={() => canEdit && patchMember(faction.id, m.id, { star: !m.star })} disabled={!canEdit}
                      title={m.star ? "Important — shown as a portrait" : "Mark important (portrait)"}
                      style={{ background: "none", border: "none", cursor: canEdit ? "pointer" : "default", padding: 2,
                        color: m.star ? T.amber : T.faint }}>
                      <Star size={14} style={{ fill: m.star ? T.amber : "none" }} />
                    </button>
                    {canEdit && (
                      <button onClick={() => removeMember(faction.id, m.id)} title="Remove"
                        style={{ background: "none", border: "none", color: T.danger, cursor: "pointer", padding: 2 }}>
                        <X size={14} />
                      </button>
                    )}
                  </div>
                  {(canEditTitle || m.role) && (
                    <input value={m.role || ""} disabled={!canEditTitle} placeholder="Role / title"
                      onChange={(e) => patchMemberTitle(faction.id, m.id, e.target.value)}
                      style={{ ...inputStyle, padding: "3px 6px", fontSize: 11 }} />
                  )}
                  <CodexLink wiki={wiki} value={m.wikiId} canEdit={canEdit}
                    onChange={(id) => patchMember(faction.id, m.id, { wikiId: id })}
                    onNavigate={goToCodex} onCreate={createEntry}
                    createTitle={m.name} createCategory={Km.defaultCat} />
                </div>
              );
            })}
          </div>,
          canEdit && (
            <Btn kind="primary" onClick={() => addMember(faction.id)} style={{ width: "100%", justifyContent: "center" }}>
              <Plus size={13} /> Add character
            </Btn>
          )
        )}

        {canEdit && (
          <Btn kind="danger" onClick={() => deleteFaction(faction.id)} disabled={factions.length <= 1}
            style={{ width: "100%", justifyContent: "center" }}>
            <Trash2 size={14} /> Delete faction
          </Btn>
        )}
    </PanelPopup>
  );
}
