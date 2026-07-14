export default function Rivet({ corner }) {
  const pos = {
    tr: { top: 5, right: 5 }, bl: { bottom: 5, left: 5 },
    tl: { top: 5, left: 5 }, br: { bottom: 5, right: 5 },
  }[corner];
  return (
    <div style={{ position: "absolute", ...pos, width: 5, height: 5, borderRadius: "50%",
      background: "radial-gradient(circle at 35% 30%, #8a7d5c, #14110b 75%)",
      boxShadow: "0 0 0 1px rgba(0,0,0,.6)", pointerEvents: "none" }} />
  );
}
