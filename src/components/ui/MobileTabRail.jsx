import { useState } from "react";
import { ChevronDown, ChevronUp, Menu } from "lucide-react";
import { T, F } from "../../theme.js";

// A mobile substitute for a horizontal-scrolling tab strip. Instead of a row of
// chips that can run off the edge of a phone screen (and hide entries with no
// visual sign there's more), this collapses to a single button showing the
// current selection; tapping it drops down the full list, styled like the
// vertical desktop rail, to pick from. Closes itself on any tap inside —
// selecting an item is expected to close it; callers don't need to manage that.
export default function MobileTabRail({ label, icon, accentColor, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: "relative", flexShrink: 0, zIndex: 20,
      borderBottom: open ? "none" : `2px solid ${T.line}` }}>
      <button onClick={() => setOpen((o) => !o)}
        style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, cursor: "pointer",
          border: "none", padding: "11px 12px", background: T.panel, color: accentColor || T.text,
          fontFamily: F.body, fontSize: 13, fontWeight: 600, letterSpacing: ".03em",
          textTransform: "uppercase" }}>
        {icon || <Menu size={15} />}
        <span style={{ flex: 1, minWidth: 0, textAlign: "left", overflow: "hidden",
          textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {open && (
        <div className="scroll" onClick={() => setOpen(false)}
          style={{ position: "absolute", top: "100%", left: 0, right: 0, zIndex: 45, maxHeight: "60vh", overflowY: "auto",
            background: T.panel, borderBottom: `2px solid ${T.line}`, boxShadow: "0 14px 30px rgba(0,0,0,.6)",
            padding: 8, display: "flex", flexDirection: "column", gap: 5 }}>
          {children}
        </div>
      )}
    </div>
  );
}
