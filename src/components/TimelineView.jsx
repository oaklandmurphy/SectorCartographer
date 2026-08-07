import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { History, Newspaper, LayoutList, FileText, Clock, Check, X, Pencil, ExternalLink } from "lucide-react";
import { T, F, lbl, inputStyle, cut } from "../theme.js";
import { WIKI_CATS } from "../constants.js";
import Btn from "./ui/Btn.jsx";
import CodexBody from "./CodexBody.jsx";

// The article date the timeline sorts and buckets on: when the page was
// published (publishedAt) — the moment it became a real article — falling back
// to when it was first drafted, then its last edit, for legacy entries that
// predate the publishedAt stamp. A news article about a turn's events is
// published around that turn, so its publish time is the closest thing to
// "when it happened" the codex records.
const articleDate = (e) => e.publishedAt || e.createdAt || e.updatedAt || 0;
const catMeta = (id) => WIKI_CATS.find((c) => c.id === id) || { label: id, icon: FileText };

const fmtFull = (ms) => (ms ? new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(ms)) : null);
const fmtShort = (ms) => (ms ? new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(new Date(ms)) : "");

// <input type="datetime-local"> speaks a local "YYYY-MM-DDTHH:mm" string, not an
// epoch — convert both ways, and keep the value in local time so the GM types
// the wall-clock time they mean rather than a UTC offset.
function toLocalInput(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v) {
  if (!v) return null;
  const ms = new Date(v).getTime();
  return Number.isFinite(ms) ? ms : null;
}

