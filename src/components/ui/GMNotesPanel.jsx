import { useMemo, useState } from "react";
import { NotebookPen, Plus, Trash2 } from "lucide-react";
import { T, inputStyle, lbl } from "../../theme.js";
import Btn from "./Btn.jsx";

// GM Tools' freeform log, shared by every resolution workbench (agent actions,
// squadron missions, …) so there is exactly one notes feed regardless of which
// section the GM is working in.
export default function GMNotesPanel({ notes, addNote, removeNote }) {
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
  );
}
