// Diffing a proposed codex edit against the live entry, so the GM sees exactly
// what a player changed before approving: added text green, removed text red.
//
// Word-level by default (reads best for prose); for very large bodies it falls
// back to a line-level pass to keep the O(n·m) LCS affordable. Output is an
// ordered list of runs { type: "same" | "add" | "del", text }. Dropping the
// "del" runs rejoins to the proposed text; dropping "add" rejoins to the
// original — so nothing is lost or invented, only marked.

// Split into alternating word and whitespace runs so rejoining the tokens
// reproduces the source exactly (a changed space shows up as its own edit
// rather than smearing across neighbouring words).
const WORD = /\s+|\S+/g;

// Above this token budget the full LCS table gets too big to hold; diff by
// lines instead, which keeps a pasted-in roster or a very long entry responsive.
const MAX_CELLS = 4_000_000;

function lcs(a, b) {
  const n = a.length, m = b.length, w = m + 1;
  // dp[i*w+j] = length of the longest common subsequence of a[i..] and b[j..].
  const dp = new Int32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i * w + j] = a[i] === b[j]
        ? dp[(i + 1) * w + (j + 1)] + 1
        : Math.max(dp[(i + 1) * w + j], dp[i * w + (j + 1)]);
    }
  }
  // Walk the table forward, emitting a delete when only the left side advances,
  // an add when only the right does, and a match otherwise.
  const ops = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { ops.push({ type: "same", text: b[j] }); i++; j++; }
    else if (dp[(i + 1) * w + j] >= dp[i * w + (j + 1)]) { ops.push({ type: "del", text: a[i] }); i++; }
    else { ops.push({ type: "add", text: b[j] }); j++; }
  }
  while (i < n) ops.push({ type: "del", text: a[i++] });
  while (j < m) ops.push({ type: "add", text: b[j++] });
  return ops;
}

// Fold neighbouring runs of the same type together, so the renderer draws one
// span per change instead of one per token.
function coalesce(ops) {
  const out = [];
  for (const op of ops) {
    const last = out[out.length - 1];
    if (last && last.type === op.type) last.text += op.text;
    else out.push({ type: op.type, text: op.text });
  }
  return out;
}

export function diffText(before, after) {
  const a = String(before || "").match(WORD) || [];
  const b = String(after || "").match(WORD) || [];
  if (a.length * b.length > MAX_CELLS) {
    // Keep the trailing newline on each line (capturing split) so line breaks
    // survive the rejoin.
    const al = String(before || "").split(/(?<=\n)/);
    const bl = String(after || "").split(/(?<=\n)/);
    return coalesce(lcs(al, bl));
  }
  return coalesce(lcs(a, b));
}
