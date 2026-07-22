import { useEffect, useMemo, useRef, useState } from "react";
import { Users, Plus, Maximize2, Network, User, Star } from "lucide-react";
import { T, cut, sceneBackdrop, floatingPanel } from "../theme.js";
import { SUBNODE_ZOOM, RELATION_TYPES, relationType } from "../constants.js";
import { usePoliticsInteractions } from "../hooks/usePoliticsInteractions.js";
import TargetBrackets from "./ui/TargetBrackets.jsx";
import Starfield from "./ui/Starfield.jsx";
import FactionPopup from "./FactionPopup.jsx";
import MemberPopup from "./MemberPopup.jsx";

const NODE_R = 62;   // collapsed faction badge radius, world units
const CARD_W = 300;  // expanded roster card width, screen px

function popupPos(w2s, containerSize, wx, wy, cardW, cardH) {
  const s = w2s(wx, wy);
  let x = s.x + 40, y = s.y - 24;
  if (x + cardW + 10 > containerSize.w) x = s.x - cardW - 40;
  x = Math.min(Math.max(8, x), Math.max(8, containerSize.w - cardW - 8));
  y = Math.min(Math.max(8, y), Math.max(8, containerSize.h - cardH - 8));
  return { x, y };
}

export default function PoliticsView({
  factions, relations, canEdit, isMobile, wiki,
  patchFaction, addFaction, deleteFaction, setRelation,
  addMember, patchMember, removeMember,
  goToCodex, createEntry,
}) {
  const [view, setView] = useState({ scale: 0.72, ox: 400, oy: 300 });
  const [selFac, setSelFac] = useState(null);
  const [selMem, setSelMem] = useState(null); // { facId, memId }
  const centeredRef = useRef(false);

  // node center in world space — the stored px/py, or an auto circular layout
  // for factions created before this view existed (older saves).
  const nodePos = useMemo(() => {
    const out = {}; const n = factions.length;
    factions.forEach((f, i) => {
      if (typeof f.px === "number" && typeof f.py === "number") out[f.id] = { x: f.px, y: f.py };
      else {
        const ang = -Math.PI / 2 + i * ((Math.PI * 2) / Math.max(1, n));
        out[f.id] = { x: Math.cos(ang) * 260, y: Math.sin(ang) * 260 };
      }
    });
    return out;
  }, [factions]);

  const { mapRef, containerSize, onBackgroundPointerDown, startFactionDrag } = usePoliticsInteractions({
    view, setView, canEdit,
    onFactionTap: (id) => { setSelMem(null); setSelFac(id); },
    onFactionMove: (id, px, py) => patchFaction(id, { px, py }),
    onBackgroundTap: () => { setSelFac(null); setSelMem(null); },
  });

  const w2s = (x, y) => ({ x: x * view.scale + view.ox, y: y * view.scale + view.oy });
  const centerView = () => setView({ scale: 0.72, ox: containerSize.w / 2, oy: containerSize.h / 2 });

  // center the sector's faction layout on first load
  useEffect(() => {
    if (!centeredRef.current && containerSize.w > 1) { centeredRef.current = true; centerView(); }
    // eslint-disable-next-line
  }, [containerSize]);

  const showMembers = view.scale >= SUBNODE_ZOOM;
  const selFacObj = factions.find((f) => f.id === selFac) || null;
  const selMemFac = selMem ? factions.find((f) => f.id === selMem.facId) : null;
  const selMemObj = selMemFac ? (selMemFac.members || []).find((m) => m.id === selMem.memId) : null;

  return (
    <div ref={mapRef} style={{ ...sceneBackdrop, cursor: "grab" }}>

      {/* gesture surface — empty-space pan / tap-to-deselect */}
      <div onPointerDown={onBackgroundPointerDown}
        style={{ position: "absolute", inset: 0, zIndex: 1, touchAction: "none", cursor: "grab" }} />

      <Starfield zIndex={2} />

      {/* relationship edges */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 4 }}>
        {relations.map((r) => {
          const A = nodePos[r.a], B = nodePos[r.b];
          if (!A || !B) return null;
          const p = w2s(A.x, A.y), q = w2s(B.x, B.y);
          const meta = relationType(r.type);
          const width = meta.width * Math.min(1.4, Math.max(0.55, view.scale));
          return (
            <g key={r.id}>
              <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={meta.color} strokeOpacity={0.16} strokeWidth={width + 6} />
              <line x1={p.x} y1={p.y} x2={q.x} y2={q.y} stroke={meta.color} strokeOpacity={0.8}
                strokeWidth={width} strokeDasharray={meta.dash || undefined} strokeLinecap="round" />
            </g>
          );
        })}
      </svg>

      {/* relationship edge labels */}
      {view.scale >= 0.5 && relations.map((r) => {
        const A = nodePos[r.a], B = nodePos[r.b];
        if (!A || !B) return null;
        const p = w2s(A.x, A.y), q = w2s(B.x, B.y);
        const mx = (p.x + q.x) / 2, my = (p.y + q.y) / 2;
        const meta = relationType(r.type); const Ic = meta.icon;
        return (
          <div key={`lbl_${r.id}`} style={{ position: "absolute", left: mx, top: my, transform: "translate(-50%,-50%)",
            zIndex: 5, pointerEvents: "none", display: "flex", alignItems: "center", gap: 5,
            background: `${T.panel}e6`, border: `1px solid ${meta.color}`, ...cut(5), padding: "3px 8px",
            color: meta.color, fontFamily: "'Oswald', sans-serif", fontSize: 12.5, fontWeight: 600,
            letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
            <Ic size={13} /> {meta.label}
          </div>
        );
      })}

      {/* faction nodes */}
      {factions.map((f) => {
        const c = nodePos[f.id]; const p = w2s(c.x, c.y);
        const isSel = selFac === f.id && !selMem;
        const members = f.members || [];
        const starred = members.filter((m) => m.star);
        const listed = members.filter((m) => !m.star);
        const isMemSel = (m) => selMem && selMem.facId === f.id && selMem.memId === m.id;
        const pickMember = (e, m) => { e.stopPropagation(); setSelFac(null); setSelMem({ facId: f.id, memId: m.id }); };

        // zoomed out: compact square badge (cut corners) with sigil + count
        if (!showMembers) {
          const screenR = NODE_R * view.scale;
          return (
            <div key={f.id} onPointerDown={(e) => startFactionDrag(e, f.id, c.x, c.y)}
              style={{ position: "absolute", left: p.x, top: p.y, transform: "translate(-50%,-50%)",
                width: screenR * 2, height: screenR * 2, touchAction: "none",
                zIndex: isSel ? 22 : 12, cursor: canEdit ? "grab" : "pointer" }}>
              <div style={{ position: "absolute", inset: 0, ...cut(Math.max(6, 13 * view.scale)),
                background: `radial-gradient(circle at 50% 34%, ${f.color}66, ${f.color}3a 60%, ${f.color}26 100%), ${T.panel}`,
                border: `2px solid ${f.color}`,
                boxShadow: `0 0 ${16 * view.scale}px ${f.color}44, inset 0 0 ${22 * view.scale}px ${f.color}22` }} />
              {isSel && <TargetBrackets color={T.accent} inset={-5} armLen={Math.max(8, 11 * view.scale)} thick={2} />}
              <div className="stencil" style={{ position: "absolute", left: "50%", top: 0, transform: "translate(-50%,-130%)",
                whiteSpace: "nowrap", background: `${T.panel}f0`, border: `1px solid ${f.color}`, ...cut(4),
                padding: "2px 8px", fontSize: 12.5, fontWeight: 700, letterSpacing: ".04em", color: T.text,
                boxShadow: "0 2px 6px rgba(0,0,0,.5)" }}>{f.name}</div>
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 2, color: f.color, pointerEvents: "none" }}>
                <Users size={Math.max(13, 20 * view.scale)} />
                <span className="mono" style={{ fontSize: Math.max(10, 13 * view.scale), color: T.mut }}>{members.length}</span>
              </div>
            </div>
          );
        }

        // zoomed in: roster card — portrait grid for important characters, list for the rest
        return (
          <div key={f.id} onPointerDown={(e) => startFactionDrag(e, f.id, c.x, c.y)}
            style={{ position: "absolute", left: p.x, top: p.y, transform: "translate(-50%,-50%)",
              width: CARD_W, touchAction: "none", zIndex: isSel ? 22 : 12, cursor: canEdit ? "grab" : "pointer" }}>
            {isSel && <TargetBrackets color={T.accent} inset={-6} armLen={16} thick={2.5} />}
            <div style={{ ...cut(15), overflow: "hidden", background: `${T.panel}f5`,
              border: `2px solid ${f.color}`, boxShadow: `0 0 18px ${f.color}40, 0 12px 30px rgba(0,0,0,.6)` }}>

              {/* header / name plate */}
              <div className="stencil" style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 13px",
                borderBottom: `1px solid ${f.color}55`, background: `linear-gradient(${f.color}26, transparent)` }}>
                <Users size={17} style={{ color: f.color, flexShrink: 0 }} />
                <span style={{ flex: 1, minWidth: 0, fontSize: 16.5, fontWeight: 700, letterSpacing: ".04em",
                  color: T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                <span className="mono" style={{ fontSize: 12.5, color: T.faint }}>{members.length}</span>
              </div>

              {members.length === 0 && (
                <div style={{ padding: "16px 13px", textAlign: "center", color: T.faint, fontSize: 13 }}>no characters</div>
              )}

              {/* important characters: uniform portrait grid, always 3 across */}
              {starred.length > 0 && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 10, padding: 12 }}>
                  {starred.map((m) => {
                    const sel = isMemSel(m);
                    const codexEntry = m.wikiId ? wiki.find((e) => e.id === m.wikiId) : null;
                    const portrait = codexEntry && codexEntry.image;
                    return (
                      <div key={m.id} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => pickMember(e, m)}
                        title={`${m.name}${m.role ? " · " + m.role : ""}`} style={{ minWidth: 0, cursor: "pointer", textAlign: "center" }}>
                        <div style={{ position: "relative", width: "100%", aspectRatio: "1 / 1", ...cut(5), overflow: "hidden",
                          background: portrait ? "#000" : `linear-gradient(150deg, ${f.color}, ${f.color}aa 60%, #000 150%)`,
                          border: `2px solid ${sel ? T.accent : "#14110b"}`, display: "flex",
                          alignItems: "center", justifyContent: "center", color: "#0f0d08",
                          boxShadow: "inset 0 1px 2px rgba(255,255,255,.15), 0 2px 4px rgba(0,0,0,.6)" }}>
                          {portrait
                            ? <img src={portrait} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }} />
                            : <User size={34} />}
                          <Star size={13} style={{ position: "absolute", top: 3, right: 3, color: T.amber, fill: T.amber }} />
                        </div>
                        <div className="mono" style={{ marginTop: 5, fontSize: 12, lineHeight: 1.3,
                          color: sel ? T.accent : T.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {m.name}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {starred.length > 0 && listed.length > 0 && (
                <div style={{ height: 1, background: T.line, margin: "0 12px 3px" }} />
              )}

              {/* everyone else: compact list */}
              {listed.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 1, padding: "6px 8px 11px" }}>
                  {listed.map((m) => {
                    const sel = isMemSel(m);
                    return (
                      <div key={m.id} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => pickMember(e, m)}
                        title={`${m.name}${m.role ? " · " + m.role : ""}`}
                        style={{ display: "flex", alignItems: "center", gap: 9, padding: "5px 7px", cursor: "pointer",
                          borderRadius: 2, background: sel ? `${T.accent}22` : "transparent" }}>
                        <span style={{ width: 9, height: 9, flexShrink: 0, ...cut(2), background: f.color, border: "1px solid #14110b" }} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 14, color: sel ? T.accent : T.text,
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</span>
                        {m.role && (
                          <span style={{ flexShrink: 1, minWidth: 0, maxWidth: 120, fontSize: 12, color: T.faint,
                            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.role}</span>
                        )}
                        {m.wikiId && <span style={{ width: 6, height: 6, flexShrink: 0, borderRadius: "50%",
                          background: T.accent }} title="Has codex entry" />}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* CRT scan-line texture */}
      <div className="scanlines" style={{ position: "absolute", inset: 0, zIndex: 31, opacity: 0.5, pointerEvents: "none" }} />

      {/* floating toolbar */}
      <div style={{ position: "absolute", left: 12, top: 12, zIndex: 34, display: "flex", gap: 8, flexWrap: "wrap" }}>
        {canEdit && (
          <button onClick={() => addFaction()} title="Add a faction"
            style={{ display: "flex", alignItems: "center", gap: 7, background: "rgba(159,194,58,.14)",
              border: `1px solid rgba(159,194,58,.5)`, ...cut(7), color: T.accent, cursor: "pointer", padding: "9px 14px",
              fontFamily: "'Oswald', sans-serif", fontSize: 14, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>
            <Plus size={17} /> Faction
          </button>
        )}
        <button onClick={centerView} title="Reset view"
          style={{ display: "flex", alignItems: "center", gap: 7, background: `${T.panel}e6`,
            border: `1px solid ${T.line}`, ...cut(7), color: T.text, cursor: "pointer", padding: "9px 14px",
            fontFamily: "'Oswald', sans-serif", fontSize: 14, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>
          <Maximize2 size={17} /> Reset
        </button>
      </div>

      {/* legend */}
      <div style={{ position: "absolute", right: 12, bottom: 10, zIndex: 32, padding: "10px 14px",
        pointerEvents: "none", maxWidth: 240, ...floatingPanel }}>
        <div className="stencil" style={{ fontSize: 13, letterSpacing: ".1em", color: T.mut, marginBottom: 7 }}>RELATIONS</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {RELATION_TYPES.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ width: 26, height: 0, borderTop: `${Math.max(2, r.width)}px ${r.dash ? "dashed" : "solid"} ${r.color}`, flexShrink: 0 }} />
              <span style={{ fontSize: 13, color: T.text, fontFamily: "'Oswald', sans-serif", letterSpacing: ".02em" }}>{r.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* hint */}
      <div style={{ position: "absolute", left: 12, bottom: 10, zIndex: 32, pointerEvents: "none",
        padding: "9px 13px", fontSize: 13, color: T.mut, maxWidth: 420, lineHeight: 1.5, ...floatingPanel }}>
        <Network size={15} style={{ color: T.accent, verticalAlign: "-2px", marginRight: 6 }} />
        {canEdit
          ? <span><b style={{ color: T.text }}>Politics</b> · drag factions to arrange · click one to edit its relations & characters · <b style={{ color: T.amber }}>zoom in</b> to reveal the characters inside each faction</span>
          : <span><b style={{ color: T.amber }}>View only</b> · click a faction for its characters & relations · <b style={{ color: T.amber }}>zoom in</b> to reveal characters · scroll to zoom, drag to pan</span>}
        {!showMembers && <span style={{ color: T.amber }}> · zoomed out</span>}
      </div>

      {/* faction editor popup */}
      {selFacObj && !selMemObj && (
        <FactionPopup
          faction={selFacObj} factions={factions} relations={relations}
          pos={popupPos(w2s, containerSize, nodePos[selFacObj.id].x, nodePos[selFacObj.id].y, 320, 470)}
          containerHeight={containerSize.h} canEdit={canEdit} wiki={wiki}
          patchFaction={patchFaction} deleteFaction={deleteFaction} setRelation={setRelation}
          addMember={addMember} patchMember={patchMember} removeMember={removeMember}
          goToCodex={goToCodex} createEntry={createEntry} onClose={() => setSelFac(null)}
        />
      )}

      {/* member popup — anchored at its faction's card */}
      {selMemObj && selMemFac && (() => {
        const c = nodePos[selMemFac.id];
        return (
          <MemberPopup
            faction={selMemFac} member={selMemObj}
            pos={popupPos(w2s, containerSize, c.x, c.y, 288, 360)}
            containerHeight={containerSize.h} canEdit={canEdit} wiki={wiki}
            patchMember={patchMember} removeMember={removeMember}
            goToCodex={goToCodex} createEntry={createEntry} onClose={() => setSelMem(null)}
          />
        );
      })()}
    </div>
  );
}
