import { useMemo } from "react";
import { Star, VenetianMask } from "lucide-react";
import { T, cut, sceneBackdrop, floatingPanel } from "../theme.js";
import { ICONS, AGENT_ICONS, OVERVIEW_ZOOM } from "../constants.js";
import { craftInFleet } from "../lib/carriers.js";
import TargetBrackets from "./ui/TargetBrackets.jsx";
import SystemGlow from "./ui/SystemGlow.jsx";
import Starfield from "./ui/Starfield.jsx";
import SystemPopup from "./SystemPopup.jsx";
import FleetPopup from "./FleetPopup.jsx";
import AgentPopup from "./AgentPopup.jsx";
import OrdersPanel from "./OrdersPanel.jsx";

// Move-order routes are drawn in their faction's own color, lightened toward
// white so the path stands out against that same faction's (darker) pieces and
// its systems underneath.
function brightenColor(hex, amt = 0.5) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return "#ffe000"; // malformed — fall back to a bright yellow
  const n = parseInt(m[1], 16);
  const up = (c) => Math.round(c + (255 - c) * amt);
  const r = up((n >> 16) & 255), g = up((n >> 8) & 255), b = up(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

export default function MapCanvas({
  mapRef, canvasRef, containerSize, isMobile,
  mode, canEdit, isGM, editLocked, view, w2s,
  systems, fleets, links, fleetPos,
  agents, agentPos, orders, actions, showOrders, showFleets = true, showAgents = true,
  factions, layers, factionById, layerById,
  selSystem, selFleet, selAgent, linkSource, hoverFleet,
  routing, routingOrder,
  onMapPointerDown, onMapDoubleClick,
  startPieceDrag, canvasDown, canvasMove, canvasUp,
  onAgentTap, undoOrderStop, clearRoutingOrder, commitRoutingOrder, setRoutingNotes,
  setSelSystem, setSelFleet, setSelAgent,
  patchSystem, addMarker, patchMarker, removeMarker, deployFleetAt, deleteSystem,
  patchFleet, renameFleet, addShip, patchShip, removeShip, moveShip, deleteFleet, beginShipDrag,
  addSquadron, patchSquadron, removeSquadron, goToFleet, goToAgentAction, art,
  patchAgent, removeAgent, canManageAgents, canPlaceAgents, canOrderFor, submitMission,
  wiki, roles, goToCodex, createEntry, openFleetTransfer,
}) {
  const overview = view.scale <= OVERVIEW_ZOOM; // zoomed out far enough — simplify systems to plain markers
  const selSystemObj = systems.find((s) => s.id === selSystem);
  const selFleetObj = fleets.find((f) => f.id === selFleet);
  const selAgentObj = (agents || []).find((a) => a.id === selAgent);

  // While an agent's popup is open: glow its home system and every system one
  // hyperlane hop away, so a player can see at a glance where it could move.
  const agentGlow = useMemo(() => {
    if (!selAgentObj || !selAgentObj.systemId) return null;
    const homeId = selAgentObj.systemId;
    const adjacent = new Set();
    links.forEach((l) => {
      if (l.a === homeId) adjacent.add(l.b);
      else if (l.b === homeId) adjacent.add(l.a);
    });
    return { homeId, adjacent, color: factionById(selAgentObj.factionId).color };
  }, [selAgentObj, links, factionById]);

  // The map position a move order starts from — where its piece currently sits.
  const pieceOrigin = (o) => (o.pieceType === "fleet" ? fleetPos[o.pieceId] : agentPos[o.pieceId]) || null;
  const systemById = (id) => systems.find((s) => s.id === id);
  // The world-space polyline for an order: its piece's position, then each stop's
  // system center. Null if we can't anchor it (e.g. an unplaced agent).
  const orderPoints = (o) => {
    const origin = pieceOrigin(o);
    if (!origin) return null;
    const pts = [origin];
    for (const sid of o.path) { const s = systemById(sid); if (s) pts.push({ x: s.x, y: s.y }); }
    return pts.length >= 2 ? pts : null;
  };

  // Two or more orders sharing the same hop (e.g. every fleet queued A -> B this
  // turn) draw exactly on top of one another and become an unreadable block. Group
  // every order's segments by their (rounded) endpoints — direction-independent,
  // so an A->B and a B->A order sharing the same hyperlane land in the same group
  // — and fan siblings out a fixed number of screen pixels either side of the
  // shared line, in the order's stable id order, so the offset is symmetric and
  // holds steady across zoom levels.
  const ORDER_PATH_OFFSET = 7;
  const orderPathGroups = useMemo(() => {
    const groups = new Map(); // segment key -> { ids: [orderId...], p1, p2 } (world space)
    const segKeysByOrder = new Map(); // orderId -> [segment key, ...]
    for (const o of orders || []) {
      const pts = orderPoints(o);
      if (!pts) continue;
      const keys = [];
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1], q = pts[i];
        const ka = `${p.x.toFixed(1)},${p.y.toFixed(1)}`;
        const kb = `${q.x.toFixed(1)},${q.y.toFixed(1)}`;
        const key = ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
        const [p1, p2] = ka < kb ? [p, q] : [q, p];
        if (!groups.has(key)) groups.set(key, { ids: [], p1, p2 });
        groups.get(key).ids.push(o.id);
        keys.push(key);
      }
      segKeysByOrder.set(o.id, keys);
    }
    groups.forEach((g) => g.ids.sort());
    return { groups, segKeysByOrder };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, fleetPos, agentPos, systems]);

  return (
    <div ref={mapRef} style={{ ...sceneBackdrop, cursor: mode === "select" ? "grab" : "crosshair" }}>
      {/* gesture surface — captures empty-space pan/draw. touch-action:none stops the
          browser from stealing the drag as a scroll gesture partway through (mobile fix) */}
      <div onPointerDown={onMapPointerDown} onDoubleClick={onMapDoubleClick}
        style={{ position: "absolute", inset: 0, zIndex: 1, touchAction: "none",
          cursor: mode === "select" ? "grab" : "default" }} />
      <Starfield />

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

      {/* move-order paths — drawn in the ordering faction's (brightened) color,
          with an arrow on every segment's midpoint pointing the way of travel.
          Dashed while a route is still a draft, solid once submitted as ready. The
          arrow shape says what kind of piece is moving: a solid triangle for a
          fleet, an open chevron on a slimmer line for an agent. Sits above the
          hyperlanes but below the pieces so a marker draws over its own route.
          The viewer can hide the overlay from the toolbar; plotting (orders mode)
          always keeps it on so you can see what you're drawing. */}
      {(showOrders || mode === "orders") && orders && orders.length > 0 && (
        <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 5 }}>
          {orders.map((o) => {
            const pts = orderPoints(o);
            if (!pts) return null;
            const scr = pts.map((p) => w2s(p.x, p.y));
            const segKeys = orderPathGroups.segKeysByOrder.get(o.id) || [];
            const draft = !o.committed;
            const isAgent = o.pieceType === "agent";
            const suggest = !!o.suggestion;
            // A suggestion is drawn in the *suggesting* faction's color (so its
            // author can pick out their own proposals), a plain order in the piece
            // owner's. The "suggested" tag below names who proposed it.
            const color = brightenColor(factionById(suggest ? o.suggesterFactionId : o.factionId).color);
            return (
              <g key={o.id}>
                {scr.slice(1).map((b, i) => {
                  const a = scr[i];
                  let ax = a.x, ay = a.y, bx = b.x, by = b.y;
                  const group = orderPathGroups.groups.get(segKeys[i]);
                  if (group && group.ids.length > 1) {
                    const idx = group.ids.indexOf(o.id);
                    const offset = (idx - (group.ids.length - 1) / 2) * ORDER_PATH_OFFSET;
                    // Perpendicular of the group's *canonical* endpoints, not this
                    // order's own travel direction — so an order running the hop
                    // backwards still fans out to the same side as its siblings.
                    const P1 = w2s(group.p1.x, group.p1.y), P2 = w2s(group.p2.x, group.p2.y);
                    const dx = P2.x - P1.x, dy = P2.y - P1.y;
                    const len = Math.hypot(dx, dy) || 1;
                    const px = -dy / len, py = dx / len;
                    ax += px * offset; ay += py * offset;
                    bx += px * offset; by += py * offset;
                  }
                  const mx = (ax + bx) / 2, my = (ay + by) / 2;
                  const deg = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI;
                  const xf = `translate(${mx} ${my}) rotate(${deg})`;
                  return (
                    <g key={i}>
                      <line x1={ax} y1={ay} x2={bx} y2={by}
                        stroke={color}
                        strokeOpacity={suggest ? (draft ? 0.6 : 0.9) : isAgent ? (draft ? 0.6 : 0.8) : (draft ? 0.75 : 1)}
                        strokeWidth={suggest ? 1.4 : isAgent ? (draft ? 0.75 : 1) : (draft ? 1.2 : 1.8)}
                        strokeDasharray={suggest ? "2 4" : isAgent ? (draft ? "3 5" : "2 4") : (draft ? "7 6" : undefined)}
                        strokeLinecap="round" />
                      {isAgent ? (
                        // agent — open chevron, small and faint next to a fleet's solid triangle
                        <polyline points="-3,-3.5 3.5,0 -3,3.5" fill="none" stroke={color}
                          strokeOpacity={draft ? 0.7 : 0.9} strokeWidth={1.4}
                          strokeLinecap="round" strokeLinejoin="round" transform={xf} />
                      ) : suggest ? (
                        // suggested fleet move — a hollow triangle, so it reads as a
                        // proposal rather than the owner's own (filled) order
                        <polygon points="-5,-5 7,0 -5,5" fill="none" stroke={color}
                          strokeOpacity={draft ? 0.7 : 0.95} strokeWidth={1.3} strokeLinejoin="round" transform={xf} />
                      ) : (
                        // fleet — solid triangle
                        <polygon points="-5,-5 7,0 -5,5" fill={color} fillOpacity={draft ? 0.85 : 1}
                          stroke={T.ink} strokeWidth={0.7} strokeLinejoin="round" transform={xf} />
                      )}
                    </g>
                  );
                })}
              </g>
            );
          })}
        </svg>
      )}

      {/* "suggested" tags — a small chip at the midpoint of each suggested move's
          route, so it reads clearly as an ally/vassal's proposal (and names who
          made it on hover). A faction's own orders are unlabelled. Same show/hide +
          orders-mode rule as the route lines above. */}
      {(showOrders || mode === "orders") && (orders || []).some((o) => o.suggestion) && (
        <div style={{ position: "absolute", inset: 0, zIndex: 16, pointerEvents: "none" }}>
          {(orders || []).filter((o) => o.suggestion).map((o) => {
            const pts = orderPoints(o);
            if (!pts) return null;
            const scr = pts.map((p) => w2s(p.x, p.y));
            // Anchor the chip on the middle segment of the route so it doesn't sit
            // on top of the moving fleet's marker or its destination system.
            const i = Math.max(0, Math.floor((scr.length - 1) / 2));
            const a = scr[i], b = scr[i + 1] || scr[i];
            const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
            const sug = factionById(o.suggesterFactionId);
            const col = brightenColor(sug.color);
            return (
              <div key={`sug_${o.id}`} title={`Suggested by ${sug.name}${o.committed ? "" : " · still drafting"}`}
                style={{ position: "absolute", left: mid.x, top: mid.y, transform: "translate(-50%,-50%)",
                  display: "flex", alignItems: "center", gap: 4, padding: "1px 5px", ...cut(2),
                  background: T.ink, border: `1px solid ${col}`, opacity: o.committed ? 1 : 0.72,
                  boxShadow: "0 1px 3px rgba(0,0,0,.7)" }}>
                <span style={{ width: 6, height: 6, background: sug.color, ...cut(1), flexShrink: 0 }} />
                <span className="mono" style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: ".09em",
                  color: col, textTransform: "uppercase", whiteSpace: "nowrap" }}>Suggested</span>
              </div>
            );
          })}
        </div>
      )}

      {/* systems */}
      {systems.map((s) => {
        const p = w2s(s.x, s.y); const fac = factionById(s.factionId);
        const isSel = s.id === selSystem; const isSrc = s.id === linkSource;
        const isAgentHome = agentGlow && s.id === agentGlow.homeId;
        const isAgentAdjacent = agentGlow && agentGlow.adjacent.has(s.id);
        const visMarkers = overview ? [] : s.markers.filter((m) => { const L = layerById(m.layerId); return L && L.visible; });
        const plate = overview ? 14 : 34; const half = plate / 2;
        return (
          <div key={s.id} data-piece="1"
            onPointerDown={(e) => startPieceDrag(e, "system", s.id, s.x, s.y)}
            onDoubleClick={(e) => e.stopPropagation()}
            style={{ position: "absolute", left: p.x, top: p.y - half, transform: "translateX(-50%)", touchAction: "none",
              cursor: mode === "draw" ? "crosshair" : "pointer", zIndex: (isSel || isAgentHome) ? 22 : 12, textAlign: "center" }}>
            <div style={{ position: "relative", width: plate, height: plate, margin: "0 auto" }}>
              {isAgentHome && <SystemGlow color={agentGlow.color} pulse size={overview ? 0.55 : 1} />}
              {isAgentAdjacent && <SystemGlow color={agentGlow.color} size={overview ? 0.4 : 0.7} />}
              {(isSel || isSrc) && (
                <TargetBrackets color={isSrc ? T.amber : T.accent} pulse={isSrc}
                  inset={overview ? -4 : -6} armLen={overview ? 6 : 9} thick={overview ? 1.5 : 2} />
              )}
              {overview ? (
                <div style={{ position: "absolute", inset: 0, ...cut(3),
                  background: fac.color, border: `1px solid ${T.ink}`, boxShadow: "0 1px 3px rgba(0,0,0,.7)" }} />
              ) : (
                <>
                  <div style={{ position: "absolute", inset: 2, ...cut(5),
                    background: `linear-gradient(155deg, ${fac.color}, ${fac.color}bb 55%, #000 140%)`,
                    border: `1.5px solid ${T.ink}`,
                    boxShadow: "inset 0 2px 3px rgba(255,255,255,.16), inset 0 -4px 5px rgba(0,0,0,.55), 0 2px 5px rgba(0,0,0,.6)" }} />
                  <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)",
                    width: 5, height: 5, borderRadius: "50%", background: T.ink, boxShadow: `0 0 0 1px ${fac.color}` }} />
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
                        borderRadius: 2, background: T.ink, border: `1px solid ${L.color}`, color: L.color }}>
                      <Ic size={11} />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {/* fleets — hidden when the viewer toggles them off from the toolbar */}
      {showFleets && fleets.map((f) => {
        const pos = fleetPos[f.id]; const p = w2s(pos.x, pos.y); const fac = factionById(f.factionId);
        const isSel = f.id === selFleet; const isHover = f.id === hoverFleet;
        const isRouting = routing && routing.type === "fleet" && routing.id === f.id;
        // badge counts carriers (the named hulls); the craft they carry only fit in the tooltip
        const nCarriers = f.ships.length;
        const tip = `${f.name} · ${nCarriers} carrier${nCarriers === 1 ? "" : "s"} · ${craftInFleet(f)} craft`;
        return (
          <div key={f.id} data-fleet-id={f.id} data-piece="1" title={tip}
            onPointerDown={(e) => startPieceDrag(e, "fleet", f.id, pos.x, pos.y, f.systemId)}
            onDoubleClick={(e) => e.stopPropagation()}
            style={{ position: "absolute", left: p.x, top: p.y, transform: "translate(-50%,-50%)", touchAction: "none",
              cursor: mode === "draw" ? "crosshair" : (canEdit ? "grab" : "pointer"), zIndex: isSel || isRouting ? 24 : 18 }}>
            <div style={{ position: "relative", width: 30, height: 30,
              filter: `drop-shadow(0 2px 3px rgba(0,0,0,.7)) drop-shadow(0 0 3px ${fac.color}77)`,
              transform: isHover ? "scale(1.18)" : "none", transition: "transform .1s" }}>
              {(isSel || isRouting) && <TargetBrackets color={isRouting ? T.amber : T.accent} inset={-6} armLen={8} thick={2} />}
              <svg width="30" height="30" viewBox="0 0 30 30">
                <polygon points="15,2 27,26 15,20 3,26" fill={fac.color} stroke={T.ink} strokeWidth="1.6" strokeLinejoin="round" />
                <polygon points="15,3 15,20 3,26" fill="#000000" opacity="0.22" />
                <polygon points="15,3 15,20 27,26" fill="#ffffff" opacity="0.10" />
              </svg>
              <div className="mono" style={{ position: "absolute", right: -7, bottom: -6, minWidth: 15, height: 14,
                padding: "0 3px", background: T.ink, border: `1px solid ${fac.color}`,
                color: fac.color, fontSize: 9.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {nCarriers}
              </div>
            </div>
          </div>
        );
      })}

      {/* agents — covert operatives parked at a system, only ever rendered for
          their own faction (the caller passes the already-filtered list). They
          fan out just below their system so they never sit under a fleet.
          Hidden when the viewer toggles agents off from the toolbar, or when
          zoomed out far enough that systems collapse to plain markers. */}
      {showAgents && !overview && (agents || []).map((a) => {
        const pos = agentPos[a.id];
        if (!pos) return null; // unplaced, or its system is gone — page-only
        const p = w2s(pos.x, pos.y); const fac = factionById(a.factionId);
        const isSel = a.id === selAgent;
        const isRouting = routing && routing.type === "agent" && routing.id === a.id;
        const fac2 = factions.find((f) => f.id === a.factionId);
        const member = fac2 ? (fac2.members || []).find((m) => m.id === a.memberId) : null;
        const label = a.name && a.name.trim() ? a.name.trim() : (member ? member.name : "Agent");
        const tip = a.notes ? `${label} · ${a.notes}` : label;
        // Dragging is a GM-always, player-if-the-GM's-flipped-their-toggle
        // permission (see canPlaceAgents/AccessControl's per-role switch) — a
        // viewer without it still just taps the marker to open its popup, same
        // as before this existed. The editLocked toggle is a GM-only, per-browser
        // accidental-drag guard (players never see the button to unlock it), so
        // it only gates the GM's own drag — a player's independently-granted
        // permission isn't subject to it.
        const canDrag = mode !== "draw" && !!(canPlaceAgents && canPlaceAgents(a.factionId)) && (!isGM || !editLocked);
        const Icon = AGENT_ICONS[a.icon] || VenetianMask;
        // Same idea as a fleet's carrier-count badge, bottom-right: how many
        // action requests this agent has left against its GM-set quota.
        const cap = Number(a.actionCap) || 0;
        const used = (actions || []).filter((x) => x.agentId === a.id).length;
        const remaining = Math.max(0, cap - used);
        return (
          <div key={a.id} data-piece="1" title={canDrag ? `${tip} · drag to move` : tip}
            onPointerDown={(e) => { if (canDrag) startPieceDrag(e, "agent", a.id, pos.x, pos.y, a.systemId); else e.stopPropagation(); }}
            onClick={() => { if (!canDrag) onAgentTap(a.id); }}
            style={{ position: "absolute", left: p.x, top: p.y, transform: "translate(-50%,-50%)", touchAction: "none",
              cursor: canDrag ? "grab" : "pointer", zIndex: isSel || isRouting ? 24 : 17 }}>
            <div style={{ position: "relative", width: 29, height: 29,
              filter: `drop-shadow(0 2px 3px rgba(0,0,0,.7)) drop-shadow(0 0 3px ${fac.color}77)` }}>
              {(isSel || isRouting) && <TargetBrackets color={isRouting ? T.amber : T.accent} inset={-6} armLen={8} thick={2} />}
              <div style={{ position: "absolute", inset: 5, transform: "rotate(45deg)",
                background: `radial-gradient(circle at 50% 32%, ${fac.color}, ${fac.color}bb 60%, #000 150%)`,
                border: `1.5px solid ${T.ink}`,
                boxShadow: "inset 0 1px 2px rgba(255,255,255,.18)" }} />
              <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Icon size={16} color={T.ink} />
              </div>
              {cap > 0 && (
                <div className="mono" title={`${remaining} of ${cap} action requests available`}
                  style={{ position: "absolute", right: -7, bottom: -6, minWidth: 15, height: 14,
                    padding: "0 3px", background: T.ink, border: `1px solid ${fac.color}`,
                    color: fac.color, fontSize: 9.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {remaining}/{cap}
                </div>
              )}
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
      <div style={{ position: "absolute", left: 12, bottom: 10, zIndex: 32, pointerEvents: "none",
        padding: "6px 10px", fontSize: 10.5, color: T.mut,
        maxWidth: isMobile ? containerSize.w - 24 : 340, lineHeight: 1.5, ...floatingPanel }}>
        {mode === "select" && canEdit && <span><b style={{ color: T.text }}>Select</b> · drag systems & fleets · click a fleet for its roster · drag empty space to pan · scroll to zoom · double-click to add a system{overview && <> · <b style={{ color: T.amber }}>zoomed out</b>, names & status icons hidden</>}</span>}
        {mode === "select" && !canEdit && <span><b style={{ color: T.amber }}>View only</b> · click a system or fleet to see its details · drag empty space to pan · scroll to zoom · unlock editing from the toolbar{overview && <> · <b style={{ color: T.amber }}>zoomed out</b>, names & status icons hidden</>}</span>}
        {mode === "link" && <span><b style={{ color: T.amber }}>Link</b> · click one system, then another to connect or disconnect their hyperlane</span>}
        {mode === "draw" && <span><b style={{ color: T.accent }}>Draw</b> · sketch freely · pieces are locked · use Undo / Clear above</span>}
        {mode === "orders" && <span><b style={{ color: T.amber }}>Orders</b> · click a fleet or agent you own, then click systems to plot its route · click an <b style={{ color: T.text }}>ally or vassal</b>'s fleet to <b style={{ color: T.text }}>suggest</b> a move for it · <b style={{ color: T.text }}>Submit</b> to signal the GM you're ready</span>}
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
          patchFleet={patchFleet} renameFleet={renameFleet} addShip={addShip} patchShip={patchShip} removeShip={removeShip}
          moveShip={moveShip} deleteFleet={deleteFleet} onClose={() => setSelFleet(null)}
          addSquadron={addSquadron} patchSquadron={patchSquadron} removeSquadron={removeSquadron}
          onShipDragStart={(ship, e) => beginShipDrag(ship, selFleetObj.id, e)}
          goToFleet={goToFleet} roles={roles} art={art}
          canOrderFor={canOrderFor} submitMission={submitMission}
          onOpenFleetTransfer={openFleetTransfer}
        />
      )}

      {/* ---------------- agent popup ---------------- */}
      {selAgentObj && agentPos[selAgentObj.id] && (
        <AgentPopup
          agent={selAgentObj} faction={factions.find((f) => f.id === selAgentObj.factionId)}
          anchor={w2s(agentPos[selAgentObj.id].x, agentPos[selAgentObj.id].y)}
          containerSize={containerSize} isMobile={isMobile}
          canManage={canManageAgents ? canManageAgents(selAgentObj.factionId) : false}
          canPlace={canPlaceAgents ? canPlaceAgents(selAgentObj.factionId) : canEdit}
          canRemove={canEdit}
          systems={systems} patchAgent={patchAgent} removeAgent={removeAgent}
          onRequestAction={goToAgentAction ? () => goToAgentAction(selAgentObj.id, selAgentObj.factionId) : undefined}
          onClose={() => setSelAgent(null)}
        />
      )}

      {/* ---------------- move-order plotting console ---------------- */}
      {mode === "orders" && (() => {
        if (!routing) return <OrdersPanel />;
        const fac = factionById(routing.factionId);
        let pieceLabel = "", originName = "";
        if (routing.type === "fleet") {
          const f = fleets.find((x) => x.id === routing.id);
          pieceLabel = f ? f.name : "Fleet";
          originName = f && f.systemId ? (systemById(f.systemId) || {}).name : "in transit";
        } else {
          const a = (agents || []).find((x) => x.id === routing.id);
          const fac2 = a ? factions.find((f) => f.id === a.factionId) : null;
          const member = a && fac2 ? (fac2.members || []).find((m) => m.id === a.memberId) : null;
          pieceLabel = a && a.name && a.name.trim() ? a.name.trim() : (member ? member.name : "Agent");
          originName = a && a.systemId ? (systemById(a.systemId) || {}).name : "unplaced";
        }
        const stops = (routingOrder ? routingOrder.path : []).map((id) => ({ id, name: (systemById(id) || {}).name || "—" }));
        return (
          <OrdersPanel
            pieceLabel={pieceLabel} factionColor={fac && fac.color} originName={originName}
            suggestion={!!routing.suggestion} ownerLabel={fac && fac.name}
            stops={stops} committed={!!(routingOrder && routingOrder.committed)}
            notes={(routingOrder && routingOrder.notes) || ""} onNotesChange={setRoutingNotes}
            onUndo={undoOrderStop} onClear={clearRoutingOrder} onCommit={commitRoutingOrder}
          />
        );
      })()}
    </div>
  );
}
