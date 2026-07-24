import { useState } from "react";
import { GripVertical, Lock, Plus, Trash2, Users, Zap } from "lucide-react";
import { T, inputStyle } from "../theme.js";
import Btn from "./ui/Btn.jsx";

const LEVELS = [
  { id: "low", label: "Low", color: T.accent },
  { id: "moderate", label: "Moderate", color: T.amber },
  { id: "high", label: "High", color: "#c2551f" },
  { id: "critical", label: "Critical", color: T.danger },
];

// A subtab per faction, each holding freeform text snippets ("modifiers") that
// describe events affecting that faction. Which factions show up here is
// decided by the caller (App.jsx) from the viewer's identity — the GM sees
// every faction, a player sees their own plus any allied/vassal to it, and
// nothing is shown to a viewer with no faction — so this component just
// renders whatever faction list it's handed, same as WikiView renders
// whatever wiki entries it's handed.
export default function ModifiersView({ factions, modifiers, canEdit, isMobile,
  activeFactionId, setActiveFactionId, addModifier, patchModifier, removeModifier, reorderModifiers }) {
  const activeId = factions.some((f) => f.id === activeFactionId)
    ? activeFactionId : (factions[0] && factions[0].id) || null;
  const activeFaction = factions.find((f) => f.id === activeId) || null;
  const entries = activeId ? modifiers.filter((m) => m.factionId === activeId) : [];
  const sliderEntries = entries.filter((m) => (m.kind || "text") === "slider");
  const textEntries = entries.filter((m) => (m.kind || "text") !== "slider");

  const selectFaction = (id) => setActiveFactionId(id);

  // Drag-to-reorder: a card is only reorderable against others of the same
  // kind (sliders vs. the rest), since those render as separate groups.
  // Dropping a card onto another one moves it to that position within its
  // own group's id list, then hands the whole group's new order up to the
  // caller to splice back into the master array.
  const [dragId, setDragId] = useState(null);
  const dropOn = (list, targetId) => {
    if (!dragId || dragId === targetId) return;
    const ids = list.map((m) => m.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from === -1 || to === -1) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    reorderModifiers(ids);
    setDragId(null);
  };
  // Split in two: the grip icon is the actual drag source (draggable lives
  // there, not on the card), so clicking/dragging inside the name input to
  // place a cursor or select text isn't hijacked as a card drag. The card
  // itself only needs to be a drop target.
  const dragHandleProps = (id) => canEdit ? {
    draggable: true,
    onDragStart: (e) => { e.stopPropagation(); setDragId(id); },
    onDragEnd: () => setDragId(null),
  } : {};
  const dropTargetProps = (list, id) => canEdit ? {
    onDragOver: (e) => e.preventDefault(),
    onDrop: () => dropOn(list, id),
  } : {};

  const factionRail = (vertical) => (
    <div className={vertical ? "" : "scroll"} style={{ display: "flex", flexDirection: vertical ? "column" : "row",
      gap: 4, padding: vertical ? "10px 8px" : "8px", overflowX: vertical ? "visible" : "auto",
      borderBottom: vertical ? `1px solid ${T.line}` : `2px solid ${T.line}`, flexShrink: 0 }}>
      {factions.map((f) => {
        const on = f.id === activeId;
        const count = modifiers.filter((m) => m.factionId === f.id).length;
        return (
          <button key={f.id} onClick={() => selectFaction(f.id)} title={f.name}
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

  const renderCard = (m, list, { packed } = {}) => {
    const kind = m.kind || "text";
    const level = LEVELS.find((l) => l.id === m.level) || LEVELS[0];
    const dragging = dragId === m.id;
    return (
      <div key={m.id} {...dropTargetProps(list, m.id)}
        style={{ border: `1px solid ${T.line}`, borderRadius: 2, background: T.panel2, padding: 10,
          display: "flex", flexDirection: "column", gap: 6, opacity: dragging ? 0.4 : 1,
          ...(packed ? { flex: `0 1 ${isMobile ? "100%" : "380px"}`, maxWidth: isMobile ? "100%" : 440 } : {}) }}>
        <div style={{ display: "flex", alignItems: "stretch", margin: "-10px -10px 0",
          background: `${activeFaction.color}1f`, borderBottom: `2px solid ${activeFaction.color}` }}>
          {canEdit && (
            <span {...dragHandleProps(m.id)} title="Drag to reorder"
              style={{ display: "flex", alignItems: "center", padding: "0 4px 0 8px",
                cursor: "grab", color: activeFaction.color, opacity: 0.7 }}>
              <GripVertical size={14} />
            </span>
          )}
          {canEdit ? (
            <input value={m.name} onChange={(e) => patchModifier(m.id, { name: e.target.value })}
              placeholder="MODIFIER NAME…"
              style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", borderRadius: 0,
                padding: "9px 10px", outline: "none",
                fontSize: 15, fontWeight: 800, fontFamily: "'Oswald', sans-serif", letterSpacing: ".07em",
                textTransform: "uppercase", color: activeFaction.color }} />
          ) : (
            <div style={{ flex: 1, minWidth: 0, padding: "9px 10px",
              fontSize: 15, fontWeight: 800, fontFamily: "'Oswald', sans-serif",
              letterSpacing: ".07em", textTransform: "uppercase", color: activeFaction.color }}>
              {m.name || "Untitled modifier"}
            </div>
          )}
        </div>
        {kind === "slider" && (
          <div style={{ display: "flex", gap: 4 }}>
            {LEVELS.map((l) => {
              const on = l.id === level.id;
              return (
                <button key={l.id} onClick={canEdit ? () => patchModifier(m.id, { level: l.id }) : undefined}
                  style={{ flex: 1, cursor: canEdit ? "pointer" : "default",
                    border: `1px solid ${on ? l.color : T.line}`,
                    borderRadius: 2, padding: "6px 4px", background: on ? `${l.color}26` : T.panel3,
                    color: on ? l.color : T.faint, opacity: on ? 1 : 0.75,
                    fontFamily: "'Oswald', sans-serif", fontSize: 11,
                    fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" }}>
                  {l.label}
                </button>
              );
            })}
          </div>
        )}
        {/* Private toggle: a private modifier drops the ally/vassal grant,
            so only this faction (and the GM) can see it. The GM toggles it;
            the owning faction just sees the badge. */}
        {canEdit ? (
          <button onClick={() => patchModifier(m.id, { private: !m.private })}
            title={m.private
              ? "Private — only this faction can see it. Click to also share with its allies/vassals."
              : "Visible to this faction and its allies/vassals. Click to make it private."}
            style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6, cursor: "pointer",
              border: `1px solid ${m.private ? T.amber : T.line}`, borderRadius: 2, padding: "5px 9px",
              background: m.private ? `${T.amber}22` : T.panel3, color: m.private ? T.amber : T.faint,
              fontFamily: "'Oswald', sans-serif", fontSize: 10.5, fontWeight: 700,
              letterSpacing: ".05em", textTransform: "uppercase" }}>
            {m.private ? <Lock size={12} /> : <Users size={12} />}
            {m.private ? "Private" : "Allies can see"}
          </button>
        ) : m.private ? (
          <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6,
            border: `1px solid ${T.amber}`, borderRadius: 2, padding: "4px 8px",
            background: `${T.amber}22`, color: T.amber, fontFamily: "'Oswald', sans-serif",
            fontSize: 10, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" }}>
            <Lock size={11} /> Private
          </div>
        ) : null}
        {canEdit ? (
          <>
            <textarea value={m.text} onChange={(e) => patchModifier(m.id, { text: e.target.value })}
              placeholder="Description…"
              style={{ ...inputStyle, minHeight: packed ? 56 : 70, resize: "vertical", lineHeight: 1.6, fontSize: 12.5, padding: 10 }} />
            <Btn kind="danger" onClick={() => removeModifier(m.id)} style={{ alignSelf: "flex-start" }}>
              <Trash2 size={13} /> Remove
            </Btn>
          </>
        ) : (
          <div style={{ fontSize: 12.5, lineHeight: 1.6, color: T.text, whiteSpace: "pre-wrap" }}>
            {m.text || "—"}
          </div>
        )}
      </div>
    );
  };

  const sectionLabel = (text) => (
    <div className="stencil" style={{ fontSize: 10.5, letterSpacing: ".08em", color: T.faint, marginTop: 2 }}>
      {text}
    </div>
  );

  const content = () => {
    if (!activeFaction) {
      return (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 12, color: T.faint, padding: 24, textAlign: "center" }}>
          <Zap size={40} strokeWidth={1.2} />
          <div className="stencil" style={{ fontSize: 15, letterSpacing: ".06em", color: T.mut }}>NO FACTION VISIBLE</div>
          <div style={{ fontSize: 11.5, lineHeight: 1.6, maxWidth: 300 }}>
            {canEdit
              ? "Add a faction on the map or politics tab first."
              : "You have no faction assigned, or none is visible to you yet."}
          </div>
        </div>
      );
    }
    return (
      <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: isMobile ? 14 : 22,
        display: "flex", flexDirection: "column", gap: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 11, height: 11, borderRadius: "50%", background: activeFaction.color, flexShrink: 0 }} />
          <div className="stencil" style={{ fontSize: 20, fontWeight: 800, letterSpacing: ".03em", color: T.text }}>
            {activeFaction.name}
          </div>
        </div>
        {entries.length === 0 && (
          <div style={{ fontSize: 11.5, color: T.faint, padding: "16px 8px", textAlign: "center",
            border: `1px dashed ${T.line}`, lineHeight: 1.6 }}>
            No modifiers recorded for this faction yet.{canEdit ? " Add one below." : ""}
          </div>
        )}
        {sliderEntries.length > 0 && (
          <>
            {textEntries.length > 0 && sectionLabel("SLIDERS")}
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sliderEntries.map((m) => renderCard(m, sliderEntries))}
            </div>
          </>
        )}
        {textEntries.length > 0 && (
          <>
            {sliderEntries.length > 0 && sectionLabel("NOTES")}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {textEntries.map((m) => renderCard(m, textEntries, { packed: true }))}
            </div>
          </>
        )}
        {canEdit && (
          <div style={{ display: "flex", gap: 8, marginTop: 2 }}>
            <Btn kind="primary" onClick={() => addModifier(activeFaction.id, "text")} style={{ flex: 1, justifyContent: "center" }}>
              <Plus size={14} /> New text modifier
            </Btn>
            <Btn kind="primary" onClick={() => addModifier(activeFaction.id, "slider")} style={{ flex: 1, justifyContent: "center" }}>
              <Plus size={14} /> New slider modifier
            </Btn>
          </div>
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
