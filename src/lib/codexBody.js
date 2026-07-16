// Codex bodies are plain text, but a fenced ```csv block renders as a real
// table, so an entry can carry a roster or a stat block instead of hand-spaced
// ASCII columns that fall apart the moment a name gets longer. Everything
// outside a block stays literal prose.
//
//   ```csv Fleet Roster        <- anything after "csv" becomes the table caption
//   Ship,Class,Crew
//   Hand of Gorb,Flagship,"2,400"
//   ```
//
// Quoting follows the convention every spreadsheet exports: wrap a field in
// double quotes to keep commas inside it, and double the quote ("") to write a
// literal one. A table pasted straight out of Sheets or Excel just works.

const FENCE_OPEN = /^```csv[ \t]*(.*)$/i;
const FENCE_CLOSE = /^```[ \t]*$/;

// Starter block for the editor's "Insert table" button. The caption is exported
// separately so the caller can pre-select it for the writer to type over.
export const CSV_TEMPLATE_CAPTION = "Table Title";
export const CSV_TEMPLATE = `\`\`\`csv ${CSV_TEMPLATE_CAPTION}\nColumn,Column,Column\nvalue,value,value\n\`\`\``;

// Body -> ordered segments of {kind:"text", text} and {kind:"table", caption, rows}.
export function splitBody(body) {
  const out = [];
  let text = [];
  let csv = null;        // non-null only while inside a block
  let caption = "";

  const flushText = () => {
    // Trim the blank lines that hug a fence — the caller spaces segments out
    // with a flex gap, so keeping them would double the gap.
    const t = text.join("\n").replace(/^\n+|\n+$/g, "");
    if (t !== "") out.push({ kind: "text", text: t });
    text = [];
  };
  const flushTable = () => {
    out.push({ kind: "table", caption, rows: parseCsv(csv.join("\n")) });
    csv = null;
    caption = "";
  };

  for (const line of String(body || "").split("\n")) {
    if (csv) {
      if (FENCE_CLOSE.test(line)) flushTable();
      else csv.push(line);
      continue;
    }
    const open = line.match(FENCE_OPEN);
    if (open) {
      flushText();
      csv = [];
      caption = open[1].trim();
    } else text.push(line);
  }
  // An unclosed block still renders as a table: in the live preview the writer
  // is simply mid-typing, and showing them fence markers is worse than a table.
  if (csv) flushTable();
  flushText();
  return out;
}

// CSV text -> rows of cells. Handles quoted fields, "" escapes, and CRLF.
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;    // currently inside a "..." field
  let hadQuotes = false; // this field was quoted -> its whitespace is deliberate

  const endField = () => {
    row.push(hadQuotes ? field : field.trim());
    field = "";
    hadQuotes = false;
  };
  const endRow = () => {
    endField();
    if (row.some((c) => c !== "")) rows.push(row); // drop blank lines
    row = [];
  };

  const s = String(text || "").replace(/\r\n?/g, "\n");
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (s[i + 1] === '"') { field += '"'; i++; }
      else quoted = false;
      continue;
    }
    if (c === '"' && field.trim() === "") { quoted = true; hadQuotes = true; field = ""; }
    else if (c === ",") endField();
    else if (c === "\n") endRow();
    else field += c;
  }
  endRow();

  // Ragged rows are normal in a hand-written table; pad so the columns line up.
  const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
  return rows.map((r) => (r.length === width ? r : [...r, ...Array(width - r.length).fill("")]));
}

// Which columns hold only numbers — a stat column being scannable is half the
// reason to want a table here, and that means right-aligning it.
const NUMERIC = /^[-+]?[$₡]?\d[\d,]*(\.\d+)?%?$/;
const BLANK = /^[—–-]?$/; // empty or a "no value" dash — doesn't make a column non-numeric

export function numericColumns(rows) {
  if (rows.length < 2) return [];
  return rows[0].map((_, c) => {
    const vals = rows.slice(1).map((r) => (r[c] || "").trim()).filter((v) => !BLANK.test(v));
    return vals.length > 0 && vals.every((v) => NUMERIC.test(v));
  });
}

// One-line gist of a body for the entry list. Raw fence markers and comma-run
// rows are noise at 90 characters, so a table collapses to its caption.
export function bodyExcerpt(body) {
  return splitBody(body)
    .map((s) => (s.kind === "text" ? s.text : `[${s.caption || "table"}]`))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}
