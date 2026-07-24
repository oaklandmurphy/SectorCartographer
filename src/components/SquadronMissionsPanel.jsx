import { useMemo, useRef, useState } from "react";
import { Rocket, Trash2, Dices, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6,
  Users, Check, Clock, Wand2, Ship } from "lucide-react";
import { T, inputStyle, selStyle, lbl, cut } from "../theme.js";
import {
  RATIO_COLS, EVEN_RATIO_INDEX, MIN_SHIFT, MAX_SHIFT,
  successGrade, casualtyPct, rollTwoD6, nearestRatioIndex, isBeyondTable,
} from "../lib/missionOdds.js";
import Btn from "./ui/Btn.jsx";
import MissionResolution from "./ui/MissionResolution.jsx";

const rollDie = () => 1 + Math.floor(Math.random() * 6);
const DIE_FACES = { 1: Dice1, 2: Dice2, 3: Dice3, 4: Dice4, 5: Dice5, 6: Dice6 };
const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
const clampInt = (v, lo, hi) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
};
const detachmentSummary = (m) => (m.detachments || [])
  .map((d) => `${d.count}×${d.model || "unnamed"}`).join(", ");
const totalCraft = (m) => (m.detachments || []).reduce((n, d) => n + (Number(d.count) || 0), 0);

