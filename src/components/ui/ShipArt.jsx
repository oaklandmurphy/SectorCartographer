import { Ship } from "lucide-react";
import { T } from "../../theme.js";
import { findArt, artDataUri } from "../../lib/shipArt.js";

// The picture for one model name, or a placeholder slot when nothing matches.
//
// Ships are wider than they are tall, so the box takes a separate `height` —
// a square would waste most of its area on empty space above and below the hull.
// The image is scaled to fit inside the box, never cropped or stretched.
//
// Rendered as <img src="data:image/svg+xml,…"> deliberately: the art library is
// world-writable, and an <img> cannot execute scripts out of an SVG. See the
// security note in lib/shipArt.js before changing this.

// Library art tends to be drawn hard against the left of its own viewBox, so an
// honestly-centred fit still reads as jammed into the left edge of the box. This
// is the strip of the width reserved on the left to push it back off the edge;
// the image shifts right by half of it. Tune here — it applies at every size.
const ART_NUDGE = 0.05;

export default function ShipArt({
  art, model, size = 34, height, placeholder = true, plate = false, title,
}) {
  const w = size;
  const h = height == null ? size : height;
  const found = findArt(art, model);
  const uri = found ? artDataUri(found.svg) : null;

  const box = {
    width: w, height: h, flexShrink: 0, display: "flex",
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  };

  if (!uri) {
    if (!placeholder) return null;
    return (
      <div title={model ? `No art named "${model}"` : "No model set"}
        style={{ ...box, border: `1px dashed ${T.line}`, color: T.faint, opacity: 0.5 }}>
        <Ship size={Math.max(10, Math.round(Math.min(w, h) * 0.45))} strokeWidth={1.4} />
      </div>
    );
  }
  // Padding rather than a transform: the box clips, and shifting a hull that
  // already spans the full width would cut its nose off. Padding narrows the
  // area the image fits into instead, so it stays whole.
  return (
    <div title={title || found.name}
      style={{ ...box, paddingLeft: Math.max(2, Math.round(w * ART_NUDGE)),
        ...(plate ? { background: T.panel3, border: `1px solid ${T.line}` } : null) }}>
      <img src={uri} alt={found.name}
        style={{ maxWidth: "100%", maxHeight: "100%", display: "block" }} />
    </div>
  );
}
