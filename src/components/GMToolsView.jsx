import { useEffect, useMemo, useState } from "react";
import { Gavel, NotebookPen, Copy, Trash2, Plus, Dices, Dice1, Dice2, Dice3, Dice4, Dice5, Dice6 } from "lucide-react";
import { T, inputStyle, selStyle, lbl, cut } from "../theme.js";
import Btn from "./ui/Btn.jsx";

const sign = (n) => (n >= 0 ? `+${n}` : `${n}`);
const rollDie = () => 1 + Math.floor(Math.random() * 6);
const DIE_FACES = { 1: Dice1, 2: Dice2, 3: Dice3, 4: Dice4, 5: Dice5, 6: Dice6 };

const OUTCOMES = [
  { id: "success", label: "Success", kind: "primary" },
  { id: "failure", label: "Failure", kind: "danger" },
  { id: "autoSuccess", label: "Auto Success", kind: "primary" },
  { id: "autoFailure", label: "Auto Failure", kind: "danger" },
];
const OUTCOME_LABEL = {
  success: "Success", failure: "Failure", autoSuccess: "Auto Success", autoFailure: "Auto Failure",
};

// GM-only scratch tool (App.jsx gates the tab and the render — see there for
// why nothing here re-checks isGM): resolve a player's roll against whichever
// of their faction's modifiers apply, and log the Discord-ready result below
// alongside any freeform notes the GM wants kept.
//
// A modifier's point value is not stored on the modifier itself — it's
// situational (the same "Faithful on Every World" might swing a roll by +1
// one week and +2 the next), so it's typed in here at the moment of use,
// not read off the modifier's own record.
export default function GMToolsView({ roles, factions, modifiers, notes, isMobile, addNote, removeNote }) {
  const [roleId, setRoleId] = useState(roles[0]?.id || "");
  useEffect(() => {
    if (!roles.some((r) => r.id === roleId)) setRoleId(roles[0]?.id || "");
  }, [roles, roleId]);
  const role = roles.find((r) => r.id === roleId) || null;
  const faction = role ? factions.find((f) => f.id === role.factionId) : null;
  const factionMods = useMemo(
    () => (faction ? modifiers.filter((m) => m.factionId === faction.id) : []),
    [modifiers, faction],
  );

  // Switching players drops the picks — a modifier picked for one player's
  // roll means nothing once you're resolving someone else's.
  const [selectedIds, setSelectedIds] = useState([]);
  const [modValues, setModValues] = useState({}); // modifierId -> typed-in value for this resolution
  const selectedMods = factionMods.filter((m) => selectedIds.includes(m.id));
  const sumSelected = selectedMods.reduce((s, m) => s + (Number(modValues[m.id]) || 0), 0);

  const [rollText, setRollText] = useState("");
  // The faces behind the last "Roll 2d6" click — cleared the moment the roll
  // is typed over by hand, since the faces would no longer add up to it.
  const [dice, setDice] = useState(null); // { d1, d2 } | null
  function rollTwoD6() {
    const d1 = rollDie(), d2 = rollDie();
    setDice({ d1, d2 });
    setRollText(String(d1 + d2));
  }
  useEffect(() => { setSelectedIds([]); setModValues({}); setDice(null); setRollText(""); }, [roleId]);
  // The total starts at the sum of what's checked, but stays editable — a
  // situational bonus/penalty the GM wants to fold in without a named
  // modifier for it shows up as the gap between this and that sum.
  const [totalModText, setTotalModText] = useState("0");
  useEffect(() => { setTotalModText(String(sumSelected)); }, [sumSelected]);
  const totalMod = Number(totalModText) || 0;
  const rollValue = Number(rollText) || 0;

  const [track, setTrack] = useState(false);
  const [output, setOutput] = useState("");

  function toggleMod(id) {
    setSelectedIds((ids) => {
      if (ids.includes(id)) {
        setModValues((vs) => { const { [id]: _drop, ...rest } = vs; return rest; });
        return ids.filter((x) => x !== id);
      }
      setModValues((vs) => ({ ...vs, [id]: vs[id] ?? "1" }));
      return [...ids, id];
    });
  }

  function resolve(outcomeId) {
    const isAuto = outcomeId === "autoSuccess" || outcomeId === "autoFailure";
    const extra = totalMod - sumSelected;
    const lines = [];
    if (!isAuto) lines.push(`Roll: ${rollValue}`);
    selectedMods.forEach((m) => lines.push(`Mod: ${sign(Number(modValues[m.id]) || 0)} *${m.name || "Unnamed modifier"}*`));
    if (extra !== 0) lines.push(`Mod: ${sign(extra)} *Situational*`);
    lines.push(`**${OUTCOME_LABEL[outcomeId]}**`);
    const text = lines.join("\n");
    setOutput(text);
    if (track) addNote(text, "roll", { playerName: role ? role.name : null });
  }

  async function copyOutput() {
    try { await navigator.clipboard.writeText(output); } catch (e) { /* clipboard unavailable */ }
  }

  const [noteInput, setNoteInput] = useState("");
  function submitNote() {
    const text = noteInput.trim();
    if (!text) return;
    addNote(text, "note");
    setNoteInput("");
  }

  const sortedNotes = useMemo(
    () => [...notes].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    [notes],
  );

  return (
    <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", background: T.void,
      padding: isMobile ? 12 : 22 }}>
      <div style={{ maxWidth: 780, margin: "0 auto", display: "flex", flexDirection: "column", gap: 22 }}>

        {/* ---------------------------------------- roll resolution tool ---------------------------------------- */}
        <div>
          <div className="stencil" style={{ fontSize: 16, letterSpacing: ".06em", color: T.text,
            display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
            <Gavel size={15} color={T.accent} /> ROLL RESOLUTION
          </div>

          <div style={{ background: T.panel, border: `1px solid ${T.line}`, ...cut(10), padding: isMobile ? 12 : 16,
            display: "flex", flexDirection: "column", gap: 12 }}>

            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span style={lbl}>Player</span>
              <select value={roleId} onChange={(e) => setRoleId(e.target.value)} style={selStyle}>
                <option value="">— choose a player —</option>
                {roles.map((r) => <option key={r.id} value={r.id}>{r.name || "Unnamed player"}</option>)}
              </select>
              {roles.length === 0 && (
                <div style={{ fontSize: 10.5, color: T.faint }}>No player roles yet — add one from the access panel.</div>
              )}
            </div>

            {role && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={lbl}>Modifiers {faction ? `— ${faction.name}` : "(no faction assigned)"}</span>
                {factionMods.length === 0 && (
                  <div style={{ fontSize: 10.5, color: T.faint, padding: "8px 0" }}>
                    No modifiers recorded for this player's faction yet.
                  </div>
                )}
                {factionMods.map((m) => {
                  const on = selectedIds.includes(m.id);
                  return (
                    <div key={m.id} style={{ display: "flex", alignItems: "center", gap: 8,
                      border: `1px solid ${on ? T.accent : T.line}`, borderRadius: 2, padding: "6px 9px",
                      background: on ? "rgba(159,194,58,.12)" : T.panel2 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 8, flex: 1, cursor: "pointer" }}>
                        <input type="checkbox" checked={on} onChange={() => toggleMod(m.id)} />
                        <span style={{ fontSize: 12.5, color: on ? T.accent : T.text }}>
                          {m.name || "Unnamed modifier"}
                        </span>
                      </label>
                      {on && (
                        <input type="number" className="mono" value={modValues[m.id] ?? ""}
                          onChange={(e) => setModValues((vs) => ({ ...vs, [m.id]: e.target.value }))}
                          placeholder="value" style={{ ...inputStyle, width: 64 }} />
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={lbl}>Roll</span>
                <input className="mono" type="number" value={rollText}
                  onChange={(e) => { setRollText(e.target.value); setDice(null); }}
                  placeholder="0" style={{ ...inputStyle, width: 90 }} />
              </div>
              <Btn kind="primary" onClick={rollTwoD6} title="Roll 2d6">
                <Dices size={14} /> Roll 2d6
              </Btn>
              {dice && (
                <div style={{ display: "flex", gap: 4, alignItems: "center" }}>
                  {[dice.d1, dice.d2].map((face, i) => {
                    const Face = DIE_FACES[face];
                    return <Face key={i} size={30} color={T.text} strokeWidth={1.5} />;
                  })}
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={lbl}>Total mod</span>
                <input className="mono" type="number" value={totalModText} onChange={(e) => setTotalModText(e.target.value)}
                  style={{ ...inputStyle, width: 90 }} />
              </div>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 11.5, color: T.mut }}>
              <input type="checkbox" checked={track} onChange={(e) => setTrack(e.target.checked)} />
              Track this resolution in the notes below
            </label>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {OUTCOMES.map((o) => (
                <Btn key={o.id} kind={o.kind} onClick={() => resolve(o.id)} style={{ flex: "1 1 130px", justifyContent: "center" }}>
                  {o.label}
                </Btn>
              ))}
            </div>

            {output && (
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={lbl}>Discord output</span>
                <pre className="mono" style={{ margin: 0, background: T.panel2, border: `1px solid ${T.line}`,
                  borderRadius: 2, padding: 10, fontSize: 12.5, color: T.text, whiteSpace: "pre-wrap" }}>
                  {output}
                </pre>
                <Btn onClick={copyOutput} style={{ alignSelf: "flex-start" }}>
                  <Copy size={13} /> Copy
                </Btn>
              </div>
            )}
          </div>
        </div>

        {/* ---------------------------------------- notes ---------------------------------------- */}
        <div>
          <div className="stencil" style={{ fontSize: 16, letterSpacing: ".06em", color: T.text,
            display: "flex", alignItems: "center", gap: 7, marginBottom: 10 }}>
            <NotebookPen size={15} color={T.accent} /> NOTES
          </div>

          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input value={noteInput} onChange={(e) => setNoteInput(e.target.value)}
              placeholder="Add a note…" style={{ ...inputStyle, flex: 1 }}
              onKeyDown={(e) => { if (e.key === "Enter") submitNote(); }} />
            <Btn kind="primary" onClick={submitNote} disabled={!noteInput.trim()}>
              <Plus size={13} /> Add
            </Btn>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sortedNotes.length === 0 && (
              <div style={{ fontSize: 11.5, color: T.faint, padding: "16px 8px", textAlign: "center",
                border: `1px dashed ${T.line}` }}>
                No notes yet.
              </div>
            )}
            {sortedNotes.map((n) => (
              <div key={n.id} style={{ border: `1px solid ${T.line}`, borderRadius: 2, background: T.panel2,
                padding: 9, display: "flex", flexDirection: "column", gap: 5 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 9.5, letterSpacing: ".1em", textTransform: "uppercase",
                    color: n.kind === "roll" ? T.accent : T.faint, fontWeight: 700 }}>
                    {n.kind === "roll" ? `Roll${n.playerName ? ` · ${n.playerName}` : ""}` : "Note"}
                  </span>
                  <span style={{ fontSize: 9.5, color: T.faint, marginLeft: "auto" }}>
                    {n.createdAt ? new Date(n.createdAt).toLocaleString() : ""}
                  </span>
                  <button onClick={() => removeNote(n.id)} title="Remove note"
                    style={{ background: "none", border: "none", color: T.danger, cursor: "pointer", padding: 2 }}>
                    <Trash2 size={13} />
                  </button>
                </div>
                <div className={n.kind === "roll" ? "mono" : undefined}
                  style={{ fontSize: 12.5, lineHeight: 1.6, color: T.text, whiteSpace: "pre-wrap" }}>
                  {n.text}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
