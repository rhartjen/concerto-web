import { useEffect, useRef } from 'react';
import { useDrawingsStore } from '../store/drawingsStore';
import { useViewportStore } from '../store/useViewportStore';
import { subscribeViewport, getViewportTransform } from '../utils/viewportState';
import { setViewportGain, resetViewportGains } from '../utils/audioEngine';
import type { BoundingBox } from '../utils/pathUtils';

function intersectsViewport(bbox: BoundingBox): boolean {
  const { tx, ty, scale, vw, vh } = getViewportTransform();
  if (vw === 0 && vh === 0) return true; // transform not yet initialized — treat all as visible
  const left   = -tx / scale;
  const top    = -ty / scale;
  const right  = (-tx + vw) / scale;
  const bottom = (-ty + vh) / scale;
  return (
    bbox.x + bbox.width  >= left &&
    bbox.x               <= right &&
    bbox.y + bbox.height >= top  &&
    bbox.y               <= bottom
  );
}

function setsEqual(a: Set<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) if (!b.has(id)) return false;
  return true;
}

export function useViewportAudio(): void {
  const viewportMode  = useViewportStore((s) => s.viewportMode);
  const setVisibleIds = useViewportStore((s) => s.setVisibleDrawingIds);
  const prevInViewRef = useRef(new Set<string>());

  useEffect(() => {
    if (!viewportMode) {
      resetViewportGains();
      setVisibleIds(new Set());
      prevInViewRef.current = new Set();
      return;
    }

    function update() {
      const { drawings } = useDrawingsStore.getState();
      const nowInView = new Set<string>();

      for (const d of drawings) {
        if (!d.isActive) continue;
        if (intersectsViewport(d.boundingBox)) nowInView.add(d.id);
      }

      const prev = prevInViewRef.current;

      // Fade in drawings that just entered the viewport.
      for (const id of nowInView) {
        if (!prev.has(id)) setViewportGain(id, 1);
      }
      // Fade out drawings that just left the viewport.
      for (const id of prev) {
        if (!nowInView.has(id)) setViewportGain(id, 0);
      }

      if (!setsEqual(nowInView, prev)) {
        prevInViewRef.current = nowInView;
        setVisibleIds(nowInView);
      }
    }

    update(); // apply immediately on activation
    const unsubViewport = subscribeViewport(update);
    const unsubDrawings = useDrawingsStore.subscribe(update);
    return () => {
      unsubViewport();
      unsubDrawings();
    };
  }, [viewportMode, setVisibleIds]);
}
