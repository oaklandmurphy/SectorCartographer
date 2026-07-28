import { BookOpen, Link2, Unlink, Plus } from "lucide-react";
import { T, F, inputStyle, selStyle, lbl } from "../theme.js";
import { WIKI_CATS } from "../constants.js";

// Ties any map/politics element (system, fleet, faction, character, org) to a
// codex entry — the same idea for every piece so "all elements are integrated
// with the codex." Viewers get a one-click jump to the linked page; editors can
// relink, unlink, or spin up a fresh entry pre-titled from the element.
export default function CodexLink({
  wiki, value, canEdit, onChange, onNavigate, onCreate,
  createTitle = "New Entry", createCategory = "misc",
}) {
  const entry = wiki.find((e) => e.id === value) || null;

  // nothing to show a viewer with no link
  if (!canEdit && !entry) return null;

  const catLabel = (id) => (WIKI_CATS.find((c) => c.id === id) || {}).label || id;

  return (
    <div>
      <div style={lbl}>Codex Entry</div>
      {entry ? (
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
          <button onClick={() => onNavigate(entry.id)} title="Open this entry in the codex"
            style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "center", gap: 7, cursor: "pointer",
              background: "rgba(159,194,58,.12)", border: `1px solid ${T.accent}`, borderRadius: 2, padding: "6px 9px",
              color: T.accent, fontFamily: F.body, fontSize: 12, textAlign: "left" }}>
            <BookOpen size={14} style={{ flexShrink: 0 }} />
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {entry.title || "Untitled"}
            </span>
            <span className="mono" style={{ fontSize: 8.5, color: T.faint, letterSpacing: ".1em",
              textTransform: "uppercase", flexShrink: 0 }}>{catLabel(entry.category)}</span>
          </button>
          {canEdit && (
            <button onClick={() => onChange(null)} title="Unlink codex entry"
              style={{ background: "none", border: `1px solid ${T.line}`, borderRadius: 2, color: T.faint,
                cursor: "pointer", padding: 6, display: "flex", flexShrink: 0 }}>
              <Unlink size={13} />
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 4 }}>
          <div style={{ position: "relative", flex: 1, minWidth: 0, display: "flex", alignItems: "center" }}>
            <Link2 size={13} style={{ position: "absolute", left: 7, color: T.faint, pointerEvents: "none" }} />
            <select value="" onChange={(e) => e.target.value && onChange(e.target.value)}
              style={{ ...selStyle, paddingLeft: 26 }}>
              <option value="">Link an entry…</option>
              {WIKI_CATS.map((c) => {
                const opts = wiki.filter((e) => e.category === c.id);
                if (!opts.length) return null;
                return (
                  <optgroup key={c.id} label={c.label}>
                    {opts.map((e) => <option key={e.id} value={e.id}>{e.title || "Untitled"}</option>)}
                  </optgroup>
                );
              })}
            </select>
          </div>
          <button onClick={() => { const id = onCreate(createCategory, createTitle); if (id) onChange(id); }}
            title={`Create a new "${createTitle}" codex entry and link it`}
            style={{ ...inputStyle, width: "auto", flexShrink: 0, display: "flex", alignItems: "center", gap: 4,
              cursor: "pointer", color: T.accent, borderColor: "rgba(159,194,58,.5)",
              background: "rgba(159,194,58,.1)", fontFamily: F.body, textTransform: "uppercase",
              fontSize: 11, letterSpacing: ".04em" }}>
            <Plus size={13} /> New
          </button>
        </div>
      )}
    </div>
  );
}
