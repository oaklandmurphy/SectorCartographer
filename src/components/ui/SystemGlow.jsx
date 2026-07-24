// A soft radial halo behind a system's plate — distinct from TargetBrackets
// (which marks direct selection/link-source), this marks a system's relevance
// to whichever agent is currently selected: its home system (pulsing) or one
// reachable in a single hyperlane hop from it (steady, dimmer).
export default function SystemGlow({ color, pulse, size = 1 }) {
  return (
    <div style={{ position: "absolute", inset: -12 * size, borderRadius: "50%", pointerEvents: "none",
      background: `radial-gradient(circle, ${color}59 0%, ${color}26 55%, transparent 78%)`,
      boxShadow: `0 0 ${16 * size}px ${color}99, 0 0 ${30 * size}px ${color}44`,
      animation: pulse ? "pulse 1.6s infinite" : "none" }} />
  );
}
