import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useGesture } from '@use-gesture/react';

import { useDrawingsStore, type DrawingObject } from '../store/drawingsStore';
import { useSessionStore } from '../store/sessionStore';
import { buildSmoothPath, computeBoundingBox, type Point } from '../utils/pathUtils';
import { mapDrawingToSound } from '../utils/soundMapping';
import { assignBeatPosition } from '../utils/beatPosition';
import { findGroupTarget, unionBoundingBox } from '../utils/strokeGrouping';
import { useAmbientLoop } from '../hooks/useAmbientLoop';
import { useViewportAudio } from '../hooks/useViewportAudio';
import { unlockAudio } from '../utils/audioEngine';
import { useViewportStore } from '../store/useViewportStore';
import { updateViewportTransform } from '../utils/viewportState';
import { INSTRUMENT_MAP, getInstrumentForColor } from '../constants/instrumentMap';
import { CANVAS_WIDTH, CANVAS_HEIGHT } from '../constants/limits';
import ColorPicker from './ColorPicker';
import TempoBar from './TempoBar';
import './Canvas.css';

// ─── Constants ───────────────────────────────────────────────────────────────
const MIN_SCALE        = 0.25;
const MAX_SCALE        = 4;
const GRID_SIZE        = 40;
const STROKE_WIDTH     = 4;
const MIN_DIST_SQ      = 4;    // skip micro-movements to avoid path bloat
const CYCLE_MS         = 2500; // visual pulse period for AnimatedStroke only
const MINIMAP_SIZE     = 150;
const MS               = MINIMAP_SIZE / CANVAS_WIDTH; // minimap scale factor
const LONG_PRESS_MS    = 600;  // touch hold duration before label appears
const LONG_PRESS_SQ    = 225;  // 15 screen-px radius² — movement cancels long-press

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

function drawingLabelText(d: DrawingObject): string {
  const freqs   = d.soundMapping.frequency;
  const isMinor = freqs.length >= 2 && freqs[1] / freqs[0] < 1.22;
  return `${d.soundMapping.note.replace(/\d+$/, '')} ${isMinor ? 'min' : 'maj'}`;
}

