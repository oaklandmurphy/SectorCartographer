import { panelStyle } from "../../theme.js";
import Rivet from "./Rivet.jsx";
import PopupHeader from "./PopupHeader.jsx";

// Shared chrome for every floating popup: the chamfered console plate with its
// two rivets, a titled header, and a scrolling body. Callers pass `frame` (the
// absolute left/top/width, or a mobile bottom-sheet frame) and the header bits;
// the body is `children`. `containerRef` lets a caller measure the outer plate
// (MapPopup uses it to re-fit itself on screen).
export default function PanelPopup({
  frame, maxHeight, zIndex = 50, color, icon, title, onClose, gap = 12, containerRef, children,
}) {
  return (
    <div ref={containerRef} className="pop"
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
