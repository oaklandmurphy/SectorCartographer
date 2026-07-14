import { Plus, Trash2, ChevronLeft, FileText, EyeOff, Users } from "lucide-react";
import { T, inputStyle, selStyle, lbl } from "../theme.js";
import { WIKI_CATS } from "../constants.js";
import { isRestricted } from "../lib/visibility.js";
import Btn from "./ui/Btn.jsx";
import VisibilityRow from "./VisibilityRow.jsx";

export default function WikiView({ wiki, roles = [], canEdit, isMobile, activeCat, setActiveCat, selectedId, setSelectedId, addEntry, patchEntry, deleteEntry }) {
  const catMeta = WIKI_CATS.find((c) => c.id === activeCat) || WIKI_CATS[0];
  const entries = wiki.filter((e) => e.category === activeCat);
  const selected = wiki.find((e) => e.id === selectedId);
  const selectCat = (id) => { setActiveCat(id); setSelectedId(null); };

  // NOTE: these are plain functions returning JSX (called, not mounted as <Components>),
  // so editing inputs/textarea don't lose focus on each keystroke from a remount.
  const categoryRail = (vertical) => (
    <div className={vertical ? "" : "scroll"} style={{ display: "flex", flexDirection: vertical ? "column" : "row",
      gap: 4, padding: vertical ? "10px 8px" : "8px", overflowX: vertical ? "visible" : "auto",
      borderBottom: vertical ? `1px solid ${T.line}` : `2px solid ${T.line}`, flexShrink: 0 }}>
      {WIKI_CATS.map((cat) => {
        const Ic = cat.icon; const count = wiki.filter((e) => e.category === cat.id).length;
        const on = cat.id === activeCat;
        return (
          <button key={cat.id} onClick={() => selectCat(cat.id)} title={cat.label}
            style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", whiteSpace: "nowrap",
              border: `1px solid ${on ? T.accent : T.line}`, borderRadius: 2, padding: "7px 10px",
              background: on ? "rgba(159,194,58,.14)" : T.panel2, color: on ? T.accent : T.text,
              fontFamily: "'Oswald', sans-serif", fontSize: 12.5, fontWeight: 600, letterSpacing: ".03em",
              textTransform: "uppercase", justifyContent: vertical ? "flex-start" : "center", flex: vertical ? "none" : "0 0 auto" }}>
            <Ic size={15} /> <span style={{ flex: 1, textAlign: "left" }}>{cat.label}</span>
            <span className="mono" style={{ fontSize: 10, color: on ? T.accent : T.faint }}>{count}</span>
          </button>
        );
      })}
    </div>
  );

  const entryList = () => (
    <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10,
      display: "flex", flexDirection: "column", gap: 6 }}>
      {entries.length === 0 && (
        <div style={{ fontSize: 11.5, color: T.faint, padding: "16px 8px", textAlign: "center",
          border: `1px dashed ${T.line}`, lineHeight: 1.6 }}>
          No {catMeta.label.toLowerCase()} entries yet.{canEdit ? " Add one below." : ""}
        </div>
      )}
      {entries.map((e) => {
        const on = e.id === selectedId;
        const restricted = canEdit && roles.length > 0 && isRestricted(e);
        const gmOnly = restricted && e.visibility.length === 0;
        return (
          <button key={e.id} onClick={() => setSelectedId(e.id)}
            style={{ textAlign: "left", cursor: "pointer", background: on ? "rgba(159,194,58,.1)" : T.panel2,
              border: `1px solid ${on ? T.accent : T.line}`, borderRadius: 2, padding: "8px 10px", color: T.text,
              fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="stencil" style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, letterSpacing: ".03em",
                color: on ? T.accent : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {e.title || "Untitled"}
              </span>
              {restricted && (
                <span title={gmOnly ? "GM only" : "Restricted to some players"}
                  style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0, color: gmOnly ? T.amber : T.mut,
                    border: `1px solid ${gmOnly ? T.amber : T.line}`, borderRadius: 2, padding: "1px 4px", fontSize: 8.5,
                    letterSpacing: ".08em", textTransform: "uppercase" }}>
                  {gmOnly ? <EyeOff size={9} /> : <Users size={9} />}{gmOnly ? "GM" : e.visibility.length}
                </span>
              )}
            </span>
            <span style={{ fontSize: 10.5, color: T.faint, lineHeight: 1.4, overflow: "hidden",
              display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
              {(e.body || "").replace(/\n+/g, " ").slice(0, 90) || "—"}
            </span>
          </button>
        );
      })}
      {canEdit && (
        <Btn kind="primary" onClick={() => addEntry(activeCat)} style={{ justifyContent: "center", marginTop: 2 }}>
          <Plus size={14} /> New {catMeta.label} entry
        </Btn>
      )}
    </div>
  );

  const detail = (onBack) => {
    if (!selected) {
      return (
        <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", alignItems: "center",
          justifyContent: "center", gap: 12, color: T.faint, padding: 24, textAlign: "center" }}>
          <FileText size={40} strokeWidth={1.2} />
          <div className="stencil" style={{ fontSize: 15, letterSpacing: ".06em", color: T.mut }}>NO ENTRY SELECTED</div>
          <div style={{ fontSize: 11.5, lineHeight: 1.6, maxWidth: 300 }}>
            Pick an entry from the list to read it{canEdit ? ", or create a new one." : "."}
          </div>
        </div>
      );
    }
    const catOf = WIKI_CATS.find((c) => c.id === selected.category) || catMeta;
    const CatIc = catOf.icon;
    return (
      <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: isMobile ? 14 : 22,
        display: "flex", flexDirection: "column", gap: 12 }}>
        {onBack && (
          <button onClick={onBack} style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 5,
            background: T.panel2, border: `1px solid ${T.line}`, borderRadius: 2, color: T.text, cursor: "pointer",
            padding: "6px 10px", fontFamily: "'Oswald', sans-serif", fontSize: 12, textTransform: "uppercase" }}>
            <ChevronLeft size={15} /> Back
          </button>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: catMeta ? T.accent : T.mut }}>
          <CatIc size={16} style={{ color: T.accent }} />
          <span style={{ ...lbl, color: T.faint }}>{catOf.label}</span>
        </div>
        {canEdit ? (
          <>
            <input value={selected.title} onChange={(e) => patchEntry(selected.id, { title: e.target.value })}
              placeholder="Entry title"
              style={{ ...inputStyle, fontSize: 18, fontFamily: "'Big Shoulders Stencil', 'Oswald', sans-serif",
                fontWeight: 700, letterSpacing: ".04em", padding: "8px 10px" }} />
            <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              <span style={lbl}>Category</span>
              <select value={selected.category} onChange={(e) => patchEntry(selected.id, { category: e.target.value })}
                style={{ ...selStyle, width: "auto", minWidth: 130 }}>
                {WIKI_CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>
            <textarea value={selected.body} onChange={(e) => patchEntry(selected.id, { body: e.target.value })}
              placeholder="Write anything here — lore, notes, stats, rules…"
              style={{ ...inputStyle, minHeight: isMobile ? 220 : 340, resize: "vertical", lineHeight: 1.6,
                fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, monospace", fontSize: 12.5, padding: 12 }} />
            <VisibilityRow roles={roles} value={selected.visibility}
              onChange={(v) => patchEntry(selected.id, { visibility: v })} />
            <Btn kind="danger" onClick={() => deleteEntry(selected.id)} style={{ alignSelf: "flex-start" }}>
              <Trash2 size={14} /> Delete entry
            </Btn>
          </>
        ) : (
          <>
            <div className="stencil" style={{ fontSize: 24, fontWeight: 800, letterSpacing: ".03em", color: T.text }}>
              {selected.title || "Untitled"}
            </div>
            <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", lineHeight: 1.7, fontSize: 13.5,
              color: T.text, fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, monospace" }}>
              {selected.body || <span style={{ color: T.faint }}>(This entry is empty.)</span>}
            </div>
          </>
        )}
      </div>
    );
  };

  if (isMobile) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: T.void }}>
        {selected ? detail(() => setSelectedId(null)) : (
          <>
            {categoryRail(false)}
            {entryList()}
          </>
        )}
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", background: T.void }}>
      <div style={{ width: 300, flexShrink: 0, borderRight: `2px solid ${T.line}`, background: T.panel,
        display: "flex", flexDirection: "column", minHeight: 0 }}>
        {categoryRail(true)}
        {entryList()}
      </div>
      {detail(null)}
    </div>
  );
}
