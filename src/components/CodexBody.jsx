import { T } from "../theme.js";
import { splitBody, numericColumns } from "../lib/codexBody.js";

// Renders a codex entry's body: prose as-is, ```csv blocks as tables.
// See lib/codexBody.js for the block syntax.
export default function CodexBody({ body, isMobile }) {
  const segments = splitBody(body);
  if (segments.length === 0) return <span style={{ color: T.faint }}>(This entry is empty.)</span>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      {segments.map((seg, i) =>
        seg.kind === "text" ? (
          <div key={i} className="mono" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word",
            lineHeight: 1.7, fontSize: 13.5, color: T.text }}>
            {seg.text}
          </div>
        ) : (
          <CsvTable key={i} caption={seg.caption} rows={seg.rows} isMobile={isMobile} />
        )
      )}
    </div>
  );
}

function CsvTable({ caption, rows, isMobile }) {
  if (rows.length === 0) return null;
  const [head, ...body] = rows;
  const numeric = numericColumns(rows);
  const align = (c) => (numeric[c] ? "right" : "left");
  const pad = isMobile ? "5px 8px" : "6px 11px";

  return (
    <div>
      {caption && (
        <div className="stencil" style={{ fontSize: 13, fontWeight: 700, letterSpacing: ".06em",
          textTransform: "uppercase", color: T.accent, marginBottom: 5 }}>
          {caption}
        </div>
      )}
      {/* Hug the content rather than stretch: a two-column stat block flung out to
          full width reads as two unrelated columns. Cells wrap to fit the entry,
          and only a table too wide even for that scrolls inside its own box. */}
      <div className="scroll" style={{ display: "inline-block", verticalAlign: "top", maxWidth: "100%",
        overflowX: "auto", border: `1px solid ${T.line}`, background: T.panel }}>
        <table className="mono" style={{ borderCollapse: "collapse", fontSize: 12 }}>
          <thead>
            <tr>
              {head.map((cell, c) => (
                <th key={c} style={{ textAlign: align(c), padding: pad, whiteSpace: "nowrap",
                  background: T.panel3, color: T.accent, borderBottom: `1px solid ${T.line}`,
                  fontFamily: "'Oswald', sans-serif", fontSize: 11, fontWeight: 600,
                  letterSpacing: ".08em", textTransform: "uppercase" }}>
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, r) => (
              <tr key={r} style={{ background: r % 2 ? "rgba(255,255,255,.02)" : "transparent" }}>
                {row.map((cell, c) => (
                  <td key={c} style={{ textAlign: align(c), padding: pad, color: T.text,
                    borderTop: r === 0 ? "none" : `1px solid rgba(74,64,48,.5)`,
                    verticalAlign: "top", lineHeight: 1.5 }}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
