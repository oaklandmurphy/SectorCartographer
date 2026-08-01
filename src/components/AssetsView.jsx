import { useEffect, useRef, useState } from "react";
import { ChevronDown, GripVertical, Lock, Minus, Package, Plus, Send, Trash2, Users } from "lucide-react";
import { T, F, inputStyle } from "../theme.js";
import { GM_RECIPIENT } from "../constants.js";
import { useConfirm } from "../hooks/useConfirm.jsx";
import Btn from "./ui/Btn.jsx";
import MobileTabRail from "./ui/MobileTabRail.jsx";

const LEVELS = [
  { id: "low", label: "Low", color: T.accent },
  { id: "moderate", label: "Moderate", color: T.amber },
  { id: "high", label: "High", color: "#c2551f" },
  { id: "critical", label: "Critical", color: T.danger },
];

// Three collapsible sections per faction, stacked top to bottom: "Resources"
// (integer counters), "Trackers" (a 4-position severity gauge — the old
// slider-kind modifier, split out from the freeform notes), and "Modifiers"
// (freeform text notes). Which factions show up here is decided by the
// caller (App.jsx) from the viewer's identity — see displayModifierFactions
// there. `subtab` is a deep-link target (e.g. from a dashboard notification
// via goToAssets) that expands and scrolls to one section on arrival; it's
// not an exclusive "active tab" anymore since all three can be open at once.
const SECTIONS = [
  { id: "resources", label: "Resources" },
  { id: "trackers", label: "Trackers" },
  { id: "modifiers", label: "Modifiers" },
];

