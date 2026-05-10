import { useEffect, useRef } from 'react';
import type { InstrumentName } from '../constants/instrumentMap';
import { useDrawingsStore } from '../store/drawingsStore';
import { useTempoStore } from '../store/tempoStore';
import { playChord } from '../utils/audioEngine';

const CHORD_DURATION    = 1.9;
const MAX_OFFSET_MS     = 700;
const MAX_VOICES        = 5;
const LOOP_VOLUME       = 0.45;
const CANVAS_LEFT       = -2000;
const CANVAS_RIGHT      = 2000;
const TICKS_PER_MEASURE = 8; // 8th-note resolution — 2 ticks per quarter note

// ── Beat-position helpers ──────────────────────────────────────────────────────

// Converts a beat position (1, 1.5, 2, 2.5 …) to a tick index within the measure.
// beat 1 → 0, beat 1.5 → 1, beat 2 → 2, … beat 4.5 → 7
function beatPosToTick(beatPos: number): number {
  return Math.round((beatPos - 1) * 2);
}

// Returns true when this instrument should fire on the given absolute tick.
// Pattern-based instruments ignore beatPosition; drawing-specific ones use it.
function shouldFire(instrument: InstrumentName, tick: number, beatPosition: number): boolean {
  const t      = tick % TICKS_PER_MEASURE;          // position within current measure
  const target = beatPosToTick(beatPosition);        // drawing's assigned slot (0–7)

  switch (instrument) {
    case 'kick drum':  return t === 0;
    case 'snare drum': return t === 2 || t === 6;
    case 'hi-hat':     return t % 2 === 0;           // every quarter note
    case '808 bass':   return t === 0 || t === 4;    // every 2 beats
    case 'synth pad':  return t === 0;               // once per measure

    // Vocal pad: once every 2 measures at its assigned beat slot.
    case 'vocal pad':
      return tick % (TICKS_PER_MEASURE * 2) === target;

    // Chimes, horn/bass, synth lead: every measure at their assigned beat slot.
    default:
      return t === target;
  }
}

// Hi-hat alternates closed (40 ms) / open (200 ms) across beats.
function hiHatDuration(tick: number): number {
  const beatNum = Math.floor(tick / 2); // increments once per quarter-note tick
  return beatNum % 2 === 0 ? 0.04 : 0.20;
}

// ── Utilities ──────────────────────────────────────────────────────────────────

function xOffset(bboxX: number, bboxWidth: number, maxMs: number): number {
  const centerX = bboxX + bboxWidth / 2;
  const t = Math.max(0, Math.min(1,
    (centerX - CANVAS_LEFT) / (CANVAS_RIGHT - CANVAS_LEFT),
  ));
  return Math.round(t * maxMs);
}

function sample<T>(arr: T[], n: number): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, n);
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useAmbientLoop(): void {
  const bpmRef  = useRef(useTempoStore.getState().bpm);
  const tickRef = useRef(0); // absolute 8th-note tick counter

  useEffect(() => {
    return useTempoStore.subscribe((s) => { bpmRef.current = s.bpm; });
  }, []);

  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;

    function tick() {
      const t      = tickRef.current++;
      const beatMs  = Math.round(60000 / bpmRef.current);
      const cycleMs = Math.round(beatMs / 2);  // 8th-note interval
      // Spatial spread is relative to a full beat so offsets don't bleed across ticks.
      const maxOff  = Math.min(MAX_OFFSET_MS, Math.round(beatMs * 0.4));

      const { drawings } = useDrawingsStore.getState();
      const active = drawings.filter((d) => d.isActive && !d.isMuted);

      if (active.length > 0) {
        // Filter to only those that should fire on this tick, then cap voices.
        const firing = active.filter((d) =>
          shouldFire(d.soundMapping.instrument, t, d.beatPosition),
        );
        const voices = firing.length <= MAX_VOICES ? firing : sample(firing, MAX_VOICES);

        for (const drawing of voices) {
          const inst  = drawing.soundMapping.instrument;
          const dur   = inst === 'hi-hat' ? hiHatDuration(t) : CHORD_DURATION;
          const delay = xOffset(drawing.boundingBox.x, drawing.boundingBox.width, maxOff);

          setTimeout(() => {
            playChord(drawing.soundMapping.frequency, dur, inst, LOOP_VOLUME)
              .catch(() => {});
          }, delay);
        }
      }

      id = setTimeout(tick, cycleMs);
    }

    tick();
    return () => clearTimeout(id);
  }, []);
}
