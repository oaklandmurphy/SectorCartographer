import { useEffect, useRef, useState } from "react";
import { uid } from "../utils/id.js";
import { MIN_ZOOM, MAX_ZOOM } from "../constants.js";

// Owns everything about the map surface: panning/zooming the view, dragging
// systems/fleets/ships, and the freehand-drawing canvas. This is the one part
// of the app that talks to the DOM directly (pointer/touch/wheel listeners,
// canvas 2D context) instead of just rendering React state, so it's kept
// together in a single hook rather than split further.
export function useMapInteractions({
  activeTab, mode, canEdit,
  view, setView,
  systems, setSystems,
  fleets, setFleets,
  strokes, setStrokes,
  drawColor, drawWidth,
  onSystemTap, onFleetTap,
  onFleetSnap,
  onShipDrop,
  onDeselectAll,
  onLinkBackgroundClick,
  onDoubleClickAddSystem,
}) {
  const mapRef = useRef(null);
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const activeStrokeRef = useRef(null);
  const sizeRef = useRef({ w: 800, h: 600, dpr: 1 });
  const viewRef = useRef(view);
  const strokesRef = useRef(strokes);
  const modeRef = useRef(mode);
  const shipDragRef = useRef(null);
  const systemsRef = useRef(systems);
  const canEditRef = useRef(canEdit);
  const pinchRef = useRef(null); // { startDist, startScale, worldX, worldY } while a 2+finger touch gesture is active

  const [containerSize, setContainerSize] = useState({ w: 800, h: 600 });
  const [shipDrag, setShipDrag] = useState(null); // {ship, fromFleetId, x, y}
  const [hoverFleet, setHoverFleet] = useState(null);
  const [drawColorState, setDrawColorState] = useState(drawColor);
  const [drawWidthState, setDrawWidthState] = useState(drawWidth);

  // The global pointer-drag effect below subscribes once ([] deps) so it never has to
  // tear down/rebuild listeners mid-drag. It reaches these callbacks through refs kept
  // current on every render instead of depending on them directly, which would otherwise
  // make it close over stale versions (and stale `mode`/`linkSource`/etc. inside them).
  const callbacksRef = useRef(null);
  callbacksRef.current = { onSystemTap, onFleetTap, onFleetSnap, onShipDrop, onDeselectAll, onLinkBackgroundClick, onDoubleClickAddSystem };

  useEffect(() => { systemsRef.current = systems; }, [systems]);
  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { strokesRef.current = strokes; }, [strokes]);
  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { shipDragRef.current = shipDrag; }, [shipDrag]);
  useEffect(() => { canEditRef.current = canEdit; }, [canEdit]);

  /* ------------------------------------------------ canvas sizing + redraw */
  function redraw() {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext("2d");
    const { w, h, dpr } = sizeRef.current;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    const v = viewRef.current;
    const all = [...strokesRef.current];
    if (activeStrokeRef.current) all.push(activeStrokeRef.current);
    for (const st of all) {
      if (!st.pts.length) continue;
      ctx.beginPath();
      ctx.strokeStyle = st.color; ctx.lineWidth = Math.max(0.5, st.width * v.scale);
      st.pts.forEach((p, i) => {
        const sx = p.x * v.scale + v.ox, sy = p.y * v.scale + v.oy;
        if (i === 0) ctx.moveTo(sx, sy); else ctx.lineTo(sx, sy);
      });
      if (st.pts.length === 1) {
        const p = st.pts[0];
        ctx.lineTo(p.x * v.scale + v.ox + 0.1, p.y * v.scale + v.oy + 0.1);
      }
      ctx.stroke();
    }
  }
  function resizeCanvas() {
    const el = mapRef.current, cv = canvasRef.current; if (!el || !cv) return;
    const w = el.clientWidth, h = el.clientHeight, dpr = window.devicePixelRatio || 1;
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    cv.style.width = w + "px"; cv.style.height = h + "px";
    sizeRef.current = { w, h, dpr };
    setContainerSize({ w, h });
    redraw();
  }
  useEffect(() => {
    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    if (mapRef.current) ro.observe(mapRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line
  }, [activeTab]);
  useEffect(() => { redraw(); /* eslint-disable-next-line */ }, [strokes, view, containerSize, activeTab]);

  /* ------------------------------------------------ wheel zoom (non-passive) */
  useEffect(() => {
    const el = mapRef.current; if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const lx = e.clientX - rect.left, ly = e.clientY - rect.top;
      setView((v) => {
        const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
        const ns = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, v.scale * factor));
        const wx = (lx - v.ox) / v.scale, wy = (ly - v.oy) / v.scale;
        return { scale: ns, ox: lx - wx * ns, oy: ly - wy * ns };
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [activeTab]);

  /* ------------------------------------------------ pinch-to-zoom (native Touch Events) */
  useEffect(() => {
    const el = mapRef.current; if (!el) return;

    function dist(touches) {
      return Math.max(1, Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY));
    }
    function mid(touches) {
      return { x: (touches[0].clientX + touches[1].clientX) / 2, y: (touches[0].clientY + touches[1].clientY) / 2 };
    }
    function beginPinch(touches) {
      const rect = el.getBoundingClientRect();
      const v = viewRef.current;
      const m = mid(touches);
      pinchRef.current = {
        startDist: dist(touches), startScale: v.scale,
        worldX: (m.x - rect.left - v.ox) / v.scale,
        worldY: (m.y - rect.top - v.oy) / v.scale,
      };
      // a 2nd finger joining takes over as a pinch — cancel whatever the 1st finger was doing
      dragRef.current = null;
      activeStrokeRef.current = null;
      redraw();
    }

    // e.touches is the browser's own live list of currently-active touches — always ground truth,
    // so there's no bookkeeping of our own that can go stale and misfire on a single finger.
    const onTouchStart = (e) => {
      if (e.touches.length >= 2) { e.preventDefault(); beginPinch(e.touches); }
    };
    const onTouchMove = (e) => {
      if (!pinchRef.current || e.touches.length < 2) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const p = pinchRef.current;
      const m = mid(e.touches);
      const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, p.startScale * (dist(e.touches) / p.startDist)));
      setView({ scale: newScale, ox: (m.x - rect.left) - p.worldX * newScale, oy: (m.y - rect.top) - p.worldY * newScale });
    };
    const onTouchEnd = (e) => {
      if (e.touches.length < 2) pinchRef.current = null;
    };
    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: false });
    el.addEventListener("touchcancel", onTouchEnd, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [activeTab]);

  /* ------------------------------------------------ global pointer drag */
  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current;
      const sd = shipDragRef.current;
      if (sd) { setShipDrag((s) => (s ? { ...s, x: e.clientX, y: e.clientY } : s));
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const t = el && el.closest ? el.closest("[data-fleet-id]") : null;
        setHoverFleet(t ? t.getAttribute("data-fleet-id") : null);
      }
      if (!d) return;
      const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
      if (Math.hypot(dx, dy) > 4) d.moved = true;
      if (d.kind === "pan") {
        setView((v) => ({ ...v, ox: d.origOx + dx, oy: d.origOy + dy }));
      } else if (d.kind === "system" && canEditRef.current) {
        const nx = d.origWX + dx / d.scale, ny = d.origWY + dy / d.scale;
        setSystems((ss) => ss.map((s) => (s.id === d.id ? { ...s, x: nx, y: ny } : s)));
      } else if (d.kind === "fleet" && canEditRef.current) {
        const nx = d.origWX + dx / d.scale, ny = d.origWY + dy / d.scale;
        setFleets((fs) => fs.map((f) => (f.id === d.id ? { ...f, x: nx, y: ny, systemId: null } : f)));
      }
    };
    const onUp = (e) => {
      const sd = shipDragRef.current;
      if (sd && canEditRef.current) {
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const t = el && el.closest ? el.closest("[data-fleet-id]") : null;
        const targetId = t ? t.getAttribute("data-fleet-id") : null;
        if (targetId && targetId !== sd.fromFleetId) callbacksRef.current.onShipDrop(sd.fromFleetId, targetId, sd.ship.id);
        setShipDrag(null); setHoverFleet(null);
      } else if (sd) {
        setShipDrag(null); setHoverFleet(null);
      }
      const d = dragRef.current;
      if (d) {
        if (d.kind === "system" && !d.moved) callbacksRef.current.onSystemTap(d.id);
        if (d.kind === "fleet" && !d.moved) callbacksRef.current.onFleetTap(d.id);
        if (d.kind === "fleet" && d.moved) callbacksRef.current.onFleetSnap(d.id, systemsRef.current);
        if (d.kind === "pan" && !d.moved) callbacksRef.current.onDeselectAll();
        dragRef.current = null;
        document.body.style.userSelect = "";
      }
    };
    const onCancel = () => {
      dragRef.current = null;
      document.body.style.userSelect = "";
      setShipDrag(null);
      setHoverFleet(null);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onCancel);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onCancel);
    };
    // eslint-disable-next-line
  }, []);

  /* ------------------------------------------------ escape closes popups */
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") callbacksRef.current.onDeselectAll(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ------------------------------------------------ interaction helpers */
  function startPieceDrag(e, kind, id, wx, wy) {
    e.stopPropagation();
    if (modeRef.current === "draw") return;
    dragRef.current = { kind, id, startX: e.clientX, startY: e.clientY, origWX: wx, origWY: wy, scale: viewRef.current.scale, moved: false };
    document.body.style.userSelect = "none";
  }
  function beginShipDrag(ship, fromFleetId, e) {
    if (!canEditRef.current) return;
    e.stopPropagation();
    setShipDrag({ ship, fromFleetId, x: e.clientX, y: e.clientY });
  }
  function onMapPointerDown(e) {
    if (modeRef.current === "select") {
      dragRef.current = { kind: "pan", startX: e.clientX, startY: e.clientY, origOx: viewRef.current.ox, origOy: viewRef.current.oy, moved: false };
      document.body.style.userSelect = "none";
    } else if (modeRef.current === "link") {
      onLinkBackgroundClick();
    }
  }
  function onMapDoubleClick(e) {
    if (modeRef.current !== "select" || !canEditRef.current) return;
    const rect = mapRef.current.getBoundingClientRect();
    const v = viewRef.current;
    const wx = (e.clientX - rect.left - v.ox) / v.scale;
    const wy = (e.clientY - rect.top - v.oy) / v.scale;
    onDoubleClickAddSystem(wx, wy);
  }

  /* ------------------------------------------------ canvas drawing */
  function canvasDown(e) {
    if (modeRef.current !== "draw" || !canEditRef.current) return;
    e.stopPropagation();
    canvasRef.current.setPointerCapture(e.pointerId);
    const rect = mapRef.current.getBoundingClientRect();
    const v = viewRef.current;
    const wx = (e.clientX - rect.left - v.ox) / v.scale;
    const wy = (e.clientY - rect.top - v.oy) / v.scale;
    activeStrokeRef.current = { id: uid("st"), color: drawColorState, width: drawWidthState, pts: [{ x: wx, y: wy }] };
    redraw();
  }
  function canvasMove(e) {
    const st = activeStrokeRef.current; if (!st) return;
    const rect = mapRef.current.getBoundingClientRect();
    const v = viewRef.current;
    const wx = (e.clientX - rect.left - v.ox) / v.scale;
    const wy = (e.clientY - rect.top - v.oy) / v.scale;
    const prev = st.pts[st.pts.length - 1];
    st.pts.push({ x: wx, y: wy });
    const ctx = canvasRef.current.getContext("2d");
    ctx.strokeStyle = st.color; ctx.lineWidth = Math.max(0.5, st.width * v.scale);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(prev.x * v.scale + v.ox, prev.y * v.scale + v.oy);
    ctx.lineTo(wx * v.scale + v.ox, wy * v.scale + v.oy);
    ctx.stroke();
  }
  function canvasUp() {
    const st = activeStrokeRef.current; if (!st) return;
    activeStrokeRef.current = null;
    setStrokes((s) => [...s, st]);
  }
  const undoStroke = () => { if (canEdit) setStrokes((s) => s.slice(0, -1)); };
  const clearStrokes = () => { if (canEdit) setStrokes([]); };

  return {
    mapRef, canvasRef, containerSize,
    onMapPointerDown, onMapDoubleClick,
    startPieceDrag, beginShipDrag,
    shipDrag, hoverFleet,
    canvasDown, canvasMove, canvasUp,
    undoStroke, clearStrokes,
    drawColor: drawColorState, setDrawColor: setDrawColorState,
    drawWidth: drawWidthState, setDrawWidth: setDrawWidthState,
  };
}