// GM's squadron-mission workbench: the queue of fighters/bombers players have
// committed to a mission from the Fleet tab, split per player like the agent
// action queue, plus a resolution tool that runs the mission odds table
// (lib/missionOdds.js) instead of a free success/failure call. Resolving a
// mission is one step — it computes the outcome grade and casualty percentage
// and immediately hands the surviving craft back to their fleet (App.jsx
// resolveMission), so there is no separate "reopen" here: once craft are home,
// redoing the roll would double-count them.
export default function SquadronMissionsPanel({
  roles, factions, fleets, missions, isMobile, resolveMission, removeMission, notesPane,
}) {
  const [targetId, setTargetId] = useState("");
  const toolRef = useRef(null);

  const targetMission = targetId ? (missions || []).find((m) => m.id === targetId) : null;
  const mine = targetMission ? totalCraft(targetMission) : 0;

  const [theirsText, setTheirsText] = useState("10");
  const [ratioIdx, setRatioIdx] = useState(EVEN_RATIO_INDEX);
  const [outShiftText, setOutShiftText] = useState("0");
  const [casShiftText, setCasShiftText] = useState("0");
  const [rollText, setRollText] = useState("");
  const [dice, setDice] = useState(null);
  const [outcomeText, setOutcomeText] = useState("");

  const theirsValue = clampInt(theirsText, 0, Infinity);
  const outShiftValue = clampInt(outShiftText, MIN_SHIFT, MAX_SHIFT);
  const casShiftValue = clampInt(casShiftText, MIN_SHIFT, MAX_SHIFT);
  const rollValue = clampInt(rollText, 2, 12);
  const ratio = RATIO_COLS[ratioIdx];
  const snapped = nearestRatioIndex(mine, theirsValue);
  const beyond = isBeyondTable(mine, theirsValue);

  const outE = rollValue + ratio.shift + outShiftValue;
  const casE = rollValue + ratio.shift + casShiftValue;
  const grade = successGrade(outE);
  const cas = casualtyPct(casE);

  function onTheirsChange(e) {
    setTheirsText(e.target.value);
    const idx = nearestRatioIndex(mine, clampInt(e.target.value, 0, Infinity));
    if (idx !== null) setRatioIdx(idx);
  }
  function rollForMe() {
    const d1 = rollDie(), d2 = rollDie();
    setDice({ d1, d2 });
    setRollText(String(d1 + d2));
  }
  function clearTool() {
    setTheirsText("10"); setRatioIdx(EVEN_RATIO_INDEX); setOutShiftText("0"); setCasShiftText("0");
    setDice(null); setRollText(""); setOutcomeText("");
  }
  function startResolving(mission) {
    setTargetId(mission.id);
    clearTool();
    const idx = nearestRatioIndex(totalCraft(mission), 10);
    if (idx !== null) setRatioIdx(idx);
    requestAnimationFrame(() => toolRef.current &&
      toolRef.current.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  function resolve() {
    if (!targetMission) return;
    const resolution = {
      mine, enemyCount: theirsValue, ratioLabel: ratio.label, ratioShift: ratio.shift,
      outcomeShift: outShiftValue, casualtyShift: casShiftValue,
      roll: rollValue, dice: dice || null,
      outcomeE: outE, casualtyE: casE, grade, casualtyPct: cas,
      text: outcomeText.trim(),
    };
    resolveMission(targetMission.id, resolution);
    setTargetId(""); clearTool();
  }

  /* ------------------------------------------------ queue, split per player */
  const playerGroups = useMemo(() => {
    const map = new Map();
    for (const m of missions || []) {
      const key = (m.createdBy && m.createdBy.roleId) || "";
      if (!map.has(key)) {
        const name = (roles.find((r) => r.id === key) || {}).name
          || (m.createdBy && m.createdBy.roleName) || (key ? "Unknown player" : "GM / open");
        map.set(key, { key, name, items: [] });
      }
      map.get(key).items.push(m);
    }
    return [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [missions, roles]);

  const [playerTab, setPlayerTab] = useState(null);
  const activeKey = playerGroups.some((g) => g.key === playerTab)
    ? playerTab : (playerGroups[0] ? playerGroups[0].key : null);
  const activeGroup = playerGroups.find((g) => g.key === activeKey) || null;
  const pendingTotal = (missions || []).filter((m) => m.status !== "resolved").length;

  const { unresolved, resolved } = useMemo(() => {
    const items = activeGroup ? activeGroup.items : [];
    return {
      unresolved: items.filter((m) => m.status !== "resolved").sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
      resolved: items.filter((m) => m.status === "resolved").sort((a, b) => (b.resolvedAt || 0) - (a.resolvedAt || 0)),
    };
  }, [activeGroup]);

  const countBadge = (n, big) => (n > 0 ? (
    <span className="mono" style={{ background: T.amber, color: "#0f1207", borderRadius: big ? 8 : 7,
      minWidth: big ? 16 : 14, height: big ? 16 : 14, padding: big ? "0 5px" : "0 4px",
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      fontSize: big ? 10 : 9, fontWeight: 700 }}>{n}</span>
  ) : null);
  const sectionLabel = (text) => (
    <div className="stencil" style={{ fontSize: 11, letterSpacing: ".1em", color: T.faint, margin: "6px 0 1px" }}>
      {text}
    </div>
  );

  const renderTab = (g, vertical) => {
    const on = g.key === activeKey;
    const pending = g.items.filter((m) => m.status !== "resolved").length;
    return (
      <button key={g.key || "_gm"} onClick={() => setPlayerTab(g.key)} title={g.name}
        style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", whiteSpace: "nowrap",
          border: `1px solid ${on ? T.accent : T.line}`, borderRadius: 2, padding: "7px 10px",
          background: on ? "rgba(159,194,58,.14)" : T.panel2, color: on ? T.accent : T.text,
          fontFamily: "'Oswald', sans-serif", fontSize: 12.5, fontWeight: 600, letterSpacing: ".03em",
          textTransform: "uppercase", justifyContent: vertical ? "flex-start" : "center",
          flex: vertical ? "none" : "0 0 auto", width: vertical ? "100%" : "auto" }}>
        <Users size={13} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: "left", overflow: "hidden", textOverflow: "ellipsis" }}>{g.name}</span>
        {countBadge(pending)}
      </button>
    );
  };
  const playerRail = (vertical) => (
    <div className={vertical ? "" : "scroll"} style={{ display: "flex", gap: 4,
      flexDirection: vertical ? "column" : "row", overflowX: vertical ? "visible" : "auto",
      ...(vertical ? {} : { paddingBottom: 2 }) }}>
      {playerGroups.map((g) => renderTab(g, vertical))}
    </div>
  );

  const renderCard = (m) => {
    const fac = factions.find((f) => f.id === m.factionId) || null;
    const fleet = (fleets || []).find((f) => f.id === m.fleetId) || null;
    const resolvedM = m.status === "resolved";
    const color = fac ? fac.color : T.accent;
    return (
      <div key={m.id} style={{ border: `1px solid ${m.id === targetId ? T.accent : (resolvedM ? T.line : color)}`,
        borderRadius: 2, background: T.panel2, display: "flex", flexDirection: "column", gap: 8, padding: 10,
        opacity: resolvedM ? 0.9 : 1, boxShadow: m.id === targetId ? `0 0 0 1px ${T.accent}` : "none" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ width: 9, height: 9, borderRadius: "50%", background: color, flexShrink: 0 }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, fontFamily: "'Oswald', sans-serif",
            letterSpacing: ".03em", color: T.text }}>{fac ? fac.name : "Unknown faction"}</span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11.5, color: T.mut }}>
            <Ship size={12} /> {fleet ? fleet.name : "Fleet (removed)"}
          </span>
          <span style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 9.5,
            fontWeight: 700, letterSpacing: ".06em", textTransform: "uppercase",
            color: resolvedM ? T.accent : T.amber }}>
            {resolvedM ? <Check size={11} /> : <Clock size={11} />}{resolvedM ? "Resolved" : "On mission"}
          </span>
        </div>

        <div className="mono" style={{ fontSize: 11, color: T.mut }}>{detachmentSummary(m)}</div>
        <div style={{ fontSize: 9.5, color: T.faint }}>
          {m.createdAt ? new Date(m.createdAt).toLocaleString() : ""}
        </div>
        <div style={{ fontSize: 13, lineHeight: 1.6, color: T.text, whiteSpace: "pre-wrap" }}>{m.text}</div>

        {resolvedM ? (
          <>
            <div style={{ borderTop: `1px solid ${T.line}`, paddingTop: 6 }}>
              {m.resolution
                ? <MissionResolution resolution={m.resolution} />
                : <div style={{ fontSize: 12, color: T.mut }}>Resolved with no result recorded.</div>}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <Btn kind="danger" onClick={() => removeMission(m.id)} style={{ marginLeft: "auto" }}>
                <Trash2 size={13} /> Delete
              </Btn>
            </div>
          </>
        ) : (
          <div style={{ display: "flex", gap: 6 }}>
            <Btn kind="primary" onClick={() => startResolving(m)} title="Load this mission into the resolution tool">
              <Wand2 size={13} /> {m.id === targetId ? "In tool below" : "Resolve with tool"}
            </Btn>
            <Btn kind="danger" onClick={() => removeMission(m.id)} style={{ marginLeft: "auto" }}
              title="Withdraw and return its craft">
              <Trash2 size={13} /> Delete
            </Btn>
          </div>
        )}
      </div>
    );
  };

  const requestsPane = () => {
    if (playerGroups.length === 0) {
      return (
        <div style={{ fontSize: 11.5, color: T.faint, padding: "16px 8px", textAlign: "center",
          border: `1px dashed ${T.line}`, lineHeight: 1.6 }}>
          No squadron missions yet. Players raise them from a fleet's hangar on the Fleet tab.
        </div>
      );
    }
    if (!activeGroup) return null;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <Users size={16} color={T.accent} />
          <div className="stencil" style={{ fontSize: 18, fontWeight: 800, letterSpacing: ".03em", color: T.text }}>
            {activeGroup.name}
          </div>
          <span className="mono" style={{ marginLeft: "auto", fontSize: 11, color: T.mut }}>
            {unresolved.length} new · {resolved.length} resolved
          </span>
        </div>
        {unresolved.length === 0 && resolved.length === 0 && (
          <div style={{ fontSize: 11.5, color: T.faint, padding: "16px 8px", textAlign: "center",
            border: `1px dashed ${T.line}` }}>
            No missions from this player.
          </div>
        )}
        {unresolved.length > 0 && sectionLabel("UNRESOLVED")}
        {unresolved.map(renderCard)}
        {resolved.length > 0 && sectionLabel("RESOLVED")}
        {resolved.map(renderCard)}
      </div>
    );
  };

  const field = (label, node) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={lbl}>{label}</span>
      {node}
    </div>
  );

  const toolPane = () => (
    <div>
      <div className="stencil" style={{ fontSize: 16, letterSpacing: ".06em", color: T.text,
        display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
        <Rocket size={15} color={T.accent} /> MISSION RESOLUTION
      </div>

      <div style={{ background: T.panel, border: `1px solid ${targetMission ? T.accent : T.line}`, ...cut(10),
        padding: isMobile ? 12 : 16, display: "flex", flexDirection: "column", gap: 12 }}>

        {!targetMission ? (
          <div style={{ fontSize: 11.5, color: T.faint, lineHeight: 1.6, padding: "8px 2px" }}>
            Select a pending mission and click "Resolve with tool" to adjudicate it here.
          </div>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "rgba(159,194,58,.1)",
              border: `1px solid ${T.accent}`, borderRadius: 2, padding: "8px 10px" }}>
              <Wand2 size={14} style={{ color: T.accent, flexShrink: 0, marginTop: 1 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ ...lbl, color: T.accent, marginBottom: 3 }}>Resolving mission</div>
                <div style={{ fontSize: 12, color: T.text, lineHeight: 1.5 }}>{targetMission.text}</div>
                <div className="mono" style={{ fontSize: 10.5, color: T.mut, marginTop: 3 }}>
                  {mine} craft committed — {detachmentSummary(targetMission)}
                </div>
              </div>
              <button onClick={() => { setTargetId(""); clearTool(); }} title="Detach from this mission"
                style={{ background: "none", border: "none", color: T.mut, cursor: "pointer", padding: 2 }}>
                <Trash2 size={13} />
              </button>
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              {field("Your craft", (
                <div className="mono" style={{ ...inputStyle, width: 82, textAlign: "right", opacity: .85 }}>{mine}</div>
              ))}
              {field("Enemy craft", (
                <input className="mono" type="number" step="1" min="0" value={theirsText} onChange={onTheirsChange}
                  style={{ ...inputStyle, width: 82, textAlign: "right" }} />
              ))}
              {field("Force ratio", (
                <select value={ratioIdx} onChange={(e) => setRatioIdx(Number(e.target.value))}
                  className="mono" style={{ ...selStyle, width: isMobile ? 118 : 132 }}>
                  {RATIO_COLS.map((c, i) => <option key={c.label} value={i}>{c.label} ({sign(c.shift)})</option>)}
                </select>
              ))}
            </div>
            {snapped !== null && (
              <div style={{ fontSize: 11, color: T.faint, fontFamily: "'Oswald', sans-serif", letterSpacing: ".02em" }}>
                {mine}:{theirsValue} → nearest column <b style={{ color: T.mut }}>{RATIO_COLS[snapped].label}</b>
                {beyond && <span style={{ color: T.amber }}> · beyond the table, clamped to the end column</span>}
                {snapped !== ratioIdx && (
                  <span style={{ color: T.amber }}> · overridden to {ratio.label} ({sign(ratio.shift)})</span>
                )}
              </div>
            )}

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              {field("Outcome shift", (
                <input className="mono" type="number" step="1" value={outShiftText}
                  onChange={(e) => setOutShiftText(e.target.value)} style={{ ...inputStyle, width: 82, textAlign: "right" }} />
              ))}
              {field("Casualty shift", (
                <input className="mono" type="number" step="1" value={casShiftText}
                  onChange={(e) => setCasShiftText(e.target.value)} style={{ ...inputStyle, width: 82, textAlign: "right" }} />
              ))}
              {field("2d6 roll", (
                <input className="mono" type="number" step="1" value={rollText}
                  onChange={(e) => { setRollText(e.target.value); setDice(null); }}
                  style={{ ...inputStyle, width: 82, textAlign: "right" }} />
              ))}
              <Btn kind="primary" onClick={rollForMe} title="Roll 2d6">
                <Dices size={14} /> Roll 2d6
              </Btn>
              {dice && (
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  {[dice.d1, dice.d2].map((face, i) => {
                    const Face = DIE_FACES[face];
                    return <Face key={i} size={26} color={T.text} strokeWidth={1.5} />;
                  })}
                </div>
              )}
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: isMobile ? 14 : 24, alignItems: "flex-start",
              background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 2, padding: 10 }}>
              <div>
                <div style={lbl}>Success</div>
                <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: T.accent }}>{grade}/5</div>
              </div>
              <div>
                <div style={lbl}>Casualties</div>
                <div className="mono" style={{ fontSize: 20, fontWeight: 700, color: T.text }}>{cas}%</div>
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={lbl}>Outcome text</span>
              <textarea value={outcomeText} onChange={(e) => setOutcomeText(e.target.value)}
                placeholder="What happens as a result…"
                style={{ ...inputStyle, minHeight: 56, resize: "vertical", lineHeight: 1.6, fontSize: 12.5, padding: 9 }} />
            </div>

            <Btn kind="primary" onClick={resolve} style={{ justifyContent: "center" }}>
              <Check size={14} /> Resolve &amp; Return Craft
            </Btn>
          </>
        )}
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
        <div>
          <div className="stencil" style={{ fontSize: 16, letterSpacing: ".06em", color: T.text,
            display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
            <Rocket size={15} color={T.accent} /> SQUADRON MISSIONS {countBadge(pendingTotal, true)}
          </div>
          {playerGroups.length > 0 && <div style={{ marginBottom: 10 }}>{playerRail(false)}</div>}
          {requestsPane()}
        </div>
        <div ref={toolRef}>{toolPane()}</div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", background: T.void }}>
      <div style={{ width: 212, flexShrink: 0, borderRight: `2px solid ${T.line}`, background: T.panel,
        display: "flex", flexDirection: "column", minHeight: 0 }}>
        <div className="stencil" style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12.5,
          letterSpacing: ".08em", color: T.text, padding: "12px 12px 8px", flexShrink: 0 }}>
          <Rocket size={14} color={T.accent} /> MISSIONS {countBadge(pendingTotal)}
        </div>
        <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "0 8px 10px" }}>
          {playerGroups.length === 0
            ? <div style={{ fontSize: 10.5, color: T.faint, padding: "8px 4px", lineHeight: 1.5 }}>No missions yet.</div>
            : playerRail(true)}
        </div>
      </div>

      <div className="scroll" style={{ flex: 1, minWidth: 0, overflowY: "auto", padding: 18 }}>
        {requestsPane()}
      </div>

      <div ref={toolRef} className="scroll" style={{ width: 392, flexShrink: 0, borderLeft: `2px solid ${T.line}`,
        background: T.void, overflowY: "auto", padding: 18, display: "flex", flexDirection: "column", gap: 22 }}>
        {toolPane()}
        {notesPane}
      </div>
    </div>
  );
}