// A horizontal, left-to-right campaign timeline: codex articles laid out as
// boxes in three staggered rows above an axis, each box stemming down to its
// exact spot, the whole thing split into turn columns. Which turn an article
// falls in comes from comparing its date against the recorded turn-start times
// (stamped by Next Turn, adjustable here by the GM). News only by default, with
// a toggle for every category. Clicking a box opens its article inline below the
// strip rather than leaving for the Codex.
export default function TimelineView({ wiki, factions, turns, turnNumber, isGM, isMobile, goToCodex, setTurnStart, setTurnName }) {
  const [showAll, setShowAll] = useState(false);
  const [selectedId, setSelectedId] = useState(null); // article shown in the reader below
  const [editingTurn, setEditingTurn] = useState(null); // turn number the GM is editing (start time + name)
  const [draft, setDraft] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [hoverId, setHoverId] = useState(null);
  const stripRef = useRef(null);
  const readerRef = useRef(null);

  const factionColor = (id) => (factions.find((f) => f.id === id) || {}).color || null;

  // The turn-start records that actually have a time, in turn order. The Timeline
  // treats these as the boundaries between turns.
  const marks = useMemo(
    () => (turns || []).filter((t) => Number.isFinite(t.startedAt) && t.startedAt > 0).sort((a, b) => a.turn - b.turn),
    [turns],
  );
  const startOf = (turn) => {
    const m = marks.find((x) => x.turn === turn);
    return m ? m.startedAt : null;
  };
  // The GM's name for a turn, if any. Read straight from `turns` (not `marks`) —
  // a turn can be named without having a start time set.
  const nameOf = (turn) => {
    const m = (turns || []).find((x) => x.turn === turn);
    return (m && m.name) || "";
  };
  // The turn a given date belongs to: the highest turn whose recorded start is at
  // or before the date. A date earlier than every recorded start belongs to the
  // turn just before the earliest one (never below 0). Robust to a GM setting
  // non-monotonic starts — it picks the max qualifying turn rather than assuming
  // order — which is why it can't just walk the sorted list and break.
  const turnOfDate = useMemo(() => (d) => {
    let best = null;
    for (const m of marks) if (d >= m.startedAt && (best === null || m.turn > best)) best = m.turn;
    if (best !== null) return best;
    return marks.length ? Math.max(0, marks[0].turn - 1) : 0;
  }, [marks]);

  // The articles that go on the timeline: published pages (never drafts or
  // pending submissions) that carry a date, filtered to news unless "All" is on,
  // sorted oldest-first and tagged with the turn they fall in.
  const shown = useMemo(() => {
    const base = (wiki || []).filter((e) => e.status !== "pending" && e.status !== "draft" && articleDate(e) > 0);
    const filtered = showAll ? base : base.filter((e) => e.category === "news");
    return filtered
      .map((e) => ({ ...e, _date: articleDate(e) }))
      .sort((a, b) => a._date - b._date)
      .map((e) => ({ ...e, turnIndex: turnOfDate(e._date) }));
  }, [wiki, showAll, turnOfDate]);

  // How far the axis runs: through the current turn, plus any turn an article or
  // a recorded start reaches beyond it. Columns cover 0..endTurn inclusive, so
  // even turns with nothing in them still show as a segment of elapsed time.
  const endTurn = useMemo(() => {
    let m = Number(turnNumber) || 0;
    for (const mk of marks) m = Math.max(m, mk.turn);
    for (const a of shown) m = Math.max(m, a.turnIndex);
    return Math.max(0, m);
  }, [turnNumber, marks, shown]);

  const byTurn = useMemo(() => {
    const map = new Map();
    for (const a of shown) {
      if (!map.has(a.turnIndex)) map.set(a.turnIndex, []);
      map.get(a.turnIndex).push(a); // already oldest-first from `shown`
    }
    return map;
  }, [shown]);

  /* ------------------------------------------------ layout geometry
     Boxes are centered on their tick and cycle through three rows so neighbours
     never collide; a column widens to fit its articles (and no narrower than a
     readable minimum), so busy turns take more of the axis than quiet ones. */
  const BOX_W = isMobile ? 132 : 164;
  const BOX_H = isMobile ? 58 : 66;
  const SLOT = isMobile ? 96 : 118;         // horizontal room per article tick
  const EDGE_PAD = BOX_W / 2 + 12;          // keeps a column's end boxes off its edges
  const COL_MIN_W = Math.max(184, EDGE_PAD * 2);
  const ROWS = 3;
  const ROW_STEP = BOX_H + 14;
  const HEADER_H = 68;                       // room for the turn label, its name, and start time
  const TOP_PAD = 8;
  const STEM_EXTRA = 34;                     // stem length below the lowest row
  const AXIS_Y = HEADER_H + TOP_PAD + (ROWS - 1) * ROW_STEP + BOX_H + STEM_EXTRA;
  const TOTAL_H = AXIS_Y + 30;
  const rowTop = (r) => HEADER_H + TOP_PAD + r * ROW_STEP;

  // Turn columns, left-to-right, with each article's tick position and stagger
  // row resolved. The row counter runs across the whole timeline (not per turn)
  // so the three-row rhythm stays unbroken across turn boundaries.
  const columns = useMemo(() => {
    let gi = 0;
    const list = [];
    for (let turn = 0; turn <= endTurn; turn += 1) {
      const arts = byTurn.get(turn) || [];
      const width = Math.max(COL_MIN_W, arts.length * SLOT + EDGE_PAD * 2);
      const placed = arts.map((a, i) => {
        const x = EDGE_PAD + (i + 0.5) * SLOT;
        const row = gi % ROWS;
        gi += 1;
        return { a, x, row };
      });
      list.push({ turn, width, placed });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byTurn, endTurn, isMobile]);

  const fullEmpty = shown.length === 0 && endTurn === 0 && marks.length === 0;

  // Vertical wheel scrolls the strip sideways while the pointer is over it. React's
  // onWheel is passive (preventDefault would no-op), so bind a native non-passive
  // listener instead. Re-bound when the strip appears (it isn't rendered in the
  // empty state). Horizontal wheel/trackpad input still passes through untouched.
  useEffect(() => {
    const el = stripRef.current;
    if (!el) return undefined;
    const onWheel = (e) => {
      if (el.scrollWidth <= el.clientWidth) return; // nothing to scroll sideways
      const delta = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
      if (!delta) return;
      el.scrollLeft += delta;
      e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [fullEmpty]);

  // The article shown in the reader below — looked up in the full list so its
  // body is available even when the strip is filtered to News only. Clears itself
  // if the entry is gone (deleted, or no longer visible to this viewer).
  const selected = selectedId ? (wiki || []).find((e) => e.id === selectedId) : null;
  useEffect(() => {
    if (selectedId && !(wiki || []).some((e) => e.id === selectedId)) setSelectedId(null);
  }, [wiki, selectedId]);
  // Start each newly opened article at the top of the reader.
  useEffect(() => { if (readerRef.current) readerRef.current.scrollTop = 0; }, [selectedId]);

  const openEditor = (turn) => {
    setEditingTurn(turn);
    setDraft(toLocalInput(startOf(turn)));
    setNameDraft(nameOf(turn));
  };

  const toggle = (
    <div style={{ display: "flex", gap: 3, background: T.panel3, padding: 3, border: `1px solid ${T.line}` }}>
      <Btn active={!showAll} onClick={() => setShowAll(false)} title="Show only News articles"
        style={{ border: "none", borderRadius: 0, justifyContent: "center" }}>
        <Newspaper size={13} /> News
      </Btn>
      <Btn active={showAll} onClick={() => setShowAll(true)} title="Show articles from every category"
        style={{ border: "none", borderRadius: 0, justifyContent: "center" }}>
        <LayoutList size={13} /> All
      </Btn>
    </div>
  );

  const header = (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", padding: isMobile ? "12px 14px" : "14px 20px",
      borderBottom: `1px solid ${T.line}`, flexShrink: 0 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <History size={20} color={T.accent} />
        <div className="stencil" style={{ fontSize: isMobile ? 17 : 20, letterSpacing: ".05em", color: T.text }}>TIMELINE</div>
      </div>
      <span className="mono" style={{ fontSize: 10.5, color: T.faint }}>
        {shown.length} article{shown.length === 1 ? "" : "s"}
      </span>
      <div style={{ marginLeft: "auto" }}>{toggle}</div>
    </div>
  );

  // Nothing recorded at all — no articles, no turns advanced. Show a hint rather
  // than an empty axis.
  if (fullEmpty) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: T.void }}>
        {header}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          gap: 12, color: T.faint, padding: 24, textAlign: "center" }}>
          <History size={40} strokeWidth={1.2} />
          <div className="stencil" style={{ fontSize: 15, letterSpacing: ".06em", color: T.mut }}>NOTHING ON THE TIMELINE YET</div>
          <div style={{ fontSize: 11.5, lineHeight: 1.6, maxWidth: 340 }}>
            {showAll
              ? "Published codex articles appear here in chronological order once they carry a date."
              : "News articles appear here in chronological order. Toggle “All” to place every category, or add a News article in the Codex."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", background: T.void }}>
      {header}

      {/* The scrolling strip — fixed height so the reader below always has room;
          vertical wheel is redirected to horizontal (see the effect above). */}
      <div ref={stripRef} className="scroll" style={{ flexShrink: 0, height: TOTAL_H, overflowX: "auto", overflowY: "hidden" }}>
        <div style={{ display: "flex", height: TOTAL_H, width: "max-content", minWidth: "100%", position: "relative" }}>
          {columns.map((col) => {
            const isCurrent = col.turn === (Number(turnNumber) || 0);
            const start = startOf(col.turn);
            const turnName = nameOf(col.turn);
            return (
              <div key={col.turn} style={{ position: "relative", width: col.width, height: TOTAL_H, flex: "0 0 auto",
                borderLeft: `1px ${isCurrent ? "solid" : "dashed"} ${isCurrent ? T.accent : T.line}` }}>

                {/* Turn header band */}
                <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: HEADER_H,
                  padding: "8px 10px", background: isCurrent ? "rgba(159,194,58,.06)" : "transparent",
                  borderBottom: `1px solid ${T.line}`, display: "flex", flexDirection: "column", gap: 2, overflow: "hidden" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span className="stencil" style={{ fontSize: 13, fontWeight: 800, letterSpacing: ".05em",
                      color: isCurrent ? T.accent : T.text }}>
                      CYCLE {col.turn}
                    </span>
                    {isCurrent && (
                      <span className="mono" style={{ fontSize: 8, letterSpacing: ".1em", textTransform: "uppercase",
                        color: T.accent, border: `1px solid ${T.accent}`, borderRadius: 2, padding: "0 4px" }}>Current</span>
                    )}
                    {isGM && (
                      <button onClick={() => openEditor(col.turn)} title="Name this cycle or set when it began"
                        style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", padding: 2,
                          color: T.faint, display: "flex" }}>
                        <Pencil size={12} />
                      </button>
                    )}
                  </div>
                  {/* The GM's name for this turn — the headline. Players see nothing
                      for an unnamed turn; the GM sees a faint prompt to add one. */}
                  {(turnName || isGM) && (
                    <div title={turnName || undefined}
                      style={{ fontFamily: F.body, fontSize: 12.5, fontWeight: turnName ? 600 : 400,
                        fontStyle: turnName ? "normal" : "italic", lineHeight: 1.2,
                        color: turnName ? (isCurrent ? T.accent : T.text) : T.faint,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {turnName || "Unnamed cycle"}
                    </div>
                  )}
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 9.5,
                    color: start ? T.mut : T.faint, minWidth: 0 }}>
                    <Clock size={10} style={{ flexShrink: 0 }} />
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {start ? fmtFull(start) : (isGM ? "Set a start time…" : "No start time set")}
                    </span>
                  </div>
                </div>

                {/* GM inline editor for this turn's name and start */}
                {isGM && editingTurn === col.turn && (
                  <div style={{ position: "absolute", top: 6, left: 8, zIndex: 30, width: 236, background: T.panel,
                    border: `1px solid ${T.accent}`, ...cut(6), padding: 10, display: "flex", flexDirection: "column", gap: 8,
                    boxShadow: "0 12px 28px rgba(0,0,0,.6)" }}>
                    <span style={lbl}>Cycle {col.turn} — name</span>
                    <input type="text" value={nameDraft} maxLength={60} placeholder="e.g. The Siege of Kessler"
                      onChange={(e) => setNameDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { setTurnName(col.turn, nameDraft); setTurnStart(col.turn, fromLocalInput(draft)); setEditingTurn(null); } }}
                      style={{ ...inputStyle }} />
                    <span style={lbl}>Start time</span>
                    <input type="datetime-local" value={draft} onChange={(e) => setDraft(e.target.value)}
                      style={{ ...inputStyle, fontFamily: F.mono }} />
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <Btn kind="primary" onClick={() => { setTurnName(col.turn, nameDraft); setTurnStart(col.turn, fromLocalInput(draft)); setEditingTurn(null); }}>
                        <Check size={12} /> Save
                      </Btn>
                      {start != null && (
                        <Btn onClick={() => { setTurnStart(col.turn, null); setEditingTurn(null); }} title="Remove this cycle's start time (keeps its name)">
                          <X size={12} /> Clear time
                        </Btn>
                      )}
                      <Btn onClick={() => setEditingTurn(null)} style={{ marginLeft: "auto" }}>Cancel</Btn>
                    </div>
                    <span style={{ fontSize: 9.5, color: T.faint, lineHeight: 1.5 }}>
                      The name labels this cycle on the timeline. Articles dated on or after the start move into Cycle {col.turn}.
                    </span>
                  </div>
                )}

                {/* Axis segment for this column (segments abut into one continuous line) */}
                <div style={{ position: "absolute", left: 0, right: 0, top: AXIS_Y, height: 2, background: T.line }} />
                {/* Turn-start node on the axis */}
                <div title={start ? fmtFull(start) : undefined}
                  style={{ position: "absolute", left: -4, top: AXIS_Y - 3, width: 8, height: 8, transform: "rotate(45deg)",
                    background: isCurrent ? T.accent : T.line, border: `1px solid ${T.void}` }} />

                {/* Articles: stem + axis dot + box */}
                {col.placed.map(({ a, x, row }) => {
                  const fc = a.factionId ? factionColor(a.factionId) : null;
                  const stemColor = fc || T.accent;
                  const active = selectedId === a.id;
                  const on = active || hoverId === a.id;
                  const Ic = catMeta(a.category).icon;
                  const boxTop = rowTop(row);
                  return (
                    <Fragment key={a.id}>
                      <div style={{ position: "absolute", left: x - 1, top: boxTop + BOX_H, width: 2,
                        height: AXIS_Y - (boxTop + BOX_H), background: stemColor, opacity: on ? 1 : 0.55 }} />
                      <div style={{ position: "absolute", left: x - 4, top: AXIS_Y - 4, width: 8, height: 8, borderRadius: "50%",
                        background: stemColor, border: `1px solid ${T.void}`, opacity: on ? 1 : 0.85 }} />
                      <button onClick={() => setSelectedId((cur) => (cur === a.id ? null : a.id))}
                        onMouseEnter={() => setHoverId(a.id)} onMouseLeave={() => setHoverId((h) => (h === a.id ? null : h))}
                        title={`${a.title || "Untitled"} — ${fmtFull(a._date)}`}
                        style={{ position: "absolute", left: x - BOX_W / 2, top: boxTop, width: BOX_W, height: BOX_H,
                          textAlign: "left", cursor: "pointer", display: "flex", flexDirection: "column", gap: 3,
                          background: on ? "rgba(159,194,58,.14)" : (fc ? `${fc}1f` : T.panel2),
                          border: `1px solid ${active ? T.accent : (on ? T.accent : (fc || T.line))}`, borderRadius: 2, padding: "6px 8px",
                          color: T.text, fontFamily: "inherit", overflow: "hidden",
                          boxShadow: active ? `0 0 0 1px ${T.accent}, 0 6px 16px rgba(0,0,0,.55)`
                            : on ? "0 6px 16px rgba(0,0,0,.55)" : "0 3px 9px rgba(0,0,0,.4)", transition: "all .1s" }}>
                        <span style={{ fontFamily: F.body, fontSize: isMobile ? 12.5 : 13, fontWeight: 400,
                          letterSpacing: ".005em", lineHeight: 1.28,
                          color: on ? T.accent : T.text, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
                          overflow: "hidden" }}>
                          {a.title || "Untitled"}
                        </span>
                        <span style={{ marginTop: "auto", display: "flex", alignItems: "center", gap: 5, fontSize: 10,
                          fontFamily: F.body, color: T.mut, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                          <Ic size={10} style={{ flexShrink: 0 }} /> {catMeta(a.category).label} · {fmtShort(a._date)}
                        </span>
                      </button>
                    </Fragment>
                  );
                })}

                {/* Empty-turn hint */}
                {col.placed.length === 0 && (
                  <div style={{ position: "absolute", left: 0, right: 0, top: rowTop(1), textAlign: "center",
                    fontSize: 9.5, color: T.faint, letterSpacing: ".08em", textTransform: "uppercase" }}>
                    —
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* The reader — the selected article, rendered inline below the strip. */}
      <div ref={readerRef} className="scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto",
        borderTop: `2px solid ${T.line}`, background: T.panel }}>
        {selected ? (() => {
          const Ic = catMeta(selected.category).icon;
          const fc = selected.factionId ? factionColor(selected.factionId) : null;
          const faction = selected.factionId ? factions.find((f) => f.id === selected.factionId) : null;
          return (
            <div style={{ maxWidth: 820, margin: "0 auto", padding: isMobile ? 16 : "22px 24px",
              display: "flex", flexDirection: "column", gap: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ display: "inline-flex", alignItems: "center", gap: 6, ...lbl, color: T.accent }}>
                  <Ic size={13} /> {catMeta(selected.category).label}
                </span>
                {faction && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: T.mut }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: fc || T.faint }} />
                    {faction.name}
                  </span>
                )}
                <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
                  <Btn onClick={() => goToCodex(selected.id)} title="Open this article in the Codex">
                    <ExternalLink size={13} /> {!isMobile && "Open in Codex"}
                  </Btn>
                  <Btn onClick={() => setSelectedId(null)} title="Close">
                    <X size={13} /> {!isMobile && "Close"}
                  </Btn>
                </div>
              </div>
              <div className="stencil" style={{ fontSize: isMobile ? 22 : 26, fontWeight: 800, letterSpacing: ".03em", color: T.text }}>
                {selected.title || "Untitled"}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: T.faint }}>
                <Clock size={11} /> {fmtFull(articleDate(selected))}
              </div>
              {selected.image && (
                <div style={{ border: `1px solid ${T.line}`, background: T.panel3, padding: 6, alignSelf: "flex-start",
                  maxWidth: "100%", borderRadius: 2 }}>
                  <img src={selected.image} alt={selected.title || ""}
                    style={{ display: "block", maxWidth: "100%", maxHeight: isMobile ? 320 : 440 }} />
                </div>
              )}
              <CodexBody body={selected.body} isMobile={isMobile} />
            </div>
          );
        })() : (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%",
            gap: 8, color: T.faint, padding: 24, textAlign: "center" }}>
            <FileText size={26} strokeWidth={1.3} />
            <div style={{ fontSize: 11.5, lineHeight: 1.6, maxWidth: 320 }}>
              Select an event on the timeline to read its article here.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
