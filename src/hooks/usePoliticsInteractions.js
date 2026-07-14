import { useEffect, useRef, useState } from "react";
import { MIN_ZOOM, MAX_ZOOM } from "../constants.js";

// Pan / zoom / faction-node-drag for the politics map. A lighter sibling of
// useMapInteractions: no drawing canvas or ship dragging, just moving the view
// and repositioning faction nodes. Like the map hook, it subscribes global
// pointer listeners once and reaches live callbacks/state through refs so a
// drag started mid-render never closes over stale values.
export function usePoliticsInteractions({
  view, setView, canEdit,
  onFactionTap, onFactionMove, onBackgroundTap,
}) {
  const mapRef = useRef(null);
  const dragRef = useRef(null);
  const viewRef = useRef(view);
  const canEditRef = useRef(canEdit);
  const pinchRef = useRef(null);
  const [containerSize, setContainerSize] = useState({ w: 0, h: 0 }); // 0 until measured, so first-load centering uses the real size

  const cbRef = useRef(null);
  cbRef.current = { onFactionTap, onFactionMove, onBackgroundTap };

  useEffect(() => { viewRef.current = view; }, [view]);
  useEffect(() => { canEditRef.current = canEdit; }, [canEdit]);

  /* ------------------------------------------------ container sizing */
  useEffect(() => {
    const el = mapRef.current; if (!el) return;
    const measure = () => setContainerSize({ w: el.clientWidth, h: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ------------------------------------------------ wheel zoom to cursor */
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
  }, [setView]);

  /* ------------------------------------------------ pinch-to-zoom */
  useEffect(() => {
    const el = mapRef.current; if (!el) return;
    const dist = (t) => Math.max(1, Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY));
    const mid = (t) => ({ x: (t[0].clientX + t[1].clientX) / 2, y: (t[0].clientY + t[1].clientY) / 2 });
    const onStart = (e) => {
      if (e.touches.length < 2) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect(); const v = viewRef.current; const m = mid(e.touches);
      pinchRef.current = { startDist: dist(e.touches), startScale: v.scale,
        worldX: (m.x - rect.left - v.ox) / v.scale, worldY: (m.y - rect.top - v.oy) / v.scale };
      dragRef.current = null;
    };
    const onMove = (e) => {
      if (!pinchRef.current || e.touches.length < 2) return;
      e.preventDefault();
      const rect = el.getBoundingClientRect(); const p = pinchRef.current; const m = mid(e.touches);
      const ns = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, p.startScale * (dist(e.touches) / p.startDist)));
      setView({ scale: ns, ox: (m.x - rect.left) - p.worldX * ns, oy: (m.y - rect.top) - p.worldY * ns });
    };
    const onEnd = (e) => { if (e.touches.length < 2) pinchRef.current = null; };
    el.addEventListener("touchstart", onStart, { passive: false });
    el.addEventListener("touchmove", onMove, { passive: false });
    el.addEventListener("touchend", onEnd, { passive: false });
    el.addEventListener("touchcancel", onEnd, { passive: false });
    return () => {
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, [setView]);

  /* ------------------------------------------------ global pointer drag (pan or node move) */
  useEffect(() => {
    const onMove = (e) => {
      const d = dragRef.current; if (!d) return;
      const dx = e.clientX - d.startX, dy = e.clientY - d.startY;
      if (Math.hypot(dx, dy) > 4) d.moved = true;
      if (d.kind === "pan") {
        setView((v) => ({ ...v, ox: d.origOx + dx, oy: d.origOy + dy }));
      } else if (d.kind === "faction" && canEditRef.current) {
        cbRef.current.onFactionMove(d.id, d.origWX + dx / d.scale, d.origWY + dy / d.scale);
      }
    };
    const onUp = () => {
      const d = dragRef.current; if (!d) return;
      if (!d.moved) {
        if (d.kind === "faction") cbRef.current.onFactionTap(d.id);
        if (d.kind === "pan") cbRef.current.onBackgroundTap();
      }
      dragRef.current = null;
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [setView]);

  function onBackgroundPointerDown(e) {
    dragRef.current = { kind: "pan", startX: e.clientX, startY: e.clientY,
      origOx: viewRef.current.ox, origOy: viewRef.current.oy, moved: false };
    document.body.style.userSelect = "none";
  }
  function startFactionDrag(e, id, wx, wy) {
    e.stopPropagation();
    dragRef.current = { kind: "faction", id, startX: e.clientX, startY: e.clientY,
      origWX: wx, origWY: wy, scale: viewRef.current.scale, moved: false };
    document.body.style.userSelect = "none";
  }

  return { mapRef, containerSize, onBackgroundPointerDown, startFactionDrag };
}
