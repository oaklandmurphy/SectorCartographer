import { useRef, useState } from "react";
import { Plus, Trash2, ChevronLeft, FileText, EyeOff, Users, Table, Eye, Pencil,
  Image as ImageIcon, ImagePlus, X, AlertTriangle, Inbox, CheckCircle2, Undo2, Send, Clock } from "lucide-react";
import { T, inputStyle, selStyle, lbl } from "../theme.js";
import { WIKI_CATS } from "../constants.js";
import { isRestricted } from "../lib/visibility.js";
import { bodyExcerpt, CSV_TEMPLATE, CSV_TEMPLATE_CAPTION } from "../lib/codexBody.js";
import { processImage } from "../lib/codexImage.js";
import Btn from "./ui/Btn.jsx";
import CodexBody from "./CodexBody.jsx";
import VisibilityRow from "./VisibilityRow.jsx";

export default function WikiView({ wiki, roles = [], canEdit, isMobile, viewer, activeCat, setActiveCat, selectedId, setSelectedId,
  addEntry, patchEntry, deleteEntry, submitEntry, patchOwnEntry, withdrawEntry, approveEntry }) {
  const catMeta = WIKI_CATS.find((c) => c.id === activeCat) || WIKI_CATS[0];
  // A signed-in player (not the GM, not anonymous) can submit a new entry.
  const canSubmit = !!(viewer && viewer.kind === "player");
  const isMine = (e) => !!(viewer && viewer.roleId != null && e.submittedBy && e.submittedBy.roleId === viewer.roleId);
  // GM-only inbox: every submission awaiting review, across all categories,
  // instead of the active category's list. Local/unrouted, same as previewOf
  // below — it's a triage view, not a page worth bookmarking.
  const [queueMode, setQueueMode] = useState(false);
  const pendingCount = wiki.filter((e) => e.status === "pending").length;
  // Normal category browsing hides everyone else's pending submissions — they
  // aren't real pages yet — but still shows the viewer's own, so a player can
  // find and keep editing what they just wrote.
  const entries = queueMode
    ? wiki.filter((e) => e.status === "pending")
    : wiki.filter((e) => e.category === activeCat && (e.status !== "pending" || isMine(e)));
  const selected = wiki.find((e) => e.id === selectedId);
  // Editors see only the raw textarea, so a ```csv block is invisible while
  // writing — hence the preview toggle. It's keyed to an entry id, not a bare
  // flag, so leaving for another entry ends the preview, and a brand-new entry
  // (selected up in App, not via selectEntry) opens ready to type in, not read-only.
  const [previewOf, setPreviewOf] = useState(null);
  const preview = previewOf != null && previewOf === selectedId;
  const bodyRef = useRef(null);
  const imgRef = useRef(null);
  // Upload errors are per-entry and transient; cleared on picking a fresh file
  // and whenever the open entry changes.
  const [imgError, setImgError] = useState(null);
  // setActiveCat clears the open entry itself (see App.jsx) — clearing it here
  // too would be a second URL change, i.e. two Back presses for one click.
  const selectCat = (id) => { setQueueMode(false); setActiveCat(id); };
  const openQueue = () => { setQueueMode(true); setSelectedId(null); };
  const selectEntry = (id) => { setPreviewOf(null); setImgError(null); setSelectedId(id); };

  // Downscale/re-encode a picked raster file, then store it on the entry as a
  // data URI. Rejects (with a message) rather than pushing an oversized image.
  // `patch` is whichever write path the current viewer has (GM or the entry's
  // own submitter) — see editForm below.
  async function onPickImage(entry, e, patch) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // let the same file be re-picked after an error
    if (!file) return;
    setImgError(null);
    const res = await processImage(file);
    if (res.error) { setImgError(res.error); return; }
    patch(entry.id, { image: res.dataUri });
  }

  // Drops a starter CSV block in at the caret. Only reachable while the textarea
  // is on screen (the button hides in preview), so bodyRef is live here.
  function insertTable(entry, patch) {
    const el = bodyRef.current;
    const body = entry.body || "";
    const at = el ? el.selectionStart : body.length;
    const before = body.slice(0, at);
    const after = body.slice(at);
    // A fence only opens at the start of its own line, and wants a blank line
    // between it and any prose either side.
    const lead = before === "" || before.endsWith("\n\n") ? "" : before.endsWith("\n") ? "\n" : "\n\n";
    const tail = after === "" ? "\n" : after.startsWith("\n") ? "\n" : "\n\n";
    patch(entry.id, { body: before + lead + CSV_TEMPLATE + tail + after });
    // Select the placeholder caption so the writer just types over it.
    const start = before.length + lead.length + CSV_TEMPLATE.indexOf(CSV_TEMPLATE_CAPTION);
    requestAnimationFrame(() => {
      if (!bodyRef.current) return;
      bodyRef.current.focus();
      bodyRef.current.setSelectionRange(start, start + CSV_TEMPLATE_CAPTION.length);
    });
  }

  // A codex image is always a raster data URI shown through <img> — never inline
  // markup — see the security note in lib/codexImage.js.
  const imageFrame = (src, maxHeight, alt) => (
    <div style={{ border: `1px solid ${T.line}`, background: T.panel3, padding: 6,
      alignSelf: "flex-start", maxWidth: "100%", borderRadius: 2 }}>
      <img src={src} alt={alt || ""} style={{ display: "block", maxWidth: "100%", maxHeight }} />
    </div>
  );

  // Image control: preview + add/replace/remove, shared by the GM edit form and
  // a player's own-submission form — `patch` picks which one actually writes.
  // Hidden entirely from read-only viewers — they see the picture (via
  // imageFrame) only when one is present.
  const imageEditor = (patch) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ ...lbl, display: "flex", alignItems: "center", gap: 6 }}>
        <ImageIcon size={12} /> Image
        <span style={{ marginLeft: "auto", color: selected.image ? T.accent : T.faint,
          textTransform: "none", letterSpacing: 0, fontWeight: 600 }}>
          {selected.image ? "Shown on this page" : "None"}
        </span>
      </div>
      {selected.image && imageFrame(selected.image, 260)}
      <input ref={imgRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif"
        onChange={(e) => onPickImage(selected, e, patch)} style={{ display: "none" }} />
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <Btn onClick={() => imgRef.current && imgRef.current.click()}
          title={selected.image ? "Choose a different picture" : "Upload a picture for this page"}>
          <ImagePlus size={13} /> {selected.image ? "Replace image" : "Add image"}
        </Btn>
        {selected.image && (
          <Btn kind="danger" onClick={() => patch(selected.id, { image: undefined })} title="Remove this page's image">
            <X size={13} /> Remove
          </Btn>
        )}
      </div>
      {imgError && (
        <div style={{ fontSize: 10, color: "#e5988c", display: "flex", alignItems: "center", gap: 5, lineHeight: 1.5 }}>
          <AlertTriangle size={11} style={{ flexShrink: 0 }} /> {imgError}
        </div>
      )}
      <div style={{ ...lbl, fontSize: 9, color: T.faint, textTransform: "none", letterSpacing: 0, lineHeight: 1.5 }}>
        Players see this picture on the page only when one is set. Large images are resized automatically.
      </div>
    </div>
  );

  // NOTE: these are plain functions returning JSX (called, not mounted as <Components>),
  // so editing inputs/textarea don't lose focus on each keystroke from a remount.
  const categoryRail = (vertical) => (
    <div className={vertical ? "" : "scroll"} style={{ display: "flex", flexDirection: vertical ? "column" : "row",
      gap: 4, padding: vertical ? "10px 8px" : "8px", overflowX: vertical ? "visible" : "auto",
      borderBottom: vertical ? `1px solid ${T.line}` : `2px solid ${T.line}`, flexShrink: 0 }}>
      {canEdit && (
        <button onClick={openQueue} title="Entries submitted by players, awaiting your approval"
          style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", whiteSpace: "nowrap",
            border: `1px solid ${queueMode ? T.amber : T.line}`, borderRadius: 2, padding: "7px 10px",
            background: queueMode ? "rgba(217,143,43,.14)" : T.panel2, color: queueMode ? T.amber : T.text,
            fontFamily: "'Oswald', sans-serif", fontSize: 12.5, fontWeight: 600, letterSpacing: ".03em",
            textTransform: "uppercase", justifyContent: vertical ? "flex-start" : "center", flex: vertical ? "none" : "0 0 auto" }}>
          <Inbox size={15} /> <span style={{ flex: 1, textAlign: "left" }}>Review Queue</span>
          {pendingCount > 0 && (
            <span className="mono" style={{ fontSize: 10, color: T.amber, fontWeight: 700 }}>{pendingCount}</span>
          )}
        </button>
      )}
      {WIKI_CATS.map((cat) => {
        const Ic = cat.icon; const count = wiki.filter((e) => e.category === cat.id && e.status !== "pending").length;
        const on = !queueMode && cat.id === activeCat;
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
          {queueMode
            ? "Nothing waiting for review."
            : `No ${catMeta.label.toLowerCase()} entries yet.${canEdit ? " Add one below." : canSubmit ? " Submit one below." : ""}`}
        </div>
      )}
      {entries.map((e) => {
        const on = e.id === selectedId;
        const restricted = canEdit && roles.length > 0 && isRestricted(e);
        const gmOnly = restricted && e.visibility.length === 0;
        const pending = e.status === "pending";
        return (
          <button key={e.id} onClick={() => selectEntry(e.id)}
            style={{ textAlign: "left", cursor: "pointer", background: on ? "rgba(159,194,58,.1)" : T.panel2,
              border: `1px solid ${on ? T.accent : T.line}`, borderRadius: 2, padding: "8px 10px", color: T.text,
              fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="stencil" style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, letterSpacing: ".03em",
                color: on ? T.accent : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {e.title || "Untitled"}
              </span>
              {pending && (
                <span title={e.submittedBy ? `Submitted by ${e.submittedBy.roleName || "a player"}` : "Pending review"}
                  style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0, color: T.amber,
                    border: `1px solid ${T.amber}`, borderRadius: 2, padding: "1px 4px", fontSize: 8.5,
                    letterSpacing: ".08em", textTransform: "uppercase" }}>
                  <Clock size={9} /> {queueMode ? (e.submittedBy && e.submittedBy.roleName) || "Pending" : "Pending"}
                </span>
              )}
              {restricted && !pending && (
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
              {bodyExcerpt(e.body).slice(0, 90) || "—"}
            </span>
          </button>
        );
      })}
      {canEdit && !queueMode && (
        <Btn kind="primary" onClick={() => addEntry(activeCat)} style={{ justifyContent: "center", marginTop: 2 }}>
          <Plus size={14} /> New {catMeta.label} entry
        </Btn>
      )}
      {canSubmit && !queueMode && (
        <Btn kind="primary" onClick={() => submitEntry(activeCat)} style={{ justifyContent: "center", marginTop: 2 }}>
          <Send size={14} /> Submit new {catMeta.label.toLowerCase()} entry
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
            Pick an entry from the list to read it{canEdit ? ", or create a new one." : canSubmit ? ", or submit a new one." : "."}
          </div>
        </div>
      );
    }
    const catOf = WIKI_CATS.find((c) => c.id === selected.category) || catMeta;
    const CatIc = catOf.icon;
    const pending = selected.status === "pending";
    // A player only ever gets the edit form back for their own not-yet-reviewed
    // submission — canSeeSubmission upstream already keeps anyone else's pending
    // entries out of `wiki`, so this can't fire for someone else's.
    const own = !canEdit && pending && isMine(selected);
    // Shared field markup for the GM's edit form and a player's own-submission
    // form — only which `patch` function actually writes differs between them.
    const editForm = (patch) => (
      <>
        <input value={selected.title} onChange={(e) => patch(selected.id, { title: e.target.value })}
          placeholder="Entry title"
          style={{ ...inputStyle, fontSize: 18, fontFamily: "'Big Shoulders Stencil', 'Oswald', sans-serif",
            fontWeight: 700, letterSpacing: ".04em", padding: "8px 10px" }} />
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <span style={lbl}>Category</span>
          <select value={selected.category} onChange={(e) => patch(selected.id, { category: e.target.value })}
            style={{ ...selStyle, width: "auto", minWidth: 130 }}>
            {WIKI_CATS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </div>
        <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ ...lbl, flex: 1 }}>Body</span>
          {!preview && (
            <Btn onClick={() => insertTable(selected, patch)} title="Insert a CSV table block at the cursor">
              <Table size={13} /> Insert table
            </Btn>
          )}
          <Btn onClick={() => setPreviewOf(preview ? null : selected.id)} title={preview ? "Back to editing" : "See how this entry reads"}>
            {preview ? <><Pencil size={13} /> Edit</> : <><Eye size={13} /> Preview</>}
          </Btn>
        </div>
        {preview ? (
          <div style={{ minHeight: isMobile ? 220 : 340, border: `1px dashed ${T.line}`, borderRadius: 2, padding: 12,
            display: "flex", flexDirection: "column", gap: 12 }}>
            {selected.image && imageFrame(selected.image, isMobile ? 320 : 480, selected.title)}
            <CodexBody body={selected.body} isMobile={isMobile} />
          </div>
        ) : (
          <textarea ref={bodyRef} value={selected.body} onChange={(e) => patch(selected.id, { body: e.target.value })}
            placeholder="Write anything here — lore, notes, stats, rules…"
            style={{ ...inputStyle, minHeight: isMobile ? 220 : 340, resize: "vertical", lineHeight: 1.6,
              fontFamily: "'IBM Plex Mono', ui-monospace, Menlo, monospace", fontSize: 12.5, padding: 12 }} />
        )}
        {imageEditor(patch)}
      </>
    );
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
        {pending && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.amber,
            border: `1px solid ${T.amber}`, borderRadius: 2, padding: "6px 10px", background: "rgba(217,143,43,.1)" }}>
            <Clock size={13} style={{ flexShrink: 0 }} />
            {canEdit
              ? `Submitted by ${(selected.submittedBy && selected.submittedBy.roleName) || "a player"} — pending your review.`
              : "Pending review — only you and the GM can see this until it's approved."}
          </div>
        )}
        {canEdit ? (
          <>
            {editForm(patchEntry)}
            <VisibilityRow roles={roles} value={selected.visibility}
              onChange={(v) => patchEntry(selected.id, { visibility: v })} />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {pending && (
                <Btn kind="primary" onClick={() => approveEntry(selected.id)}>
                  <CheckCircle2 size={14} /> Approve &amp; publish
                </Btn>
              )}
              <Btn kind="danger" onClick={() => deleteEntry(selected.id)}>
                <Trash2 size={14} /> {pending ? "Reject (delete)" : "Delete entry"}
              </Btn>
            </div>
          </>
        ) : own ? (
          <>
            {editForm(patchOwnEntry)}
            <Btn kind="danger" onClick={() => withdrawEntry(selected.id)} style={{ alignSelf: "flex-start" }}>
              <Undo2 size={14} /> Withdraw submission
            </Btn>
          </>
        ) : (
          <>
            <div className="stencil" style={{ fontSize: 24, fontWeight: 800, letterSpacing: ".03em", color: T.text }}>
              {selected.title || "Untitled"}
            </div>
            {selected.submittedBy && (
              <div style={{ fontSize: 10.5, color: T.faint, fontStyle: "italic" }}>
                Submitted by {selected.submittedBy.roleName || "a player"}
              </div>
            )}
            {/* Players see the image section only when a picture is present. */}
            {selected.image && imageFrame(selected.image, isMobile ? 320 : 480, selected.title)}
            <CodexBody body={selected.body} isMobile={isMobile} />
          </>
        )}
      </div>
    );
  };

  if (isMobile) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: T.void }}>
        {selected ? detail(() => selectEntry(null)) : (
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