// ─── ShimmerOrb ──────────────────────────────────────────────────────────────
// Cosmic nebula orb that breathes in opacity via the Web Animations API.
function ShimmerOrb({
  size, color, cx, cy, minOp, maxOp, duration,
}: {
  size: number; color: string;
  cx: string;   cy: string;    // CSS calc-compatible strings, e.g. "16vw"
  minOp: number; maxOp: number; duration: number;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const anim = ref.current.animate(
      [{ opacity: minOp }, { opacity: maxOp }],
      { duration, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' },
    );
    return () => anim.cancel();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div
      ref={ref}
      className="shimmer-orb"
      style={{
        width:  size,
        height: size,
        left:   `calc(${cx} - ${size / 2}px)`,
        top:    `calc(${cy} - ${size / 2}px)`,
        borderRadius: '50%',
        backgroundColor: color,
        opacity: minOp,
      }}
    />
  );
}

// ─── AnimatedStroke ───────────────────────────────────────────────────────────
// Completed stroke. Pulses when unmuted; renders at 40% opacity when muted.
const AnimatedStroke = React.memo(function AnimatedStroke({
  drawing,
}: {
  drawing: DrawingObject;
}) {
  const ref = useRef<SVGPathElement>(null);

  useEffect(() => {
    if (!ref.current || drawing.isMuted) return;
    const anim = ref.current.animate(
      [{ opacity: 1 }, { opacity: 0.28 }],
      {
        duration:   CYCLE_MS / 2,
        iterations: Infinity,
        direction:  'alternate',
        easing:     'ease-in-out',
      },
    );
    return () => anim.cancel();
  }, [drawing.isMuted]);

  return (
    <path
      ref={ref}
      d={drawing.path}
      fill="none"
      stroke={drawing.strokeColor}
      strokeWidth={drawing.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      opacity={drawing.isMuted ? 0.4 : 1}
    />
  );
});

// ─── MergeRing ────────────────────────────────────────────────────────────────
// Brief ring pulse that plays at the centre of a drawing that just absorbed a
// new stroke, so the user can see which object the stroke was grouped into.
const MergeRing = React.memo(function MergeRing({
  cx, cy, color, onDone,
}: {
  cx: number; cy: number; color: string; onDone: () => void;
}) {
  const ref = useRef<SVGCircleElement>(null);

  useEffect(() => {
    if (!ref.current) return;
    const anim = ref.current.animate(
      [
        { r: '0',  opacity: 0.80, strokeWidth: '3' },
        { r: '60', opacity: 0,    strokeWidth: '1' },
      ],
      { duration: 600, easing: 'ease-out', fill: 'forwards' },
    );
    const t = setTimeout(onDone, 660);
    return () => { anim.cancel(); clearTimeout(t); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <circle
      ref={ref}
      cx={cx}
      cy={cy}
      r={0}
      fill="none"
      stroke={color}
      strokeWidth={3}
    />
  );
});

// ─── CanvasEmptyState ─────────────────────────────────────────────────────────
function CanvasEmptyState() {
  const hasDrawings  = useDrawingsStore((s) => s.drawings.length > 0);
  const [visible, setVisible] = useState(true);
  const ref          = useRef<HTMLDivElement>(null);
  const breatheRef   = useRef<Animation | null>(null);

  // Fade in, then gently breathe.
  useEffect(() => {
    if (!ref.current) return;

    const fadeIn = ref.current.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 1100, delay: 700, fill: 'forwards', easing: 'ease-out' },
    );

    const t = setTimeout(() => {
      if (!ref.current) return;
      breatheRef.current = ref.current.animate(
        [{ transform: 'scale(1)' }, { transform: 'scale(1.03)' }],
        { duration: 3200, iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' },
      );
    }, 1800);

    return () => {
      fadeIn.cancel();
      clearTimeout(t);
      breatheRef.current?.cancel();
    };
  }, []);

  // Fade out permanently when the first drawing lands.
  useEffect(() => {
    if (!hasDrawings || !visible) return;
    breatheRef.current?.cancel();
    ref.current?.animate(
      [{ opacity: 1 }, { opacity: 0 }],
      { duration: 420, fill: 'forwards', easing: 'ease-in' },
    );
    const t = setTimeout(() => setVisible(false), 440);
    return () => clearTimeout(t);
  }, [hasDrawings, visible]);

  if (!visible) return null;

  return (
    <div ref={ref} className="canvas-empty-state" style={{ opacity: 0 }}>
      <svg width={80} height={26} viewBox="0 0 80 26">
        <path
          d="M 4 13 Q 20 4 40 13 Q 60 22 76 13"
          fill="none"
          stroke="#3ED4C4"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.5}
        />
      </svg>
      <span className="canvas-empty-hint">draw something...</span>
    </div>
  );
}

// ─── Minimap ─────────────────────────────────────────────────────────────────
const Minimap = React.memo(function Minimap({
  drawings,
  hiddenIds,
  currentUserId,
  viewportRectRef,
  onMinimapClick,
}: {
  drawings:       DrawingObject[];
  hiddenIds:      Set<string>;
  currentUserId:  string | null;
  viewportRectRef: React.RefObject<SVGRectElement>;
  onMinimapClick: (e: React.MouseEvent<SVGSVGElement>) => void;
}) {
  return (
    <div className="minimap" onPointerDown={(e) => e.stopPropagation()}>
      <svg
        width={MINIMAP_SIZE}
        height={MINIMAP_SIZE}
        viewBox={`0 0 ${MINIMAP_SIZE} ${MINIMAP_SIZE}`}
        onClick={onMinimapClick}
      >
        <rect x={0} y={0} width={MINIMAP_SIZE} height={MINIMAP_SIZE} fill="#07091a" />
        <g transform={`scale(${MS})`}>
          {drawings.map((d) => {
            if (d.userId !== currentUserId && hiddenIds.has(d.id)) return null;
            return (
              <path
                key={d.id}
                d={d.path}
                fill="none"
                stroke={d.strokeColor}
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity={d.isMuted ? 0.2 : 0.9}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </g>
        {/* Viewport indicator — updated imperatively from applyTransform */}
        <rect
          ref={viewportRectRef}
          x={0}
          y={0}
          width={0}
          height={0}
          fill="rgba(62, 212, 196, 0.08)"
          stroke="#3ED4C4"
          strokeWidth={1}
        />
      </svg>
    </div>
  );
});

// ─── ViewportIcon ─────────────────────────────────────────────────────────────
// Crop-corner frame symbol — indicates "viewport mode".
function ViewportIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <path
        d="M1 4.5V1.5A.5.5 0 0 1 1.5 1H4.5M8.5 1h3a.5.5 0 0 1 .5.5V4.5M12 8.5v3a.5.5 0 0 1-.5.5H8.5M4.5 12H1.5a.5.5 0 0 1-.5-.5V8.5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// ─── Canvas ───────────────────────────────────────────────────────────────────
interface CanvasProps {
  children?: React.ReactNode;
}

export default function Canvas({ children }: CanvasProps) {
  useAmbientLoop();
  useViewportAudio();

  const viewportMode    = useViewportStore((s) => s.viewportMode);
  const setViewportMode = useViewportStore((s) => s.setViewportMode);

  // ── Transform state (refs → zero re-render overhead per frame) ────────────
  const txRef    = useRef(0);
  const tyRef    = useRef(0);
  const scaleRef = useRef(1);

  // ── DOM refs ──────────────────────────────────────────────────────────────
  const containerRef    = useRef<HTMLDivElement>(null);
  const bgRef           = useRef<HTMLDivElement>(null);
  const contentRef      = useRef<HTMLDivElement>(null);
  const viewportRectRef = useRef<SVGRectElement>(null);

  // ── Canvas username label (hover / long-press) — imperative to avoid re-renders
  const drawingLabelRef    = useRef<HTMLDivElement>(null);
  const labelDrawingRef    = useRef<DrawingObject | null>(null);
  const longPressTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressOriginRef = useRef<{ clientX: number; clientY: number } | null>(null);

  // ── Drawing state ─────────────────────────────────────────────────────────
  const currentPointsRef  = useRef<Point[]>([]);
  const isDrawingRef      = useRef(false);
  const activePointers    = useRef(new Set<number>());
  const [currentPath, setCurrentPath]       = useState('');
  const [selectedColor, setSelectedColor]   = useState(INSTRUMENT_MAP[0].hex);
  const selectedColorRef                    = useRef(INSTRUMENT_MAP[0].hex);

  function handleColorChange(hex: string) {
    setSelectedColor(hex);
    selectedColorRef.current = hex;
  }

  const drawings     = useDrawingsStore((s) => s.drawings);
  const hiddenIds    = useDrawingsStore((s) => s.hiddenIds);
  const addDrawing   = useDrawingsStore((s) => s.addDrawing);
  const mergeDrawing = useDrawingsStore((s) => s.mergeDrawing);

  const currentUserId = useSessionStore((s) => s.userId);

  // ── Merge ring pulse ──────────────────────────────────────────────────────
  // key increments on each merge so MergeRing remounts and replays the animation.
  const [activePulse, setActivePulse] = useState<{
    key: number; cx: number; cy: number; color: string;
  } | null>(null);

  // ── Push transform directly to DOM (no React re-render) ──────────────────
  const applyTransform = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;

    const vw = el.clientWidth;
    const vh = el.clientHeight;

    // Clamp pan so the user can't scroll outside the 8000×8000 canvas bounds.
    const minTx = vw - CANVAS_WIDTH * scaleRef.current;
    const minTy = vh - CANVAS_HEIGHT * scaleRef.current;
    txRef.current = clamp(txRef.current, Math.min(minTx, 0), 0);
    tyRef.current = clamp(tyRef.current, Math.min(minTy, 0), 0);

    if (contentRef.current) {
      contentRef.current.style.transform =
        `translate(${txRef.current}px,${tyRef.current}px) scale(${scaleRef.current})`;
    }

    if (bgRef.current) {
      const cell = GRID_SIZE * scaleRef.current;
      const dotR = clamp(1.4 * scaleRef.current, 1.0, 3.0);
      const gx   = ((txRef.current % cell) + cell) % cell;
      const gy   = ((tyRef.current % cell) + cell) % cell;
      bgRef.current.style.setProperty('--grid-cell', `${cell}px`);
      bgRef.current.style.setProperty('--grid-x',   `${gx}px`);
      bgRef.current.style.setProperty('--grid-y',   `${gy}px`);
      bgRef.current.style.setProperty('--dot-r',    `${dotR}px`);
    }

    // Publish viewport transform for useViewportAudio and useAmbientLoop.
    updateViewportTransform(txRef.current, tyRef.current, scaleRef.current, vw, vh);

    // Update minimap viewport rect imperatively to avoid React re-renders.
    const r = viewportRectRef.current;
    if (r) {
      const vpX = clamp(-txRef.current / scaleRef.current * MS, 0, MINIMAP_SIZE);
      const vpY = clamp(-tyRef.current / scaleRef.current * MS, 0, MINIMAP_SIZE);
      const vpW = Math.max(0, Math.min((vw / scaleRef.current) * MS, MINIMAP_SIZE - vpX));
      const vpH = Math.max(0, Math.min((vh / scaleRef.current) * MS, MINIMAP_SIZE - vpY));
      r.setAttribute('x',      String(vpX));
      r.setAttribute('y',      String(vpY));
      r.setAttribute('width',  String(vpW));
      r.setAttribute('height', String(vpH));
    }

    // Keep canvas username label anchored to its drawing during pan/zoom.
    const labelEl = drawingLabelRef.current;
    const labelD  = labelDrawingRef.current;
    if (labelEl && labelD) {
      const sx = (labelD.boundingBox.x + labelD.boundingBox.width  / 2) * scaleRef.current + txRef.current;
      const sy =  labelD.boundingBox.y                                   * scaleRef.current + tyRef.current;
      labelEl.style.transform = `translate(calc(${sx}px - 50%), calc(${sy}px - 100% - 8px))`;
    }
  }, []);

  // ── Drawing callbacks ─────────────────────────────────────────────────────
  const startStroke = useCallback((x: number, y: number) => {
    unlockAudio(); // satisfies the browser's user-gesture requirement for Web Audio
    currentPointsRef.current = [{ x, y }];
    setCurrentPath(`M ${x.toFixed(2)} ${y.toFixed(2)}`);
  }, []);

  const addPoint = useCallback((x: number, y: number) => {
    const pts = currentPointsRef.current;
    if (pts.length > 0) {
      const last = pts[pts.length - 1];
      const dx = x - last.x;
      const dy = y - last.y;
      if (dx * dx + dy * dy < MIN_DIST_SQ) return;
    }
    pts.push({ x, y });
    setCurrentPath(buildSmoothPath(pts));
  }, []);

  const finishStroke = useCallback(() => {
    const pts = currentPointsRef.current;
    if (pts.length === 0) return;

    // Session must be ready before any drawing can be persisted.
    const { userId, canvasId, username } = useSessionStore.getState();
    if (!userId || !canvasId) return;

    const pathData    = buildSmoothPath(pts);
    const bbox        = computeBoundingBox(pts);
    const strokeColor = selectedColorRef.current;
    const instrument  = getInstrumentForColor(strokeColor);

    // Only group into the current user's own drawings — never modify another user's row.
    const allDrawings = useDrawingsStore.getState().drawings;
    const ownDrawings = allDrawings.filter((d) => d.userId === userId);

    const incoming = { strokeColor, createdAt: Date.now(), isLocked: false, boundingBox: bbox };
    const target   = findGroupTarget(ownDrawings, incoming);

    if (target) {
      console.log(`[canvas] MERGE → drawing ${target.id} (own drawings in store: ${ownDrawings.length})`);
      // Merge: append path, expand bbox, re-map sound to the combined geometry.
      const mergedPath  = target.path + ' ' + pathData;
      const mergedBBox  = unionBoundingBox(target.boundingBox, bbox);
      const mergedSound = mapDrawingToSound({ boundingBox: mergedBBox, id: target.id }, strokeColor);

      mergeDrawing(target.id, {
        path:         mergedPath,
        boundingBox:  mergedBBox,
        position:     { x: mergedBBox.x, y: mergedBBox.y },
        soundMapping: mergedSound,
        createdAt:    Date.now(), // extend the grouping window for the next stroke
      });

      setActivePulse({
        key:   Date.now(),
        cx:    mergedBBox.x + mergedBBox.width  / 2,
        cy:    mergedBBox.y + mergedBBox.height / 2,
        color: strokeColor,
      });
    } else {
      console.log(`[canvas] NEW drawing (own drawings in store: ${ownDrawings.length})`);
      const id   = crypto.randomUUID();
      const base = {
        id,
        userId,
        username:    username ?? null,
        canvasId,
        path:        pathData,
        boundingBox: bbox,
        position:    { x: bbox.x, y: bbox.y },
        strokeColor,
        strokeWidth: STROKE_WIDTH,
        instrument,
        isActive:    true,
        isLocked:    false,
        isMuted:     false,   // own new drawings play immediately
        volume:      70,
        createdAt:   Date.now(),
        beatPosition: assignBeatPosition(id, instrument),
      };
      addDrawing({ ...base, soundMapping: mapDrawingToSound(base, strokeColor) });
    }

    currentPointsRef.current = [];
    setCurrentPath('');
  }, [addDrawing, mergeDrawing]);

  // ── Initial transform: center viewport on the canvas ─────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    txRef.current = (el.clientWidth  - CANVAS_WIDTH)  / 2;
    tyRef.current = (el.clientHeight - CANVAS_HEIGHT) / 2;
    applyTransform(); // will clamp and initialise minimap rect
  }, [applyTransform]);

  // ── Minimap click → pan to that canvas position ───────────────────────────
  const handleMinimapClick = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const canvasX = (e.clientX - rect.left)  / MS;
    const canvasY = (e.clientY - rect.top)   / MS;
    const el = containerRef.current;
    if (!el) return;
    txRef.current = el.clientWidth  / 2 - canvasX * scaleRef.current;
    tyRef.current = el.clientHeight / 2 - canvasY * scaleRef.current;
    applyTransform();
  }, [applyTransform]);

  // ── Pointer events → drawing + hover/long-press username label ───────────
  // Separate from @use-gesture/react so draw and pinch never conflict.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function toCanvas(clientX: number, clientY: number) {
      const rect = el!.getBoundingClientRect();
      return {
        x: (clientX - rect.left - txRef.current) / scaleRef.current,
        y: (clientY - rect.top  - tyRef.current) / scaleRef.current,
      };
    }

    // Show the username label for a drawing, positioned in screen space.
    function showLabel(d: DrawingObject) {
      labelDrawingRef.current = d;
      const labelEl = drawingLabelRef.current;
      if (!labelEl) return;
      const parts = [d.username, d.instrument, drawingLabelText(d)].filter(Boolean);
      labelEl.textContent = parts.join(' · ');
      const sx = (d.boundingBox.x + d.boundingBox.width  / 2) * scaleRef.current + txRef.current;
      const sy =  d.boundingBox.y                               * scaleRef.current + tyRef.current;
      labelEl.style.transform = `translate(calc(${sx}px - 50%), calc(${sy}px - 100% - 8px))`;
      labelEl.style.opacity = '1';
    }

    function hideLabel() {
      labelDrawingRef.current = null;
      if (drawingLabelRef.current) drawingLabelRef.current.style.opacity = '0';
    }

    // Hit-test canvas coordinates against visible drawing bounding boxes.
    function hitDrawing(canvasX: number, canvasY: number): DrawingObject | null {
      const { drawings, hiddenIds } = useDrawingsStore.getState();
      const uid = useSessionStore.getState().userId;
      const pad = 20 / scaleRef.current; // scale-compensated padding
      for (let i = drawings.length - 1; i >= 0; i--) {
        const d = drawings[i];
        if (d.userId !== uid && hiddenIds.has(d.id)) continue;
        const { x, y, width, height } = d.boundingBox;
        if (canvasX >= x - pad && canvasX <= x + width  + pad &&
            canvasY >= y - pad && canvasY <= y + height + pad) {
          return d;
        }
      }
      return null;
    }

    function onPointerDown(e: PointerEvent) {
      if ((e.target as Element).closest?.('.color-picker, .canvas-nav, .tempo-bar')) return;

      // Any new pointer interaction dismisses the current label.
      hideLabel();

      activePointers.current.add(e.pointerId);

      if (activePointers.current.size === 1) {
        const pt = toCanvas(e.clientX, e.clientY);
        startStroke(pt.x, pt.y);
        isDrawingRef.current = true;
        el!.setPointerCapture(e.pointerId);

        // Long-press trigger — touch only. If the finger stays still for
        // LONG_PRESS_MS we cancel the stroke and show the drawing label instead.
        if (e.pointerType === 'touch') {
          longPressOriginRef.current = { clientX: e.clientX, clientY: e.clientY };
          longPressTimerRef.current = setTimeout(() => {
            if (!isDrawingRef.current) return;
            isDrawingRef.current = false;
            currentPointsRef.current = [];
            setCurrentPath('');
            const origin = longPressOriginRef.current!;
            const pt2 = toCanvas(origin.clientX, origin.clientY);
            const hit = hitDrawing(pt2.x, pt2.y);
            if (hit) showLabel(hit);
          }, LONG_PRESS_MS);
        }
      } else if (isDrawingRef.current) {
        // Second finger arrived — cancel any in-progress stroke and long-press.
        if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
        isDrawingRef.current = false;
        currentPointsRef.current = [];
        setCurrentPath('');
      }
    }

    function onPointerMove(e: PointerEvent) {
      // Cancel long-press if the touch moves beyond the threshold.
      if (longPressTimerRef.current && longPressOriginRef.current) {
        const dsx = e.clientX - longPressOriginRef.current.clientX;
        const dsy = e.clientY - longPressOriginRef.current.clientY;
        if (dsx * dsx + dsy * dsy > LONG_PRESS_SQ) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
        }
      }

      if (!isDrawingRef.current) {
        // Hover detection — mouse only, only when no button is held.
        if (e.pointerType === 'mouse' && activePointers.current.size === 0) {
          const pt = toCanvas(e.clientX, e.clientY);
          const hit = hitDrawing(pt.x, pt.y);
          if (hit?.id !== labelDrawingRef.current?.id) {
            if (hit) showLabel(hit);
            else hideLabel();
          }
        }
        return;
      }

      const pt = toCanvas(e.clientX, e.clientY);
      addPoint(pt.x, pt.y);
    }

    function onPointerUp(e: PointerEvent) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      longPressOriginRef.current = null;

      activePointers.current.delete(e.pointerId);
      if (isDrawingRef.current && activePointers.current.size === 0) {
        isDrawingRef.current = false;
        finishStroke();
      }
    }

    function onPointerCancel(e: PointerEvent) {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      longPressOriginRef.current = null;

      activePointers.current.delete(e.pointerId);
      if (isDrawingRef.current) {
        isDrawingRef.current = false;
        currentPointsRef.current = [];
        setCurrentPath('');
      }
    }

    // Hide the hover label when the mouse exits the canvas area.
    function onPointerLeave(e: PointerEvent) {
      if (e.pointerType === 'mouse') hideLabel();
    }

    el.addEventListener('pointerdown',   onPointerDown);
    el.addEventListener('pointermove',   onPointerMove);
    el.addEventListener('pointerup',     onPointerUp);
    el.addEventListener('pointercancel', onPointerCancel);
    el.addEventListener('pointerleave',  onPointerLeave);

    return () => {
      el.removeEventListener('pointerdown',   onPointerDown);
      el.removeEventListener('pointermove',   onPointerMove);
      el.removeEventListener('pointerup',     onPointerUp);
      el.removeEventListener('pointercancel', onPointerCancel);
      el.removeEventListener('pointerleave',  onPointerLeave);
      if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    };
  }, [startStroke, addPoint, finishStroke]);

  // ── Wheel → pan / ctrl+wheel → zoom ──────────────────────────────────────
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function onWheel(e: WheelEvent) {
      e.preventDefault();

      if (e.ctrlKey || e.metaKey) {
        // Zoom centred on cursor — @use-gesture/react pinch handles trackpad
        // pinch natively; this branch catches ctrl+scroll as a fallback.
        const rect = el!.getBoundingClientRect();
        const fx   = e.clientX - rect.left;
        const fy   = e.clientY - rect.top;
        const zf   = Math.exp(-e.deltaY * 0.005);
        const ns   = clamp(scaleRef.current * zf, MIN_SCALE, MAX_SCALE);
        const af   = ns / scaleRef.current;
        txRef.current   += (1 - af) * (fx - txRef.current);
        tyRef.current   += (1 - af) * (fy - tyRef.current);
        scaleRef.current = ns;
      } else {
        // Pan — deltaX/Y are already in CSS pixels for standard scroll.
        txRef.current -= e.deltaX;
        tyRef.current -= e.deltaY;
      }

      applyTransform();
    }

    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [applyTransform]);

  // ── iOS Safari: block native pinch-to-zoom and overscroll ───────────────
  // CSS touch-action:none is not reliably honoured on iOS Safari; the
  // browser's system-level gesture recogniser can engage before JS sees the
  // event unless we call preventDefault() on a non-passive touchstart (for
  // multi-touch) and touchmove (to stop rubber-band scrolling during pan).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    function onTouchStart(e: TouchEvent) {
      if (e.touches.length > 1) e.preventDefault();
    }
    function onTouchMove(e: TouchEvent) {
      e.preventDefault();
    }
    el.addEventListener('touchstart', onTouchStart, { passive: false });
    el.addEventListener('touchmove',  onTouchMove,  { passive: false });
    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove',  onTouchMove);
    };
  }, []);

  // ── Touch pinch → zoom + two-finger pan ──────────────────────────────────
  // @use-gesture/react owns the two-touch gesture. The pointer event handler
  // above cancels any active draw as soon as a second pointer appears, so
  // there is no overlap between draw mode and pinch mode.
  const pinchMemo = useRef<{
    tx: number; ty: number; scale: number;
    ox: number; oy: number;
  } | null>(null);

  useGesture(
    {
      onPinch: ({ event, offset: [s], origin: [ox, oy], first }) => {
        event.preventDefault();
        if (first) {
          pinchMemo.current = {
            tx: txRef.current, ty: tyRef.current,
            scale: scaleRef.current, ox, oy,
          };
          return;
        }
        const m = pinchMemo.current;
        if (!m) return;

        const newScale = clamp(m.scale * s, MIN_SCALE, MAX_SCALE);
        const af       = newScale / m.scale;

        // Zoom anchored at the initial pinch midpoint + pan from midpoint movement.
        txRef.current   = m.tx + (1 - af) * (m.ox - m.tx) + (ox - m.ox);
        tyRef.current   = m.ty + (1 - af) * (m.oy - m.ty) + (oy - m.oy);
        scaleRef.current = newScale;
        applyTransform();
      },
    },
    {
      target: containerRef,
      pinch:  { pointer: { touch: true } },
      eventOptions: { passive: false },
    },
  );

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      ref={containerRef}
      className={`canvas-container${viewportMode ? ' canvas-container--viewport' : ''}`}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Dot grid — screen-fixed, pans via CSS custom props */}
      <div ref={bgRef} className="canvas-bg" />

      {/* Nebula shimmer */}
      <div className="canvas-orbs">
        <ShimmerOrb size={420} color="#3ED4C4" cx="16vw" cy="26vh" minOp={0.022} maxOp={0.068} duration={7800}  />
        <ShimmerOrb size={280} color="#E8982A" cx="84vw" cy="68vh" minOp={0.018} maxOp={0.055} duration={10200} />
        <ShimmerOrb size={500} color="#8B8AFF" cx="54vw" cy="10vh" minOp={0.012} maxOp={0.045} duration={12600} />
        <ShimmerOrb size={200} color="#D46E88" cx="70vw" cy="44vh" minOp={0.015} maxOp={0.048} duration={9000}  />
      </div>

      {/* Canvas content — shifted and scaled with pan/zoom */}
      <div ref={contentRef} className="canvas-content">
        {children}

        {/* Single SVG holds both completed strokes and the live preview stroke */}
        <svg
          className="canvas-drawing-svg"
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
        >
          {drawings.map((d) => {
            if (d.userId !== currentUserId && hiddenIds.has(d.id)) return null;
            return <AnimatedStroke key={d.id} drawing={d} />;
          })}

          {/* Ring pulse shown when a new stroke is merged into an existing drawing */}
          {activePulse && (
            <MergeRing
              key={activePulse.key}
              cx={activePulse.cx}
              cy={activePulse.cy}
              color={activePulse.color}
              onDone={() => setActivePulse(null)}
            />
          )}

          {/* Live stroke (while pointer is held down) */}
          {currentPath && (
            <path
              d={currentPath}
              fill="none"
              stroke={selectedColor}
              strokeWidth={STROKE_WIDTH}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      </div>

      <CanvasEmptyState />

      {/* Username label — shown on hover (mouse) or long-press (touch); positioned imperatively */}
      <div ref={drawingLabelRef} className="drawing-label" />

      <Minimap
        drawings={drawings}
        hiddenIds={hiddenIds}
        currentUserId={currentUserId}
        viewportRectRef={viewportRectRef}
        onMinimapClick={handleMinimapClick}
      />

      <TempoBar />
      <ColorPicker value={selectedColor} onChange={handleColorChange} />

      {/* stopPropagation prevents these clicks from reaching the canvas pointer listeners */}
      <nav className="canvas-nav" onPointerDown={(e) => e.stopPropagation()}>
        <button
          className={`canvas-nav-btn${viewportMode ? ' canvas-nav-btn--active' : ''}`}
          onClick={() => setViewportMode(!viewportMode)}
          aria-label={viewportMode ? 'Disable viewport mode' : 'Enable viewport mode'}
          title={viewportMode ? 'Viewport mode on' : 'Viewport mode off'}
        >
          <ViewportIcon />
        </button>
        <Link to="/chords"   className="canvas-nav-btn">CHORDS</Link>
        <Link to="/discover" className="canvas-nav-btn">DISCOVER</Link>
      </nav>
    </div>
  );
}
