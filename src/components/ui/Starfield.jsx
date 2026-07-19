// The star layer scattered over the scene backdrop (see theme.sceneBackdrop):
// one fixed tile of eight stars, repeated across the whole surface.
export default function Starfield({ zIndex }) {
  return (
    <div style={{ position: "absolute", inset: 0, opacity: 0.55, pointerEvents: "none", zIndex,
      backgroundImage: `radial-gradient(1px 1px at 20px 30px, #fff, transparent),
        radial-gradient(1px 1px at 130px 80px, #d8c9a0, transparent),
        radial-gradient(1px 1px at 210px 160px, #fff, transparent),
        radial-gradient(1.5px 1.5px at 330px 40px, #cbb98e, transparent),
        radial-gradient(1px 1px at 90px 220px, #fff, transparent),
        radial-gradient(1px 1px at 400px 260px, #e8dfc6, transparent),
        radial-gradient(1px 1px at 520px 120px, #fff, transparent),
        radial-gradient(1.5px 1.5px at 620px 300px, #cbb98e, transparent)`,
      backgroundSize: "640px 360px" }} />
  );
}
