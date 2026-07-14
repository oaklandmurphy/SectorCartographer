export default function TargetBrackets({ color, pulse, inset = -6, armLen = 9, thick = 2 }) {
  const arm = (which) => {
    const base = { position: "absolute", width: armLen, height: armLen };
    const b = `${thick}px solid ${color}`;
    if (which === "tl") return { ...base, top: inset, left: inset, borderTop: b, borderLeft: b };
    if (which === "tr") return { ...base, top: inset, right: inset, borderTop: b, borderRight: b };
    if (which === "bl") return { ...base, bottom: inset, left: inset, borderBottom: b, borderLeft: b };
    return { ...base, bottom: inset, right: inset, borderBottom: b, borderRight: b };
  };
  return (
    <div style={{ position: "absolute", inset: 0, animation: pulse ? "pulse 1.1s infinite" : "none", pointerEvents: "none" }}>
      <div style={arm("tl")} /><div style={arm("tr")} /><div style={arm("bl")} /><div style={arm("br")} />
    </div>
  );
}
