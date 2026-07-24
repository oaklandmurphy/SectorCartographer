import { useRef, useState } from "react";
import { Plus, Trash2, ChevronLeft, FileText, EyeOff, Users, Table, Eye, Pencil,
  Image as ImageIcon, ImagePlus, X, AlertTriangle, Inbox, CheckCircle2, Undo2, Send, Clock, Search, Globe,
  ArrowUpDown, Filter } from "lucide-react";
import { T, inputStyle, selStyle, lbl } from "../theme.js";
import { WIKI_CATS } from "../constants.js";
import { isRestricted } from "../lib/visibility.js";
import { bodyExcerpt, CSV_TEMPLATE, CSV_TEMPLATE_CAPTION } from "../lib/codexBody.js";
import { processImage } from "../lib/codexImage.js";
import { uploadDataUri } from "../lib/firebaseStorage.js";
import { SECTOR_ID } from "../lib/sectorRepo.js";
import Btn from "./ui/Btn.jsx";
import CodexBody from "./CodexBody.jsx";
import CodexDiff, { DiffLegend } from "./CodexDiff.jsx";
import VisibilityRow from "./VisibilityRow.jsx";

const formatUpdatedAt = (value) => value ? new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium", timeStyle: "short",
}).format(new Date(value)) : null;

