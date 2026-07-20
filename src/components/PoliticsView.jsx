import { useEffect, useMemo, useRef, useState } from "react";
import { Users, Plus, Maximize2, Network } from "lucide-react";
import { T, cut, sceneBackdrop, floatingPanel } from "../theme.js";
import { SUBNODE_ZOOM, RELATION_TYPES, relationType, MEMBER_KINDS } from "../constants.js";
import { usePoliticsInteractions } from "../hooks/usePoliticsInteractions.js";
import TargetBrackets from "./ui/TargetBrackets.jsx";
import Starfield from "./ui/Starfield.jsx";
import FactionPopup from "./FactionPopup.jsx";
import MemberPopup from "./MemberPopup.jsx";

const NODE_R = 78;      // faction node radius, world units
const MEMBER_RING = 44; // radius of the subnode cloud inside a faction
const MEMBER_SIZE = 30; // subnode diameter, world units

const kindMeta = (id) => MEMBER_KINDS.find((k) => k.id === id) || MEMBER_KINDS[0];

// where a member subnode sits inside its faction node (world offset from center)
function memberOffset(i, n) {
  if (n <= 1) return { x: 0, y: 30 };
  const ang = -Math.PI / 2 + i * ((Math.PI * 2) / n);
  return { x: Math.cos(ang) * MEMBER_RING, y: Math.sin(ang) * MEMBER_RING };
}

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
            zIndex: 5, pointerEvents: "none", display: "flex", alignItems: "center", gap: 4,
            background: `${T.panel}e6`, border: `1px solid ${meta.color}`, ...cut(4), padding: "2px 6px",
            color: meta.color, fontFamily: "'Oswald', sans-serif", fontSize: 10, fontWeight: 600,
            letterSpacing: ".05em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
            <Ic size={10} /> {meta.label}
          </div>
        );
      })}

      {/* faction nodes */}
      {factions.map((f) => {
        const c = nodePos[f.id]; const p = w2s(c.x, c.y);
        const isSel = selFac === f.id && !selMem;
        const screenR = NODE_R * view.scale;
        const members = f.members || [];
        return (
          <div key={f.id} onPointerDown={(e) => startFactionDrag(e, f.id, c.x, c.y)}
            style={{ position: "absolute", left: p.x, top: p.y, transform: "translate(-50%,-50%)",
              width: screenR * 2, height: screenR * 2, touchAction: "none",
              zIndex: isSel ? 22 : 12, cursor: canEdit ? "grab" : "pointer" }}>
            {/* node disc */}
            <div style={{ position: "absolute", inset: 0, borderRadius: "50%",
              background: `radial-gradient(circle at 50% 35%, ${f.color}3a, ${f.color}14 58%, transparent 72%)`,
              border: `2px solid ${f.color}`,
              boxShadow: `0 0 ${16 * view.scale}px ${f.color}44, inset 0 0 ${22 * view.scale}px ${f.color}1c` }} />
            {isSel && <TargetBrackets color={T.accent} inset={-5} armLen={Math.max(8, 12 * view.scale)} thick={2} />}

            {/* name plate on the top edge */}
            <div className="stencil" style={{ position: "absolute", left: "50%", top: 0, transform: "translate(-50%,-130%)",
              whiteSpace: "nowrap", background: `${T.panel}f0`, border: `1px solid ${f.color}`, ...cut(4),
              padding: "2px 8px", fontSize: 12.5, fontWeight: 700, letterSpacing: ".04em", color: T.text,
              boxShadow: "0 2px 6px rgba(0,0,0,.5)" }}>
              {f.name}
            </div>

            {/* zoomed out: sigil + member count */}
            {!showMembers && (
              <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center", gap: 2, color: f.color, pointerEvents: "none" }}>
                <Users size={Math.max(12, 20 * view.scale)} />
                <span className="mono" style={{ fontSize: Math.max(9, 12 * view.scale), color: T.mut }}>{members.length}</span>
              </div>
            )}

            {/* zoomed in: member subnode cloud */}
            {showMembers && members.length === 0 && (
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
                color: T.faint, fontSize: 10, pointerEvents: "none" }}>no members</div>
            )}
            {showMembers && members.map((m, i) => {
              const off = memberOffset(i, members.length);
              const Km = kindMeta(m.kind); const Ic = Km.icon;
              const size = MEMBER_SIZE * view.scale;
              const isMSel = selMem && selMem.facId === f.id && selMem.memId === m.id;
              const codexEntry = m.wikiId ? wiki.find((e) => e.id === m.wikiId) : null;
              const portrait = codexEntry && codexEntry.image;
              return (
                <div key={m.id}
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => { e.stopPropagation(); setSelFac(null); setSelMem({ facId: f.id, memId: m.id }); }}
                  title={`${m.name}${m.role ? " · " + m.role : ""}`}
                  style={{ position: "absolute", left: screenR + off.x * view.scale, top: screenR + off.y * view.scale,
                    transform: "translate(-50%,-50%)", zIndex: isMSel ? 3 : 2, cursor: "pointer", textAlign: "center" }}>
                  <div style={{ position: "relative", width: size, height: size, margin: "0 auto" }}>
                    {isMSel && <TargetBrackets color={T.accent} inset={-3} armLen={6} thick={1.5} />}
                    <div style={{ position: "absolute", inset: 0, ...cut(4), overflow: "hidden",
                      background: portrait ? "#000" : `linear-gradient(150deg, ${f.color}, ${f.color}aa 60%, #000 150%)`,
                      border: "1.5px solid #14110b", display: "flex", alignItems: "center", justifyContent: "center",
                      color: "#0f0d08", boxShadow: "inset 0 1px 2px rgba(255,255,255,.2), 0 2px 4px rgba(0,0,0,.6)" }}>
                      {portrait
                        ? <img src={portrait} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center" }} />
                        : <Ic size={Math.max(9, size * 0.5)} />}
                    </div>
                    {m.wikiId && (
                      <div style={{ position: "absolute", right: -2, top: -2, width: 6, height: 6, borderRadius: "50%",
                        background: T.accent, border: "1px solid #14110b" }} title="Has codex entry" />
                    )}
                  </div>
                  {view.scale >= 1.05 && (
                    <div className="mono" style={{ marginTop: 3, fontSize: 9.5, color: T.text, textShadow: "0 1px 3px #000",
                      maxWidth: 88, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.name}</div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })}

      {/* CRT scan-line texture */}
      <div className="scanlines" style={{ position: "absolute", inset: 0, zIndex: 31, opacity: 0.5, pointerEvents: "none" }} />

      {/* floating toolbar */}
      <div style={{ position: "absolute", left: 12, top: 12, zIndex: 34, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {canEdit && (
          <button onClick={() => addFaction()} title="Add a faction"
            style={{ display: "flex", alignItems: "center", gap: 6, background: "rgba(159,194,58,.14)",
              border: `1px solid rgba(159,194,58,.5)`, ...cut(6), color: T.accent, cursor: "pointer", padding: "7px 11px",
              fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>
            <Plus size={14} /> Faction
          </button>
        )}
        <button onClick={centerView} title="Reset view"
          style={{ display: "flex", alignItems: "center", gap: 6, background: `${T.panel}e6`,
            border: `1px solid ${T.line}`, ...cut(6), color: T.text, cursor: "pointer", padding: "7px 11px",
            fontFamily: "'Oswald', sans-serif", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".04em" }}>
          <Maximize2 size={14} /> Reset
        </button>
      </div>

      {/* legend */}
      <div style={{ position: "absolute", right: 12, bottom: 10, zIndex: 32, padding: "8px 11px",
        pointerEvents: "none", maxWidth: 200, ...floatingPanel }}>
        <div className="stencil" style={{ fontSize: 11, letterSpacing: ".1em", color: T.mut, marginBottom: 6 }}>RELATIONS</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {RELATION_TYPES.map((r) => (
            <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 7 }}>
              <span style={{ width: 20, height: 0, borderTop: `${Math.max(2, r.width)}px ${r.dash ? "dashed" : "solid"} ${r.color}`, flexShrink: 0 }} />
              <span style={{ fontSize: 10.5, color: T.text, fontFamily: "'Oswald', sans-serif", letterSpacing: ".02em" }}>{r.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* hint */}
      <div style={{ position: "absolute", left: 12, bottom: 10, zIndex: 32, pointerEvents: "none",
        padding: "6px 10px", fontSize: 10.5, color: T.mut, maxWidth: 340, lineHeight: 1.5, ...floatingPanel }}>
        <Network size={12} style={{ color: T.accent, verticalAlign: "-2px", marginRight: 5 }} />
        {canEdit
          ? <span><b style={{ color: T.text }}>Politics</b> · drag factions to arrange · click one to edit its relations & members · <b style={{ color: T.amber }}>zoom in</b> to reveal characters & organizations inside each faction</span>
          : <span><b style={{ color: T.amber }}>View only</b> · click a faction for its members & relations · <b style={{ color: T.amber }}>zoom in</b> to reveal characters & organizations · scroll to zoom, drag to pan</span>}
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

      {/* member subnode popup */}
      {selMemObj && selMemFac && (() => {
        const idx = (selMemFac.members || []).findIndex((m) => m.id === selMemObj.id);
        const off = memberOffset(idx, (selMemFac.members || []).length);
        const c = nodePos[selMemFac.id];
        return (
          <MemberPopup
            faction={selMemFac} member={selMemObj}
            pos={popupPos(w2s, containerSize, c.x + off.x, c.y + off.y, 288, 360)}
            containerHeight={containerSize.h} canEdit={canEdit} wiki={wiki}
            patchMember={patchMember} removeMember={removeMember}
            goToCodex={goToCodex} createEntry={createEntry} onClose={() => setSelMem(null)}
          />
        );
      })()}
    </div>
  );
}
