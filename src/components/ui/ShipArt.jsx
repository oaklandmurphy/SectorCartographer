import { useId } from "react";
import { Ship } from "lucide-react";
import { T } from "../../theme.js";
import { findArt, artDataUri } from "../../lib/shipArt.js";

// The picture for one model name, or a placeholder slot when nothing matches.
//
// Ships are wider than they are tall, so the box takes a separate `height` —
// a square would waste most of its area on empty space above and below the hull.
// The image is scaled to fit inside the box, never cropped or stretched.
//
// Rendered as a plain <img> deliberately: the art library is world-writable,
// and an <img> cannot execute scripts out of an SVG. See the security note
// in lib/shipArt.js before changing this.

// Library art tends to be drawn hard against the left of its own viewBox, so an
// honestly-centred fit still reads as jammed into the left edge of the box. This
// is the strip of the width reserved on the left to push it back off the edge;
// the image shifts right by half of it. Tune here — it applies at every size.
const ART_NUDGE = 0.05;

// How strongly the faction-color wash reads over the art, 0 (invisible) to 1
// (fully replaces the hull's hue/saturation). Tune here.
const TINT_STRENGTH = 0.1;

export default function ShipArt({
  art, model, size = 34, height, placeholder = true, plate = false, title, color,
}) {
  const filterId = useId();
  const w = size;
  const h = height == null ? size : height;
  const found = findArt(art, model);
  const uri = artDataUri(found && found.svg);

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
  const nudge = Math.max(2, Math.round(w * ART_NUDGE));
  return (
    <div title={title || found.name}
      style={{ ...box, paddingLeft: nudge,
        ...(plate ? { background: T.panel3, border: `1px solid ${T.line}` } : null),
        ...(color ? { "--ship-tint": color } : null) }}>
      <img src={uri} alt={found.name}
        style={{ maxWidth: "100%", maxHeight: "100%", display: "block",
          ...(color ? { filter: `url(#${filterId})` } : null) }} />
      {/* Faction-color wash. An SVG filter clips the flood color to the img's
          own rendered alpha channel (SourceAlpha), so it always tints exactly
          the drawn hull — unlike a CSS mask, this doesn't depend on the
          uploaded SVG exposing a clean intrinsic size for "contain" sizing. */}
      {color && (
        <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
          <filter id={filterId}>
            <feFlood style={{ floodColor: "var(--ship-tint)" }} result="flood" />
            <feComposite in="flood" in2="SourceAlpha" operator="in" result="tintShape" />
            <feComponentTransfer in="tintShape" result="tintShapeSoft">
              <feFuncA type="linear" slope={TINT_STRENGTH} />
            </feComponentTransfer>
            <feBlend in="tintShapeSoft" in2="SourceGraphic" mode="color" />
          </filter>
        </svg>
      )}
    </div>
  );
}
