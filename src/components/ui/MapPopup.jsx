import { useLayoutEffect, useRef, useState } from "react";
import { EDGE, GAP, placePopup, popupMaxHeight } from "../../lib/popupPlacement.js";
import PanelPopup from "./PanelPopup.jsx";

// Anchored variant of PanelPopup for the map's piece popups. Desktop: placed
// beside the piece and kept fully on screen (measured, then re-fit). Mobile: a
// bottom sheet, since a 300px card anchored to a piece has nowhere to fit on a
// phone.
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
    <PanelPopup containerRef={ref} frame={frame} maxHeight={popupMaxHeight(containerSize.h, isMobile)}
      color={color} icon={icon} title={title} onClose={onClose} gap={gap}>
      {children}
    </PanelPopup>
  );
}
