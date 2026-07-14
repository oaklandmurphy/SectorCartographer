export const T = {
  void: "#0c0a06", panel: "#181510", panel2: "#211c15", panel3: "#2a2318",
  line: "#4a4030", text: "#d8d0b8", mut: "#a89c82", faint: "#6b6250",
  accent: "#9fc23a", amber: "#d98f2b", danger: "#b23a2e",
};

// clip-path corner-cut ("chamfer") for angular console-plate panels
export const cut = (px) => ({
  clipPath: `polygon(${px}px 0, 100% 0, 100% calc(100% - ${px}px), calc(100% - ${px}px) 100%, 0 100%, 0 ${px}px)`,
});

export const panelStyle = {
  background: T.panel, border: `1px solid ${T.line}`, ...cut(12),
  boxShadow: "0 10px 30px rgba(0,0,0,.6)",
};
export const inputStyle = {
  background: T.panel2, border: `1px solid ${T.line}`, color: T.text,
  borderRadius: 2, padding: "5px 8px", fontSize: 12, outline: "none", width: "100%",
  fontFamily: "inherit",
};
export const selStyle = { ...inputStyle, cursor: "pointer" };
export const lbl = {
  fontSize: 10, letterSpacing: ".14em", textTransform: "uppercase", color: T.faint, fontWeight: 600,
  fontFamily: "'Oswald', sans-serif",
};