export default function AssetsView({ factions, allFactions, modifiers, resources, canEdit, isMobile, viewerFactionId,
  activeFactionId, setActiveFactionId, subtab,
  addModifier, patchModifier, removeModifier, reorderModifiers,
  addResource, patchResource, removeResource, sendResource }) {
  const confirm = useConfirm();
  const activeId = factions.some((f) => f.id === activeFactionId)
    ? activeFactionId : (factions[0] && factions[0].id) || null;
  const activeFaction = factions.find((f) => f.id === activeId) || null;

  const entries = activeId ? modifiers.filter((m) => m.factionId === activeId) : [];
  const modifierEntries = entries.filter((m) => (m.kind || "text") !== "slider");
  const trackerEntries = entries.filter((m) => (m.kind || "text") === "slider");
  const resourceEntries = activeId ? resources.filter((r) => r.factionId === activeId) : [];
  // Who a resource can be sent to: any other faction/player in the sector —
  // not just allies/vassals visible on this tab — plus the GM as a standing
  // option (for a tribute/cost with no faction recipient). `allFactions` is
  // the unfiltered list App.jsx holds; `factions` above stays visibility-
  // filtered, since it also drives which faction's Assets you're looking at.
  const sendTargets = activeId ? (allFactions || factions).filter((f) => f.id !== activeId) : [];
  // A resource can be sent by the GM (on behalf of anyone) or by the player
  // who owns the faction it belongs to — unlike name/value/description
  // edits, which stay GM-only.
  const canSend = canEdit || (!!viewerFactionId && viewerFactionId === activeId);

  const selectFaction = (id) => setActiveFactionId(id);

  // All three sections start open; collapsing one is a per-view UI
  // convenience, not something worth persisting.
  const [collapsed, setCollapsed] = useState({});
  const toggleSection = (id) => setCollapsed((c) => ({ ...c, [id]: !c[id] }));

  // Deep-linking (e.g. a dashboard notification's "New resource" or "New
  // tracker" link, via App.jsx's goToAssets) lands here with `subtab` set —
  // make sure that section is open and scroll it into view.
  const sectionRefs = useRef({});
  useEffect(() => {
    if (!subtab) return;
    setCollapsed((c) => (c[subtab] ? { ...c, [subtab]: false } : c));
    const el = sectionRefs.current[subtab];
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [subtab, activeId]);

  // The "Send To" panel: only one resource's panel is open at a time, so a
  // single form (recipient + amount + purpose) covers whichever one that is.
  const [sendOpenId, setSendOpenId] = useState(null);
  const [sendForm, setSendForm] = useState({ toFactionId: "", amount: 1, message: "" });
  const toggleSend = (id) => {
    setSendOpenId((cur) => (cur === id ? null : id));
    setSendForm({ toFactionId: "", amount: 1, message: "" });
  };
  const confirmSend = (r) => {
    const amount = Math.trunc(Number(sendForm.amount));
    if (!sendForm.toFactionId || !amount || amount <= 0) return;
    sendResource(r.id, sendForm.toFactionId, amount, sendForm.message);
    setSendOpenId(null);
  };

  // Drag-to-reorder within a section's list. Dropping a card onto another
  // one moves it to that position, then hands the whole list's new order up
  // to the caller to splice back into the master array.
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
        const count = modifiers.filter((m) => m.factionId === f.id).length
          + resources.filter((r) => r.factionId === f.id).length;
        return (
          <button key={f.id} onClick={() => selectFaction(f.id)} title={f.name}
            style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", whiteSpace: "nowrap",
              border: `1px solid ${on ? f.color : T.line}`, borderRadius: 2, padding: "7px 10px",
              background: on ? `${f.color}26` : T.panel2, color: on ? f.color : T.text,
              fontFamily: F.body, fontSize: 12.5, fontWeight: 600, letterSpacing: ".03em",
              textTransform: "uppercase", justifyContent: vertical ? "flex-start" : "center", flex: vertical ? "none" : "0 0 auto" }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: f.color, flexShrink: 0 }} />
            <span style={{ flex: 1, textAlign: "left" }}>{f.name}</span>
            <span className="mono" style={{ fontSize: 10, color: on ? f.color : T.faint }}>{count}</span>
          </button>
        );
      })}
    </div>
  );

  const renderCard = (m, list, { tracker, packed } = {}) => {
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
              placeholder={tracker ? "TRACKER NAME…" : "MODIFIER NAME…"}
              style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", borderRadius: 0,
                padding: "9px 10px", outline: "none",
                fontSize: 15, fontWeight: 800, fontFamily: F.body, letterSpacing: ".07em",
                textTransform: "uppercase", color: activeFaction.color }} />
          ) : (
            <div style={{ flex: 1, minWidth: 0, padding: "9px 10px",
              fontSize: 15, fontWeight: 800, fontFamily: F.body,
              letterSpacing: ".07em", textTransform: "uppercase", color: activeFaction.color }}>
              {m.name || (tracker ? "Untitled tracker" : "Untitled modifier")}
            </div>
          )}
        </div>
        {tracker && (
          <div style={{ display: "flex", gap: 4 }}>
            {LEVELS.map((l) => {
              const on = l.id === level.id;
              return (
                <button key={l.id} onClick={canEdit ? () => patchModifier(m.id, { level: l.id }) : undefined}
                  style={{ flex: 1, cursor: canEdit ? "pointer" : "default",
                    border: `1px solid ${on ? l.color : T.line}`,
                    borderRadius: 2, padding: "6px 4px", background: on ? `${l.color}26` : T.panel3,
                    color: on ? l.color : T.faint, opacity: on ? 1 : 0.75,
                    fontFamily: F.body, fontSize: 11,
                    fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase" }}>
                  {l.label}
                </button>
              );
            })}
          </div>
        )}
        {/* Private toggle: a private entry drops the ally/vassal grant,
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
              fontFamily: F.body, fontSize: 10.5, fontWeight: 700,
              letterSpacing: ".05em", textTransform: "uppercase" }}>
            {m.private ? <Lock size={12} /> : <Users size={12} />}
            {m.private ? "Private" : "Allies can see"}
          </button>
        ) : m.private ? (
          <div style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 6,
            border: `1px solid ${T.amber}`, borderRadius: 2, padding: "4px 8px",
            background: `${T.amber}22`, color: T.amber, fontFamily: F.body,
            fontSize: 10, fontWeight: 700, letterSpacing: ".05em", textTransform: "uppercase" }}>
            <Lock size={11} /> Private
          </div>
        ) : null}
        {canEdit ? (
          <>
            <textarea value={m.text} onChange={(e) => patchModifier(m.id, { text: e.target.value })}
              placeholder="Description…"
              style={{ ...inputStyle, minHeight: packed ? 56 : 70, resize: "vertical", lineHeight: 1.6, fontSize: 12.5, padding: 10 }} />
            <Btn kind="danger" style={{ alignSelf: "flex-start" }}
              onClick={async () => { if (await confirm(tracker ? "Remove this tracker?" : "Remove this modifier?")) removeModifier(m.id); }}>
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

  const renderResourceRow = (r) => {
    const value = r.value || 0;
    const counterBtnStyle = {
      display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
      width: 26, height: 26, border: `1px solid ${T.line}`, borderRadius: 2,
      background: T.panel3, color: T.text, flexShrink: 0,
    };
    return (
      <div key={r.id} style={{ border: `1px solid ${T.line}`, borderRadius: 2, background: T.panel2,
        padding: 10, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "-10px -10px 0", padding: "6px 10px",
          background: `${activeFaction.color}1f`, borderBottom: `2px solid ${activeFaction.color}` }}>
          {canEdit ? (
            <input value={r.name} onChange={(e) => patchResource(r.id, { name: e.target.value })}
              placeholder="RESOURCE NAME…"
              style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", outline: "none",
                fontSize: 14, fontWeight: 800, fontFamily: F.body, letterSpacing: ".05em",
                textTransform: "uppercase", color: activeFaction.color }} />
          ) : (
            <div style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 800, fontFamily: F.body,
              letterSpacing: ".05em", textTransform: "uppercase", color: activeFaction.color }}>
              {r.name || "Untitled resource"}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {canEdit && (
              <button onClick={() => patchResource(r.id, { value: value - 1 })} title="Decrease" style={counterBtnStyle}>
                <Minus size={13} />
              </button>
            )}
            {canEdit ? (
              <input type="number" value={value}
                onChange={(e) => patchResource(r.id, { value: Math.trunc(Number(e.target.value)) || 0 })}
                style={{ ...inputStyle, width: 64, textAlign: "center", padding: "5px 4px",
                  fontWeight: 800, fontSize: 15 }} />
            ) : (
              <div className="mono" style={{ minWidth: 46, textAlign: "center", fontSize: 18, fontWeight: 800, color: T.text }}>
                {value}
              </div>
            )}
            {canEdit && (
              <button onClick={() => patchResource(r.id, { value: value + 1 })} title="Increase" style={counterBtnStyle}>
                <Plus size={13} />
              </button>
            )}
          </div>
          {canSend && (
            <Btn active={sendOpenId === r.id} onClick={() => toggleSend(r.id)} title="Send some of this to another player, or to the GM">
              <Send size={13} /> Send To
            </Btn>
          )}
          {canEdit && (
            <Btn kind="danger"
              onClick={async () => { if (await confirm("Remove this resource?")) removeResource(r.id); }}>
              <Trash2 size={13} />
            </Btn>
          )}
        </div>
        {/* What this resource is for/spent on — players see it read-only so a
            counter isn't just a bare number with no context. */}
        {canEdit ? (
          <textarea value={r.text || ""} onChange={(e) => patchResource(r.id, { text: e.target.value })}
            placeholder="What is this spent on / used for…"
            style={{ ...inputStyle, minHeight: 44, resize: "vertical", lineHeight: 1.5, fontSize: 12, padding: 8 }} />
        ) : r.text ? (
          <div style={{ fontSize: 12, lineHeight: 1.5, color: T.mut, whiteSpace: "pre-wrap" }}>
            {r.text}
          </div>
        ) : null}
        {sendOpenId === r.id && (
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8,
            padding: 8, border: `1px dashed ${T.line}`, borderRadius: 2, background: T.panel3 }}>
            <select value={sendForm.toFactionId} onChange={(e) => setSendForm((f) => ({ ...f, toFactionId: e.target.value }))}
              style={{ ...inputStyle, flex: "1 1 140px", padding: "6px 8px" }}>
              <option value="">Send to…</option>
              <option value={GM_RECIPIENT}>GM</option>
              {sendTargets.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <input type="number" min={1} max={value} value={sendForm.amount}
              onChange={(e) => setSendForm((f) => ({ ...f, amount: e.target.value }))}
              style={{ ...inputStyle, width: 64, textAlign: "center", padding: "6px 4px" }} />
            <input value={sendForm.message} onChange={(e) => setSendForm((f) => ({ ...f, message: e.target.value }))}
              placeholder="Purpose of this transfer…"
              style={{ ...inputStyle, flex: "1 1 100%", padding: "6px 8px" }} />
            <Btn kind="primary" disabled={!sendForm.toFactionId || !sendForm.amount} onClick={() => confirmSend(r)}>
              <Send size={13} /> Confirm
            </Btn>
          </div>
        )}
      </div>
    );
  };

  // A collapsible section shell shared by all three views: a clickable
  // header bar (label + count + chevron) and, while expanded, whatever body
  // the caller renders.
  const section = (id, label, count, body) => (
    <div key={id} ref={(el) => { sectionRefs.current[id] = el; }}
      style={{ borderBottom: `2px solid ${T.line}`, flexShrink: 0 }}>
      <button onClick={() => toggleSection(id)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
          border: "none", background: T.panel3, padding: isMobile ? "10px 14px" : "10px 22px",
          fontFamily: F.body, fontSize: 13, fontWeight: 700, letterSpacing: ".06em",
          textTransform: "uppercase", color: T.text }}>
        <ChevronDown size={15} style={{ transition: "transform .15s",
          transform: collapsed[id] ? "rotate(-90deg)" : "none", color: T.faint, flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: "left" }}>{label}</span>
        <span className="mono" style={{ fontSize: 11, color: T.faint }}>{count}</span>
      </button>
      {!collapsed[id] && (
        <div style={{ padding: isMobile ? 14 : 22, display: "flex", flexDirection: "column", gap: 10 }}>
          {body}
        </div>
      )}
    </div>
  );

  const resourcesSection = () => section("resources", "Resources", resourceEntries.length, (
    <>
      {resourceEntries.length === 0 && (
        <div style={{ fontSize: 11.5, color: T.faint, padding: "16px 8px", textAlign: "center",
          border: `1px dashed ${T.line}`, lineHeight: 1.6 }}>
          No resources tracked for this faction yet.{canEdit ? " Add one below." : ""}
        </div>
      )}
      {resourceEntries.map(renderResourceRow)}
      {canEdit && (
        <Btn kind="primary" onClick={() => addResource(activeFaction.id)} style={{ justifyContent: "center" }}>
          <Plus size={14} /> New resource
        </Btn>
      )}
    </>
  ));

  const trackersSection = () => section("trackers", "Trackers", trackerEntries.length, (
    <>
      {trackerEntries.length === 0 && (
        <div style={{ fontSize: 11.5, color: T.faint, padding: "16px 8px", textAlign: "center",
          border: `1px dashed ${T.line}`, lineHeight: 1.6 }}>
          No trackers recorded for this faction yet.{canEdit ? " Add one below." : ""}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {trackerEntries.map((m) => renderCard(m, trackerEntries, { tracker: true }))}
      </div>
      {canEdit && (
        <Btn kind="primary" onClick={() => addModifier(activeFaction.id, "slider")} style={{ justifyContent: "center" }}>
          <Plus size={14} /> New tracker
        </Btn>
      )}
    </>
  ));

  const modifiersSection = () => section("modifiers", "Modifiers", modifierEntries.length, (
    <>
      {modifierEntries.length === 0 && (
        <div style={{ fontSize: 11.5, color: T.faint, padding: "16px 8px", textAlign: "center",
          border: `1px dashed ${T.line}`, lineHeight: 1.6 }}>
          No modifiers recorded for this faction yet.{canEdit ? " Add one below." : ""}
        </div>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {modifierEntries.map((m) => renderCard(m, modifierEntries, { packed: true }))}
      </div>
      {canEdit && (
        <Btn kind="primary" onClick={() => addModifier(activeFaction.id, "text")} style={{ justifyContent: "center" }}>
          <Plus size={14} /> New modifier
        </Btn>
      )}
    </>
  ));

  const content = () => {
    if (!activeFaction) {
      return (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 12, color: T.faint, padding: 24, textAlign: "center" }}>
          <Package size={40} strokeWidth={1.2} />
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
      <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", display: "flex", flexDirection: "column" }}>
        {resourcesSection()}
        {trackersSection()}
        {modifiersSection()}
      </div>
    );
  };

  if (isMobile) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: T.void }}>
        <MobileTabRail label={activeFaction ? activeFaction.name : "Select faction"} accentColor={activeFaction && activeFaction.color}>
          {factionRail(true)}
        </MobileTabRail>
        {content()}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: T.void }}>
      <div style={{ flex: 1, minHeight: 0, display: "flex" }}>
        <div style={{ width: 240, flexShrink: 0, borderRight: `2px solid ${T.line}`, background: T.panel,
          display: "flex", flexDirection: "column", minHeight: 0 }}>
          {factionRail(true)}
        </div>
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
          {content()}
        </div>
      </div>
    </div>
  );
}
