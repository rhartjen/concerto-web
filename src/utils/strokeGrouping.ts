import type { BoundingBox } from './pathUtils';
import { STROKE_GROUP_WINDOW_MS, STROKE_GROUP_PROXIMITY_PX } from '../constants/limits';

// ── Minimal interface ──────────────────────────────────────────────────────────
// Only the fields needed for grouping decisions. DrawingObject satisfies this
// structurally, so no import of drawingsStore (avoids a circular dependency).

export interface Groupable {
  strokeColor: string;
  createdAt:   number;
  isLocked:    boolean;
  boundingBox: BoundingBox;
}

// ── Geometry helpers ───────────────────────────────────────────────────────────

/** Minimum distance between two axis-aligned bounding boxes (0 when they overlap). */
export function bboxDistance(a: BoundingBox, b: BoundingBox): number {
  const hGap = Math.max(0, Math.max(a.x, b.x) - Math.min(a.x + a.width,  b.x + b.width));
  const vGap = Math.max(0, Math.max(a.y, b.y) - Math.min(a.y + a.height, b.y + b.height));
  return Math.sqrt(hGap * hGap + vGap * vGap);
}

/** Smallest bounding box that contains both a and b. */
export function unionBoundingBox(a: BoundingBox, b: BoundingBox): BoundingBox {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return {
    x,
    y,
    width:  Math.max(a.x + a.width,  b.x + b.width)  - x,
    height: Math.max(a.y + a.height, b.y + b.height) - y,
  };
}

// ── Grouping logic ─────────────────────────────────────────────────────────────

/**
 * Returns the best candidate from `drawings` to merge `incoming` into, or null
 * if no candidate passes all three tests:
 *   1. Same stroke colour (same instrument)
 *   2. Created within STROKE_GROUP_WINDOW_MS
 *   3. Bounding box within STROKE_GROUP_PROXIMITY_PX of the incoming stroke
 *
 * When multiple candidates pass, picks the one created most recently
 * (closest in time to the incoming stroke).
 *
 * Locked drawings are excluded — the user deliberately froze them.
 */
export function findGroupTarget<T extends Groupable>(
  drawings: readonly T[],
  incoming: Groupable,
): T | null {
  const now = Date.now();

  let best: T | null = null;

  for (const d of drawings) {
    if (d.isLocked)                                                    continue;
    if (d.strokeColor !== incoming.strokeColor)                        continue;
    if (now - d.createdAt > STROKE_GROUP_WINDOW_MS)                    continue;
    if (bboxDistance(d.boundingBox, incoming.boundingBox) > STROKE_GROUP_PROXIMITY_PX) continue;

    if (!best || d.createdAt > best.createdAt) best = d;
  }

  return best;
}
