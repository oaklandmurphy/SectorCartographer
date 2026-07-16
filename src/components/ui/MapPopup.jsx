import { useLayoutEffect, useRef, useState } from "react";
import { panelStyle } from "../../theme.js";
import { EDGE, GAP, placePopup, popupMaxHeight } from "../../lib/popupPlacement.js";
import Rivet from "./Rivet.jsx";
import PopupHeader from "./PopupHeader.jsx";

// Shared frame for the map's piece popups. Desktop: anchored beside the piece and kept
// fully on screen. Mobile: a bottom sheet, since a 300px card anchored to a piece has
// nowhere to fit on a phone.
export default function MapPopup({
  anchor, containerSize, isMobile, width, color, icon, title, onClose, gap = 12, children,
}) {
  const ref = useRef(null);
  const [size, setSize] = useState(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || isMobile) return; // the sheet is sized by CSS — nothing to measure
    const measure = () => {
      const r = el.getBoundingClientRect();
      setSize((prev) => (prev && prev.w === r.width && prev.h === r.height ? prev : { w: r.width, h: r.height }));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return; // measured once; just no live re-fit
    const ro = new ResizeObserver(measure); // re-fit as carriers/markers are added
    ro.observe(el);
    return () => ro.disconnect();
  }, [isMobile]);

  const maxHeight = popupMaxHeight(containerSize.h, isMobile);
  const pos = !isMobile && size ? placePopup(anchor, size, containerSize) : null;
  const frame = isMobile
    ? { left: EDGE, right: EDGE, bottom: EDGE }
    : {
        left: pos ? pos.x : anchor.x + GAP,
        top: pos ? pos.y : anchor.y - 24,
        width,
        // first paint happens after the layout effect measures, so this only ever
        // hides a frame we couldn't measure at all
        visibility: pos ? "visible" : "hidden",
      };

  return (
    <div ref={ref} className="pop" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
      style={{ position: "absolute", zIndex: 50, maxHeight, display: "flex", flexDirection: "column",
        ...panelStyle, ...frame }}>
      <Rivet corner="tr" /><Rivet corner="bl" />
      <PopupHeader color={color} icon={icon} title={title} onClose={onClose} />
      <div className="scroll" style={{ padding: 12, display: "flex", flexDirection: "column", gap,
        overflowY: "auto", minHeight: 0, flex: "1 1 auto",
        overscrollBehavior: "contain", WebkitOverflowScrolling: "touch" }}>
        {children}
      </div>
    </div>
  );
}
