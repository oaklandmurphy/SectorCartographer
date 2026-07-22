import { useCallback } from "react";
import { panelStyle } from "../../theme.js";
import Rivet from "./Rivet.jsx";
import PopupHeader from "./PopupHeader.jsx";

// Stop wheel events at the popup so the scene's native zoom listener (an
// ancestor) never sees them. A stable module-level reference keeps
// addEventListener idempotent and lets the listener die with the node.
const stopWheel = (e) => e.stopPropagation();

// Shared chrome for every floating popup: the chamfered console plate with its
// two rivets, a titled header, and a scrolling body. Callers pass `frame` (the
// absolute left/top/width, or a mobile bottom-sheet frame) and the header bits;
// the body is `children`. `containerRef` lets a caller measure the outer plate
// (MapPopup uses it to re-fit itself on screen).
export default function PanelPopup({
  frame, maxHeight, zIndex = 50, color, icon, title, onClose, gap = 12, containerRef, children,
}) {
  // The map/politics scenes zoom via a native `wheel` listener on their
  // container. That listener sits between this popup and the React root in the
  // bubble path, so it fires before any React onWheel here could stop it — a
  // synthetic handler can't cancel it. Attach a native listener on the plate to
  // swallow the wheel over the popup, so scrolling its body never zooms the
  // scene behind it. A callback ref keeps any caller-supplied `containerRef`.
  const setRef = useCallback((node) => {
    if (typeof containerRef === "function") containerRef(node);
    else if (containerRef) containerRef.current = node;
    if (node) node.addEventListener("wheel", stopWheel, { passive: false });
  }, [containerRef]);

  return (
    <div ref={setRef} className="pop"
      onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}
      style={{ position: "absolute", zIndex, maxHeight, display: "flex", flexDirection: "column",
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
