import { Plus, Trash2, Zap } from "lucide-react";
import { T, inputStyle } from "../theme.js";
import Btn from "./ui/Btn.jsx";

// A subtab per faction, each holding freeform text snippets ("modifiers") that
// describe events affecting that faction. Which factions show up here is
// decided by the caller (App.jsx) from the viewer's identity — the GM sees
// every faction, a player sees their own plus any allied/vassal to it, and
// nothing is shown to a viewer with no faction — so this component just
// renders whatever faction list it's handed, same as WikiView renders
// whatever wiki entries it's handed.
export default function ModifiersView({ factions, modifiers, canEdit, isMobile,
  activeFactionId, setActiveFactionId, addModifier, patchModifier, removeModifier }) {
  const activeId = factions.some((f) => f.id === activeFactionId)
    ? activeFactionId : (factions[0] && factions[0].id) || null;
  const activeFaction = factions.find((f) => f.id === activeId) || null;
  const entries = activeId ? modifiers.filter((m) => m.factionId === activeId) : [];

  const selectFaction = (id) => setActiveFactionId(id);

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
        display: "flex", flexDirection: "column", gap: 12 }}>
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
        {entries.map((m) => (
          <div key={m.id} style={{ border: `1px solid ${T.line}`, borderRadius: 2, background: T.panel2, padding: 10,
            display: "flex", flexDirection: "column", gap: 6 }}>
            {canEdit ? (
              <>
                <textarea value={m.text} onChange={(e) => patchModifier(m.id, { text: e.target.value })}
                  placeholder="Describe the event and its effect on this faction…"
                  style={{ ...inputStyle, minHeight: 70, resize: "vertical", lineHeight: 1.6, fontSize: 12.5, padding: 10 }} />
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
        ))}
        {canEdit && (
          <Btn kind="primary" onClick={() => addModifier(activeFaction.id)} style={{ justifyContent: "center", marginTop: 2 }}>
            <Plus size={14} /> New modifier
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
