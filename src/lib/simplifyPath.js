// Thins a freehand stroke's point list before it's saved. Pointermove fires far
// more often than the line actually bends, so a raw stroke carries many points
// that sit almost exactly on the segment between their neighbors — this drops
// those without changing how the line looks, using the standard
// Ramer-Douglas-Peucker algorithm (perpendicular-distance tolerance in world
// units, same space `pts` is already stored in, so it thins the same amount
// regardless of zoom level at draw time).

function sqDistToSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (!lenSq) { const ex = p.x - a.x, ey = p.y - a.y; return ex * ex + ey * ey; }
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const ex = p.x - (a.x + t * dx), ey = p.y - (a.y + t * dy);
  return ex * ex + ey * ey;
}

export function simplifyPath(pts, tolerance = 1.5) {
  if (!pts || pts.length < 3) return pts || [];
  const tolSq = tolerance * tolerance;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1; keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [start, end] = stack.pop();
    let maxDist = -1, maxIdx = -1;
    for (let i = start + 1; i < end; i++) {
      const d = sqDistToSegment(pts[i], pts[start], pts[end]);
      if (d > maxDist) { maxDist = d; maxIdx = i; }
    }
    if (maxDist > tolSq) {
      keep[maxIdx] = 1;
      stack.push([start, maxIdx], [maxIdx, end]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}
