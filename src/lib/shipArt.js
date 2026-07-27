// The ship-art library: a sector-wide set of SVG drawings, one per named design.
//
// Art is matched to a carrier or a squadron by NAME. A squadron of
// "Flooba mk3 Fighters" picks up the library entry called "Flooba mk3 Fighters",
// and every hangar flying that model shows the same drawing from one upload.
// Model fields stay free text; the library is an optional layer on top.
//
// An entry is { id, name, svg } where `svg` is the raw file text, stored
// inline (like codex images — see lib/codexImage.js — this needs no Cloud
// Storage bucket, so it works on the free Spark plan).
//
// SECURITY — read before changing how art is rendered:
// Uploaded SVG is only ever displayed through <img src="data:image/svg+xml,…">.
// An <img> will not run scripts or fetch external resources from the SVG, which
// matters here because the Firebase path is world-writable — anyone who finds
// the database can drop a file into this library. Do NOT switch this to an
// inline <svg> or dangerouslySetInnerHTML without real sanitizing first; that
// would turn the library into a stored-XSS vector against every visitor.

export const MAX_ART_BYTES = 128 * 1024; // a ship silhouette needs nowhere near this

const norm = (s) => (s || "").trim().toLowerCase();

// Look up art for a model name. Matching ignores case and surrounding space so
// "flooba mk3 fighters" still finds "Flooba mk3 Fighters".
export function findArt(art, name) {
  const k = norm(name);
  if (!k) return null;
  return (art || []).find((a) => norm(a.name) === k) || null;
}

export function artDataUri(svg) {
  if (!svg) return null;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// Gate a picked file before it can enter the library. Returns an error string,
// or null when the file is acceptable.
export function validateSvg(text, byteLength) {
  if (byteLength > MAX_ART_BYTES) {
    return `too large (${Math.round(byteLength / 1024)}KB, max ${MAX_ART_BYTES / 1024}KB)`;
  }
  if (!/<svg[\s>]/i.test(text || "")) return "doesn't look like an SVG file";
  // Rendering via <img> already neutralises scripts; rejecting them anyway keeps
  // the library clean and means a future inline-render refactor can't be a hole.
  if (/<script[\s>]/i.test(text)) return "contains a <script> tag";
  return null;
}

// How many carriers / squadrons currently point at this art name. Drives the
// "nothing uses this yet" hint in the library, since a name that matches nothing
// is the one mistake this design makes easy.
export function artUsage(fleets, name) {
  const k = norm(name);
  let carriers = 0, squadrons = 0;
  if (!k) return { carriers, squadrons };
  for (const f of fleets || []) {
    for (const c of f.ships || []) {
      if (norm(c.model) === k) carriers++;
      for (const q of c.squadrons || []) if (norm(q.model) === k) squadrons++;
    }
  }
  return { carriers, squadrons };
}

// Union of name lists, trimmed, deduped and sorted — feeds the model
// autocompletes, which suggest both library entries and names already in use.
export function mergeNames(...lists) {
  const seen = new Set();
  for (const list of lists) {
    for (const n of list || []) {
      const t = (n || "").trim();
      if (t) seen.add(t);
    }
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}
