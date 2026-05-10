// Module-level viewport transform — written imperatively by Canvas.tsx on every
// pan/zoom tick, read by useViewportAudio and useAmbientLoop without React re-renders.

export interface ViewportTransform {
  tx: number; ty: number; scale: number; vw: number; vh: number;
}

const _state: ViewportTransform = { tx: 0, ty: 0, scale: 1, vw: 0, vh: 0 };
const _listeners = new Set<() => void>();

export function updateViewportTransform(
  tx: number, ty: number, scale: number, vw: number, vh: number,
): void {
  _state.tx = tx;
  _state.ty = ty;
  _state.scale = scale;
  _state.vw = vw;
  _state.vh = vh;
  for (const fn of _listeners) fn();
}

export function getViewportTransform(): Readonly<ViewportTransform> {
  return _state;
}

export function subscribeViewport(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}