export default function WikiView({ wiki, roles = [], factions = [], canEdit, isMobile, viewer, activeCat, setActiveCat, selectedId, setSelectedId,
  addEntry, patchEntry, deleteEntry, submitEntry, patchOwnEntry, withdrawEntry, approveEntry,
  publishEntry, unpublishEntry, proposeEdit }) {
  const catMeta = WIKI_CATS.find((c) => c.id === activeCat) || WIKI_CATS[0];
  const catLabel = (id) => (WIKI_CATS.find((c) => c.id === id) || {}).label || id;
  // A character/location/faction entry's faction tint — a quick visual cue in
  // the list for which faction an entry belongs to, without opening it.
  const factionColor = (id) => (factions.find((f) => f.id === id) || {}).color || null;
  // A signed-in player (not the GM, not anonymous) can submit a new entry.
  const canSubmit = !!(viewer && viewer.kind === "player");
  const isMine = (e) => !!(viewer && viewer.roleId != null && e.submittedBy && e.submittedBy.roleId === viewer.roleId);
  // GM-only inbox: every submission awaiting review, across all categories,
  // instead of the active category's list. Local/unrouted, same as previewOf
  // below — it's a triage view, not a page worth bookmarking.
  const [queueMode, setQueueMode] = useState(false);
  const pendingCount = wiki.filter((e) => e.status === "pending" && e.ready).length;
  // Free-text search across the whole codex. A non-empty query overrides both
  // category browsing and the queue, listing every live entry whose title, body
  // or category matches — pending submissions aren't articles yet, so they stay
  // out of results (the GM has the Review Queue for those).
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const searching = q.length > 0;
  const terms = searching ? q.split(/\s+/) : [];
  const matches = (e) => {
    const hay = `${e.title || ""}\n${e.body || ""}\n${catLabel(e.category)}`.toLowerCase();
    return terms.every((t) => hay.includes(t));
  };
  // How the list is ordered, and (when relevant) narrowed to one faction.
  // Sticky across category/queue/search switches — a GM comparing one
  // faction's footprint across categories shouldn't have to re-pick it.
  const [sortMode, setSortMode] = useState("updated"); // "updated" | "created" | "alpha"
  const [filterFaction, setFilterFaction] = useState(""); // "" = all factions
  function sortCmp(a, b) {
    if (sortMode === "alpha") return (a.title || "").localeCompare(b.title || "");
    if (sortMode === "created") return (b.createdAt || 0) - (a.createdAt || 0);
    return (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0); // "updated"
  }
  // Normal category browsing hides everyone else's pending submissions — they
  // aren't real pages yet — but still shows the viewer's own, so a player can
  // find and keep editing what they just wrote.
  const baseEntries = searching
    ? wiki.filter((e) => e.status !== "pending" && matches(e)).sort(sortCmp)
    : queueMode
      // Submissions the player has marked ready sort above ones they're still
      // drafting, so the GM sees what's actually waiting on them first; the
      // chosen sort only breaks ties within each of those two groups.
      ? wiki.filter((e) => e.status === "pending").sort((a, b) => (b.ready ? 1 : 0) - (a.ready ? 1 : 0) || sortCmp(a, b))
      : wiki.filter((e) => e.category === activeCat && (e.status !== "pending" || isMine(e))).sort(sortCmp);
  // The faction filter only offers (and only appears for) factions actually
  // present in the current list — "when available", per the ask.
  const factionIdsInView = [...new Set(baseEntries.map((e) => e.factionId).filter(Boolean))];
  const entries = filterFaction ? baseEntries.filter((e) => e.factionId === filterFaction) : baseEntries;
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
  // GM-only: while reviewing a proposed edit, show the highlighted diff against
  // the live entry. On by default (it's the point of the review); reset whenever
  // the open entry changes.
  const [showDiff, setShowDiff] = useState(true);
  // setActiveCat clears the open entry itself (see App.jsx) — clearing it here
  // too would be a second URL change, i.e. two Back presses for one click.
  const selectCat = (id) => { setQueueMode(false); setQuery(""); setActiveCat(id); };
  const openQueue = () => { setQueueMode(true); setQuery(""); setSelectedId(null); };
  const selectEntry = (id) => { setPreviewOf(null); setImgError(null); setShowDiff(true); setSelectedId(id); };
  // Typing a query leaves the queue (results are live articles, not submissions).
  const onSearch = (v) => { setQuery(v); if (v) setQueueMode(false); };

  // Downscale/re-encode a picked raster file, upload it to Cloud Storage, and
  // store the download URL on the entry (not the image bytes themselves) — so
  // the picture only reaches a browser when this entry is actually opened,
  // instead of riding along in every session's sector sync. Rejects (with a
  // message) rather than pushing an oversized or unreachable image. `patch` is
  // whichever write path the current viewer has (GM or the entry's own
  // submitter) — see editForm below.
  async function onPickImage(entry, e, patch) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ""; // let the same file be re-picked after an error
    if (!file) return;
    setImgError(null);
    const res = await processImage(file);
    if (res.error) { setImgError(res.error); return; }
    try {
      const imageUrl = await uploadDataUri(`wikiImages/${SECTOR_ID}/${entry.id}.webp`, res.dataUri);
      patch(entry.id, { image: imageUrl });
    } catch (err) {
      setImgError("could not upload image — try again");
    }
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
  const searchBar = () => (
    <div style={{ padding: 8, borderBottom: `1px solid ${T.line}`, flexShrink: 0 }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
        <Search size={14} style={{ position: "absolute", left: 9, color: searching ? T.accent : T.faint, pointerEvents: "none" }} />
        <input value={query} onChange={(e) => onSearch(e.target.value)} placeholder="Search the codex…"
          style={{ ...inputStyle, padding: "7px 30px" }} />
        {query && (
          <button onClick={() => onSearch("")} title="Clear search"
            style={{ position: "absolute", right: 5, display: "flex", alignItems: "center", justifyContent: "center",
              background: "transparent", border: "none", color: T.faint, cursor: "pointer", padding: 4 }}>
            <X size={14} />
          </button>
        )}
      </div>
    </div>
  );

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
        const on = !queueMode && !searching && cat.id === activeCat;
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

  const sortFilterBar = () => (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      <div style={{ position: "relative", display: "flex", alignItems: "center", flex: "1 1 130px", minWidth: 130 }}>
        <ArrowUpDown size={12} style={{ position: "absolute", left: 7, color: T.faint, pointerEvents: "none" }} />
        <select value={sortMode} onChange={(e) => setSortMode(e.target.value)} title="Sort order"
          style={{ ...selStyle, paddingLeft: 24, fontSize: 11 }}>
          <option value="updated">Recently updated</option>
          <option value="created">Recently created</option>
          <option value="alpha">A–Z</option>
        </select>
      </div>
      {factionIdsInView.length > 0 && (
        <div style={{ position: "relative", display: "flex", alignItems: "center", flex: "1 1 130px", minWidth: 130 }}>
          <Filter size={12} style={{ position: "absolute", left: 7, color: filterFaction ? T.accent : T.faint, pointerEvents: "none" }} />
          <select value={filterFaction} onChange={(e) => setFilterFaction(e.target.value)} title="Filter by faction"
            style={{ ...selStyle, paddingLeft: 24, fontSize: 11,
              color: filterFaction ? (factionColor(filterFaction) || T.text) : T.text,
              borderColor: filterFaction ? (factionColor(filterFaction) || T.line) : T.line }}>
            <option value="">All factions</option>
            {factions.filter((f) => factionIdsInView.includes(f.id)).map((f) => (
              <option key={f.id} value={f.id} style={{ color: f.color }}>{f.name}</option>
            ))}
          </select>
        </div>
      )}
    </div>
  );

  const entryList = () => (
    <div className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 10,
      display: "flex", flexDirection: "column", gap: 6 }}>
      {sortFilterBar()}
      {searching && entries.length > 0 && (
        <div style={{ ...lbl, color: T.faint, padding: "0 2px 2px" }}>
          {entries.length} result{entries.length === 1 ? "" : "s"}
        </div>
      )}
      {entries.length === 0 && (
        <div style={{ fontSize: 11.5, color: T.faint, padding: "16px 8px", textAlign: "center",
          border: `1px dashed ${T.line}`, lineHeight: 1.6 }}>
          {searching
            ? `No entries match “${query.trim()}”.`
            : filterFaction && baseEntries.length > 0
              ? "No entries for this faction."
              : queueMode
                ? "Nothing waiting for review."
                : `No ${catMeta.label.toLowerCase()} entries yet.${canEdit ? " Add one below." : canSubmit ? " Draft one below." : ""}`}
        </div>
      )}
      {entries.map((e) => {
        const on = e.id === selectedId;
        // A GM draft — only the GM ever has one in their list (players never
        // receive drafts in `wiki`) — shows a "Draft" badge and hides the
        // restricted badge, which is moot while nobody but the GM can see it.
        const draft = canEdit && e.status === "draft";
        const restricted = canEdit && !draft && roles.length > 0 && isRestricted(e);
        const gmOnly = restricted && e.visibility.length === 0;
        const pending = e.status === "pending";
        const isEditProp = pending && !!e.editOf;
        const ready = pending && !!e.ready; // player has flagged it done
        const who = e.submittedBy && e.submittedBy.roleName;
        const fc = e.factionId ? factionColor(e.factionId) : null;
        return (
          <button key={e.id} onClick={() => selectEntry(e.id)}
            style={{ textAlign: "left", cursor: "pointer", background: on ? "rgba(159,194,58,.1)" : fc ? `${fc}1f` : T.panel2,
              border: `1px solid ${on ? T.accent : fc || T.line}`, borderRadius: 2, padding: "8px 10px", color: T.text,
              fontFamily: "inherit", display: "flex", flexDirection: "column", gap: 3 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span className="stencil" style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: 700, letterSpacing: ".03em",
                color: on ? T.accent : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {e.title || "Untitled"}
              </span>
              {pending && (
                <span title={`${isEditProp ? "Proposed edit" : "New entry"} · ${ready ? "Ready for review" : "Draft — still being written"}${who ? ` · ${who}` : ""}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0,
                    color: ready ? T.amber : T.faint, border: `1px solid ${ready ? T.amber : T.line}`,
                    borderRadius: 2, padding: "1px 4px", fontSize: 8.5, letterSpacing: ".08em", textTransform: "uppercase" }}>
                  {ready ? <Send size={9} /> : <Pencil size={9} />}
                  {queueMode ? (who || (ready ? "Ready" : "Draft")) : (ready ? "Submitted" : "Draft")}
                </span>
              )}
              {draft && (
                <span title="Draft — not published; only you can see this"
                  style={{ display: "inline-flex", alignItems: "center", gap: 3, flexShrink: 0, color: T.faint,
                    border: `1px solid ${T.line}`, borderRadius: 2, padding: "1px 4px", fontSize: 8.5,
                    letterSpacing: ".08em", textTransform: "uppercase" }}>
                  <EyeOff size={9} /> Draft
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
            {/* Results span every category, so tag each with the one it lives in. */}
            {searching && (
              <span style={{ ...lbl, fontSize: 8.5, color: T.faint }}>{catLabel(e.category)}</span>
            )}
          </button>
        );
      })}
      {canEdit && !queueMode && !searching && (
        <Btn kind="primary" onClick={() => addEntry(activeCat)} style={{ justifyContent: "center", marginTop: 2 }}>
          <Plus size={14} /> New {catMeta.label} entry
        </Btn>
      )}
      {canSubmit && !queueMode && !searching && (
        <Btn kind="primary" onClick={() => submitEntry(activeCat)} style={{ justifyContent: "center", marginTop: 2 }}>
          <Plus size={14} /> Draft new {catMeta.label.toLowerCase()} entry
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
            Pick an entry from the list to read it{canEdit ? ", or create a new one." : canSubmit ? ", or draft a new one." : "."}
          </div>
        </div>
      );
    }
    const catOf = WIKI_CATS.find((c) => c.id === selected.category) || catMeta;
    const CatIc = catOf.icon;
    const pending = selected.status === "pending";
    // A GM-authored page still held back from players (see App.addWikiEntry).
    const draft = canEdit && selected.status === "draft";
    // A player only ever gets the edit form back for their own not-yet-reviewed
    // submission — canSeeSubmission upstream already keeps anyone else's pending
    // entries out of `wiki`, so this can't fire for someone else's.
    const own = !canEdit && pending && isMine(selected);
    // Has the player flagged this submission as done? Purely a signal to the GM —
    // it never changes who can see the entry, only what the badge/banner say.
    const ready = pending && !!selected.ready;
    // A change proposal points back (via `editOf`) at the live entry it revises;
    // `original` is that entry (null if it's since been deleted).
    const isEditProposal = !!selected.editOf;
    const original = isEditProposal ? wiki.find((e) => e.id === selected.editOf) : null;
    // On a live entry, a player's own already-submitted proposal for it (if any),
    // so we offer "open it" rather than a second "propose an edit".
    const myPendingEdit = canSubmit && !pending
      ? wiki.find((e) => e.status === "pending" && e.editOf === selected.id && isMine(e))
      : null;
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
        {(selected.category === "characters" || selected.category === "locations") && (
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span style={lbl}>Faction</span>
            <select value={selected.factionId || ""} onChange={(e) => patch(selected.id, { factionId: e.target.value || null })}
              style={{ ...selStyle, width: "auto", minWidth: 130 }}>
              <option value="">— Unassigned —</option>
              {factions.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        )}
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
        {pending && (() => {
          const who = (selected.submittedBy && selected.submittedBy.roleName) || "a player";
          const origTitle = (original && original.title) || "a deleted entry";
          const editRef = isEditProposal ? `Proposed edit to "${origTitle}" by ${who}` : `Submitted by ${who}`;
          const msg = canEdit
            ? (ready
                ? `${editRef} — ready for your review.${isEditProposal ? " Approving replaces the live entry." : ""}`
                : (isEditProposal
                    ? `Proposed edit to "${origTitle}" by ${who} — still a draft; ${who} hasn't submitted it for review yet.`
                    : `Draft by ${who} — still being written; not submitted for review yet.`))
            : (ready
                ? "Submitted for review — the GM has been notified. You can still edit, or unsubmit to keep working."
                : (isEditProposal
                    ? "Draft edit — the live entry is unchanged. Submit it when you're ready for the GM to review."
                    : "Draft — only you and the GM can see this. Submit it when you're ready for the GM to review."));
          return (
            <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11,
              color: ready ? T.amber : T.mut, border: `1px solid ${ready ? T.amber : T.line}`, borderRadius: 2,
              padding: "6px 10px", background: ready ? "rgba(217,143,43,.1)" : "rgba(107,98,80,.08)" }}>
              {ready ? <Send size={13} style={{ flexShrink: 0 }} /> : <Pencil size={13} style={{ flexShrink: 0 }} />}
              {msg}
            </div>
          );
        })()}
        {draft && (
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.mut,
            border: `1px solid ${T.line}`, borderRadius: 2, padding: "6px 10px", background: "rgba(107,98,80,.08)" }}>
            <EyeOff size={13} style={{ flexShrink: 0 }} />
            Draft — only you can see this. Players won't see it, or get an Updates notification, until you publish.
          </div>
        )}
        {canEdit ? (
          <>
            {editForm(patchEntry)}
            {/* Visibility lives on the live entry, not the proposal — approving a
                change never rewrites it, so editing it here would be a no-op. */}
            {!isEditProposal && (
              <VisibilityRow roles={roles} value={selected.visibility}
                onChange={(v) => patchEntry(selected.id, { visibility: v })} />
            )}
            {isEditProposal && original && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, border: `1px solid ${T.line}`,
                borderRadius: 2, padding: 12, background: T.panel2 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span style={{ ...lbl, color: T.faint }}>Changes vs. live entry</span>
                  <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 12 }}>
                    {showDiff && <DiffLegend />}
                    <Btn onClick={() => setShowDiff((s) => !s)} title={showDiff ? "Hide the change highlights" : "Show what changed"}>
                      {showDiff ? <><EyeOff size={13} /> Hide</> : <><Eye size={13} /> Show changes</>}
                    </Btn>
                  </div>
                </div>
                {showDiff && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {selected.title !== original.title && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        <span style={{ ...lbl, color: T.faint }}>Title</span>
                        <CodexDiff before={original.title} after={selected.title} />
                      </div>
                    )}
                    {selected.category !== original.category && (
                      <div style={{ fontSize: 11, color: T.mut }}>
                        Category:{" "}
                        <span style={{ color: "#e0897d", textDecoration: "line-through" }}>{catLabel(original.category)}</span>
                        {" → "}
                        <span style={{ color: T.accent }}>{catLabel(selected.category)}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <span style={{ ...lbl, color: T.faint }}>Body</span>
                      <CodexDiff before={original.body} after={selected.body} />
                    </div>
                    {(original.image || "") !== (selected.image || "") && (
                      <div style={{ fontSize: 11, color: T.mut }}>
                        {!original.image ? <span style={{ color: T.accent }}>Image added.</span>
                          : !selected.image ? <span style={{ color: "#e0897d" }}>Image removed.</span>
                          : "Image replaced."}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {pending && (
                <Btn kind="primary" onClick={() => approveEntry(selected.id)}>
                  <CheckCircle2 size={14} /> {isEditProposal ? "Approve & apply" : "Approve & publish"}
                </Btn>
              )}
              {draft && (
                <Btn kind="primary" onClick={() => publishEntry(selected.id)}
                  title="Make this entry visible to players and announce it in their Updates">
                  <Globe size={14} /> Publish
                </Btn>
              )}
              {!pending && !draft && (
                <Btn onClick={() => unpublishEntry(selected.id)}
                  title="Hide this entry from players again while you rework it — publishing re-announces it">
                  <EyeOff size={14} /> Unpublish
                </Btn>
              )}
              <Btn kind="danger" onClick={() => deleteEntry(selected.id)}>
                <Trash2 size={14} /> {pending ? (isEditProposal ? "Reject (discard)" : "Reject (delete)") : "Delete entry"}
              </Btn>
            </div>
          </>
        ) : own ? (
          <>
            {editForm(patchOwnEntry)}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {ready ? (
                <Btn onClick={() => patchOwnEntry(selected.id, { ready: false })}
                  title="Take this back to a draft so you can keep working — the GM sees it's no longer ready">
                  <Undo2 size={14} /> Unsubmit
                </Btn>
              ) : (
                <Btn kind="primary" onClick={() => patchOwnEntry(selected.id, { ready: true })}
                  title="Tell the GM you're done and this is ready to review">
                  <Send size={14} /> Submit for review
                </Btn>
              )}
              <Btn kind="danger" onClick={() => withdrawEntry(selected.id)}>
                <Trash2 size={14} /> {isEditProposal ? "Discard proposed changes" : "Withdraw submission"}
              </Btn>
            </div>
          </>
        ) : (
          <>
            <div className="stencil" style={{ fontSize: 24, fontWeight: 800, letterSpacing: ".03em", color: T.text }}>
              {selected.title || "Untitled"}
            </div>
            {formatUpdatedAt(selected.updatedAt || selected.createdAt) && (
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: T.faint }}>
                <Clock size={11} /> Last updated {formatUpdatedAt(selected.updatedAt || selected.createdAt)}
              </div>
            )}
            {selected.submittedBy && (
              <div style={{ fontSize: 10.5, color: T.faint, fontStyle: "italic" }}>
                Submitted by {selected.submittedBy.roleName || "a player"}
              </div>
            )}
            {/* Players see the image section only when a picture is present. */}
            {selected.image && imageFrame(selected.image, isMobile ? 320 : 480, selected.title)}
            <CodexBody body={selected.body} isMobile={isMobile} />
            {/* A signed-in player can propose a change to this live entry; the GM
                reviews it before it goes live, same as a new-entry submission. */}
            {canSubmit && !pending && (myPendingEdit ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 11, color: T.amber,
                border: `1px solid ${T.amber}`, borderRadius: 2, padding: "8px 10px", background: "rgba(217,143,43,.1)" }}>
                <Clock size={13} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1 }}>
                  {myPendingEdit.ready ? "You have a proposed edit awaiting review." : "You have a draft edit in progress."}
                </span>
                <Btn onClick={() => selectEntry(myPendingEdit.id)}>
                  <Pencil size={13} /> Open it
                </Btn>
              </div>
            ) : (
              <Btn kind="primary" onClick={() => proposeEdit(selected.id)} style={{ alignSelf: "flex-start", marginTop: 4 }}>
                <Pencil size={14} /> Propose an edit
              </Btn>
            ))}
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
            {searchBar()}
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
        {searchBar()}
        {categoryRail(true)}
        {entryList()}
      </div>
      {detail(null)}
    </div>
  );
}
