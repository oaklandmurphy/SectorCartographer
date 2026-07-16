import { Star } from "lucide-react";
import { T, cut } from "../theme.js";
import { ICONS, OVERVIEW_ZOOM } from "../constants.js";
import { craftInFleet } from "../lib/carriers.js";
import TargetBrackets from "./ui/TargetBrackets.jsx";
import SystemPopup from "./SystemPopup.jsx";
import FleetPopup from "./FleetPopup.jsx";

export default function MapCanvas({
  mapRef, canvasRef, containerSize, isMobile,
  mode, canEdit, view, w2s,
  systems, fleets, links, fleetPos,
  factions, layers, factionById, layerById,
  selSystem, selFleet, linkSource, hoverFleet,
  onMapPointerDown, onMapDoubleClick,
  startPieceDrag, canvasDown, canvasMove, canvasUp,
  setSelSystem, setSelFleet,
  patchSystem, addMarker, patchMarker, removeMarker, deployFleetAt, deleteSystem,
  patchFleet, addShip, patchShip, removeShip, moveShip, deleteFleet, beginShipDrag,
  addSquadron, patchSquadron, removeSquadron, goToFleet, art,
  wiki, roles, goToCodex, createEntry,
}) {
  const overview = view.scale <= OVERVIEW_ZOOM; // zoomed out far enough — simplify systems to plain markers
  const selSystemObj = systems.find((s) => s.id === selSystem);
  const selFleetObj = fleets.find((f) => f.id === selFleet);

  return (
    <div ref={mapRef}
      style={{ position: "relative", flex: 1, overflow: "hidden", cursor: mode === "select" ? "grab" : "crosshair",
        backgroundImage: `radial-gradient(ellipse at 50% 42%, rgba(0,0,0,0) 0%, rgba(0,0,0,.6) 100%),
          repeating-linear-gradient(0deg, rgba(90,78,56,.12) 0px, rgba(90,78,56,.12) 1px, transparent 1px, transparent 64px),
          repeating-linear-gradient(90deg, rgba(90,78,56,.12) 0px, rgba(90,78,56,.12) 1px, transparent 1px, transparent 64px)`,
        backgroundColor: T.void, userSelect: "none" }}>
      {/* gesture surface — captures empty-space pan/draw. touch-action:none stops the
          browser from stealing the drag as a scroll gesture partway through (mobile fix) */}
      <div onPointerDown={onMapPointerDown} onDoubleClick={onMapDoubleClick}
        style={{ position: "absolute", inset: 0, zIndex: 1, touchAction: "none",
          cursor: mode === "select" ? "grab" : "default" }} />
      {/* starfield */}
      <div style={{ position: "absolute", inset: 0, opacity: 0.55, pointerEvents: "none",
        backgroundImage: `radial-gradient(1px 1px at 20px 30px, #fff, transparent),
          radial-gradient(1px 1px at 130px 80px, #d8c9a0, transparent),
          radial-gradient(1px 1px at 210px 160px, #fff, transparent),
          radial-gradient(1.5px 1.5px at 330px 40px, #cbb98e, transparent),
          radial-gradient(1px 1px at 90px 220px, #fff, transparent),
          radial-gradient(1px 1px at 400px 260px, #e8dfc6, transparent),
          radial-gradient(1px 1px at 520px 120px, #fff, transparent),
          radial-gradient(1.5px 1.5px at 620px 300px, #cbb98e, transparent)`,
        backgroundSize: "640px 360px" }} />

      {/* DRADIS-style scope overlay: fixed to the viewport, not world space — range rings + a slow sweep */}
      <div style={{ position: "absolute", left: "50%", top: "46%", width: 0, height: 0, opacity: 0.6, pointerEvents: "none" }}>
        {[70, 150, 232, 316].map((r) => (
          <div key={r} style={{ position: "absolute", left: -r, top: -r, width: r * 2, height: r * 2, borderRadius: "50%",
            border: `1px solid ${T.accent}1c` }} />
        ))}
        <div className="radar-sweep" style={{ position: "absolute", left: -1, top: -316, width: 2, height: 316,
          background: `linear-gradient(to bottom, ${T.accent}55, transparent 80%)`, transformOrigin: "50% 316px" }} />
      </div>

      {/* links */}
      <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
        {links.map((l) => {
          const A = systems.find((s) => s.id === l.a), B = systems.find((s) => s.id === l.b);
          if (!A || !B) return null;
          const p = w2s(A.x, A.y), q = w2s(B.x, B.y);
          return <line key={l.id} x1={p.x} y1={p.y} x2={q.x} y2={q.y}
            stroke="#7a6a48" strokeOpacity={0.6} strokeWidth={1.4} strokeDasharray="6 5" />;
        })}
      </svg>

      {/* systems */}
      {systems.map((s) => {
        const p = w2s(s.x, s.y); const fac = factionById(s.factionId);
        const isSel = s.id === selSystem; const isSrc = s.id === linkSource;
        const visMarkers = overview ? [] : s.markers.filter((m) => { const L = layerById(m.layerId); return L && L.visible; });
        const plate = overview ? 14 : 34; const half = plate / 2;
        return (
          <div key={s.id} data-piece="1"
            onPointerDown={(e) => startPieceDrag(e, "system", s.id, s.x, s.y)}
            onDoubleClick={(e) => e.stopPropagation()}
            style={{ position: "absolute", left: p.x, top: p.y - half, transform: "translateX(-50%)", touchAction: "none",
              cursor: mode === "draw" ? "crosshair" : "pointer", zIndex: isSel ? 22 : 12, textAlign: "center" }}>
            <div style={{ position: "relative", width: plate, height: plate, margin: "0 auto" }}>
              {(isSel || isSrc) && (
                <TargetBrackets color={isSrc ? T.amber : T.accent} pulse={isSrc}
                  inset={overview ? -4 : -6} armLen={overview ? 6 : 9} thick={overview ? 1.5 : 2} />
              )}
              {overview ? (
                <div style={{ position: "absolute", inset: 0, ...cut(3),
                  background: fac.color, border: "1px solid #14110b", boxShadow: "0 1px 3px rgba(0,0,0,.7)" }} />
              ) : (
                <>
                  <div style={{ position: "absolute", inset: 2, ...cut(5),
                    background: `linear-gradient(155deg, ${fac.color}, ${fac.color}bb 55%, #000 140%)`,
                    border: "1.5px solid #14110b",
                    boxShadow: "inset 0 2px 3px rgba(255,255,255,.16), inset 0 -4px 5px rgba(0,0,0,.55), 0 2px 5px rgba(0,0,0,.6)" }} />
                  <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
                    width: 5, height: 5, borderRadius: "50%", background: "#15130c", boxShadow: `0 0 0 1px ${fac.color}` }} />
                </>
              )}
            </div>
            {!overview && (
              <div className="mono" style={{ fontSize: 11, marginTop: 4, color: T.text, fontWeight: 600,
                textShadow: "0 1px 4px #000", whiteSpace: "nowrap" }}>{s.name}</div>
            )}
            {!overview && visMarkers.length > 0 && (
              <div style={{ display: "flex", gap: 3, justifyContent: "center", flexWrap: "wrap",
                maxWidth: 116, margin: "3px auto 0" }}>
                {visMarkers.map((m) => {
                  const L = layerById(m.layerId); const Ic = ICONS[m.iconKey] || Star;
                  return (
                    <div key={m.id} title={`${m.label} · ${L.name}`}
                      style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 17, height: 17,
                        borderRadius: 2, background: "#14110b", border: `1px solid ${L.color}`, color: L.color }}>
                      <Ic size={11} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* fleets */}
      {fleets.map((f) => {
        const pos = fleetPos[f.id]; const p = w2s(pos.x, pos.y); const fac = factionById(f.factionId);
        const isSel = f.id === selFleet; const isHover = f.id === hoverFleet;
        // badge counts carriers (the named hulls); the craft they carry only fit in the tooltip
        const nCarriers = f.ships.length;
        const tip = `${f.name} · ${nCarriers} carrier${nCarriers === 1 ? "" : "s"} · ${craftInFleet(f)} craft`;
        return (
          <div key={f.id} data-fleet-id={f.id} data-piece="1" title={tip}
            onPointerDown={(e) => startPieceDrag(e, "fleet", f.id, pos.x, pos.y)}
            onDoubleClick={(e) => e.stopPropagation()}
            style={{ position: "absolute", left: p.x, top: p.y, transform: "translate(-50%,-50%)", touchAction: "none",
              cursor: mode === "draw" ? "crosshair" : (canEdit ? "grab" : "pointer"), zIndex: isSel ? 24 : 18 }}>
            <div style={{ position: "relative", width: 30, height: 30,
              filter: `drop-shadow(0 2px 3px rgba(0,0,0,.7)) drop-shadow(0 0 3px ${fac.color}77)`,
              transform: isHover ? "scale(1.18)" : "none", transition: "transform .1s" }}>
              {isSel && <TargetBrackets color={T.accent} inset={-6} armLen={8} thick={2} />}
              <svg width="30" height="30" viewBox="0 0 30 30">
                <polygon points="15,2 27,26 15,20 3,26" fill={fac.color} stroke="#14110b" strokeWidth="1.6" strokeLinejoin="round" />
                <polygon points="15,3 15,20 3,26" fill="#000000" opacity="0.22" />
                <polygon points="15,3 15,20 27,26" fill="#ffffff" opacity="0.10" />
              </svg>
              <div className="mono" style={{ position: "absolute", right: -7, bottom: -6, minWidth: 15, height: 14,
                padding: "0 3px", background: "#14110b", border: `1px solid ${fac.color}`,
                color: fac.color, fontSize: 9.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {nCarriers}
              </div>
            </div>
          </div>
        );
      })}

      {/* drawing canvas */}
      <canvas ref={canvasRef} onPointerDown={canvasDown} onPointerMove={canvasMove} onPointerUp={canvasUp}
        style={{ position: "absolute", inset: 0, zIndex: 30, touchAction: "none", pointerEvents: mode === "draw" ? "auto" : "none",
          cursor: mode === "draw" ? "crosshair" : "default" }} />

      {/* CRT scan-line texture over the whole scope */}
      <div className="scanlines" style={{ position: "absolute", inset: 0, zIndex: 31, opacity: 0.5, pointerEvents: "none" }} />

      {/* hint */}
      <div style={{ position: "absolute", left: 12, bottom: 10, zIndex: 32, background: `${T.panel}e6`, border: `1px solid ${T.line}`, ...cut(8), pointerEvents: "none",
        padding: "6px 10px", fontSize: 10.5, color: T.mut, maxWidth: 340, lineHeight: 1.5, boxShadow: "0 10px 30px rgba(0,0,0,.6)" }}>
        {mode === "select" && canEdit && <span><b style={{ color: T.text }}>Select</b> · drag systems & fleets · click a fleet for its roster · drag empty space to pan · scroll to zoom · double-click to add a system{overview && <> · <b style={{ color: T.amber }}>zoomed out</b>, names & status icons hidden</>}</span>}
        {mode === "select" && !canEdit && <span><b style={{ color: T.amber }}>View only</b> · click a system or fleet to see its details · drag empty space to pan · scroll to zoom · unlock editing from the toolbar{overview && <> · <b style={{ color: T.amber }}>zoomed out</b>, names & status icons hidden</>}</span>}
        {mode === "link" && <span><b style={{ color: T.amber }}>Link</b> · click one system, then another to connect or disconnect their hyperlane</span>}
        {mode === "draw" && <span><b style={{ color: T.accent }}>Draw</b> · sketch freely · pieces are locked · use Undo / Clear above</span>}
      </div>

      {/* ---------------- system editor popup ---------------- */}
      {selSystemObj && (
        <SystemPopup
          system={selSystemObj} anchor={w2s(selSystemObj.x, selSystemObj.y)}
          containerSize={containerSize} isMobile={isMobile} canEdit={canEdit} factions={factions} layers={layers}
          factionById={factionById} layerById={layerById}
          patchSystem={patchSystem} addMarker={addMarker} patchMarker={patchMarker} removeMarker={removeMarker}
          deployFleetAt={deployFleetAt} deleteSystem={deleteSystem} onClose={() => setSelSystem(null)}
          wiki={wiki} goToCodex={goToCodex} createEntry={createEntry}
        />
      )}

      {/* ---------------- fleet roster popup ---------------- */}
      {selFleetObj && (
        <FleetPopup
          fleet={selFleetObj}
          anchor={w2s(fleetPos[selFleetObj.id].x, fleetPos[selFleetObj.id].y)}
          containerSize={containerSize} isMobile={isMobile} canEdit={canEdit} factions={factions} fleets={fleets}
          factionColor={factionById(selFleetObj.factionId).color}
          home={selFleetObj.systemId ? systems.find((s) => s.id === selFleetObj.systemId) : null}
          patchFleet={patchFleet} addShip={addShip} patchShip={patchShip} removeShip={removeShip}
          moveShip={moveShip} deleteFleet={deleteFleet} onClose={() => setSelFleet(null)}
          addSquadron={addSquadron} patchSquadron={patchSquadron} removeSquadron={removeSquadron}
          onShipDragStart={(ship, e) => beginShipDrag(ship, selFleetObj.id, e)}
          goToFleet={goToFleet} roles={roles} art={art}
        />
      )}
    </div>
  );
}
