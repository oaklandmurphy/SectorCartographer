export const T = {
  void: "#0c0a06", panel: "#181510", panel2: "#211c15", panel3: "#2a2318",
  line: "#4a4030", text: "#d8d0b8", mut: "#a89c82", faint: "#6b6250",
  accent: "#9fc23a", amber: "#d98f2b", danger: "#b23a2e",
  // near-black ink for borders/icon chips against a colored swatch
  ink: "#14110b",
  // dark text/icon color for use on top of the bright accent/amber fills
  onAccent: "#0f1207",
  // light red tint for danger text on dark backgrounds
  dangerText: "#e5988c",
};

// Canonical font stacks. Keep in sync with the @import and .mono/.stencil
// rules in index.css — those exist so plain (non-inline) markup and the
// `button`/`input` resets also pick up the right family.
export const F = {
  body: "'Oswald', ui-sans-serif, system-ui, sans-serif",
  display: "'Big Shoulders Stencil', 'Oswald', sans-serif",
  mono: "'IBM Plex Mono', ui-monospace, \"SF Mono\", Menlo, Consolas, monospace",
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
  fontFamily: F.body,
};

// Backdrop shared by the map and politics scenes: a faint survey grid under a
// vignette over the void. Callers add their own `cursor` and the <Starfield/>
// layer on top.
export const sceneBackdrop = {
  position: "relative", flex: 1, overflow: "hidden", userSelect: "none", backgroundColor: T.void,
  backgroundImage: `radial-gradient(ellipse at 50% 42%, rgba(0,0,0,0) 0%, rgba(0,0,0,.6) 100%),
    repeating-linear-gradient(0deg, rgba(90,78,56,.12) 0px, rgba(90,78,56,.12) 1px, transparent 1px, transparent 64px),
    repeating-linear-gradient(90deg, rgba(90,78,56,.12) 0px, rgba(90,78,56,.12) 1px, transparent 1px, transparent 64px)`,
};

// Chrome for the translucent chips that float over a scene (hints, legends).
export const floatingPanel = {
  background: `${T.panel}e6`, border: `1px solid ${T.line}`, ...cut(8),
  boxShadow: "0 10px 30px rgba(0,0,0,.6)",
};
