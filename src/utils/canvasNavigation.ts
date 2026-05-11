// Imperative bridge that lets DrawingPanel trigger an animated canvas pan
// without coupling it to Canvas.tsx's internal refs or React state.

import type { DrawingObject } from '../store/drawingsStore';

type PanHandler = (canvasX: number, canvasY: number, color: string) => void;

let _handler: PanHandler | null = null;

/** Called once by Canvas on mount; deregistered on unmount. */
export function registerPanHandler(fn: PanHandler | null): void {
  _handler = fn;
}

/** Pan the canvas to center the given drawing's bounding box. */
export function panToDrawing(drawing: DrawingObject): void {
  if (!_handler) return;
  const { boundingBox, strokeColor } = drawing;
  const cx = boundingBox.x + boundingBox.width  / 2;
  const cy = boundingBox.y + boundingBox.height / 2;
  _handler(cx, cy, strokeColor);
}
