export interface Point {
  x: number;
  y: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Builds a smooth SVG path string from an array of points using
 * quadratic Bézier curves through midpoints. Each raw point becomes
 * a control point; midpoints between consecutive points become endpoints.
 * This eliminates sharp corners without any look-ahead.
 */
export function buildSmoothPath(points: Point[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    // Single tap: render a tiny horizontal stub so strokeLinecap="round"
    // draws a visible dot.
    const { x, y } = points[0];
    return `M ${fmt(x - 0.1)} ${fmt(y)} L ${fmt(x + 0.1)} ${fmt(y)}`;
  }

  let d = `M ${fmt(points[0].x)} ${fmt(points[0].y)}`;

  for (let i = 1; i < points.length - 1; i++) {
    const cp = points[i];
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${fmt(cp.x)} ${fmt(cp.y)} ${fmt(midX)} ${fmt(midY)}`;
  }

  const last = points[points.length - 1];
  d += ` L ${fmt(last.x)} ${fmt(last.y)}`;

  return d;
}

export function computeBoundingBox(points: Point[]): BoundingBox {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

  let minX = points[0].x;
  let minY = points[0].y;
  let maxX = points[0].x;
  let maxY = points[0].y;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

const fmt = (n: number) => n.toFixed(2);
