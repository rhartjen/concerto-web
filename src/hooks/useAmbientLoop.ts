import { useEffect, useRef } from 'react';
import type { InstrumentName } from '../constants/instrumentMap';
import { MAX_SIMULTANEOUS_MELODIC } from '../constants/limits';
import { useDrawingsStore } from '../store/drawingsStore';
import { useTempoStore } from '../store/tempoStore';
import { useViewportStore } from '../store/useViewportStore';
import { playChord, unlockAudio } from '../utils/audioEngine';

const CHORD_DURATION    = 1.33;
const MAX_OFFSET_MS     = 700;
const MAX_VOICES        = 5;

const PERCUSSION: ReadonlySet<InstrumentName> = new Set([
  'kick drum', 'snare drum', 'hi-hat',
]);

function freqToMidi(hz: number): number {
  return 69 + 12 * Math.log2(hz / 440);
}

const LOOP_VOLUME       = 0.45;
const CANVAS_LEFT       = -2000;
const CANVAS_RIGHT      = 2000;
const TICKS_PER_MEASURE = 8;  // 8th-note resolution — 2 ticks per quarter note
const PHASE_RANGE_MS    = 30; // ±30 ms seeded humanization per drawing

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

// Deterministic ±PHASE_RANGE_MS offset seeded from the drawing ID.
// Uses a different seed suffix than beatPosition.ts's seededRandom to avoid
// correlation between a drawing's beat slot and its phase nudge.
function seededPhase(id: string): number {
  const seed = id + '\x01';
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  h = (Math.imul(1664525, h) + 1013904223) | 0;
  const rand = (h >>> 0) / 0xffffffff; // [0, 1)
  return Math.round(rand * PHASE_RANGE_MS * 2 - PHASE_RANGE_MS); // [-30, 30] ms
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
  const bpmRef          = useRef(useTempoStore.getState().bpm);
  const tickRef         = useRef(0);       // absolute 8th-note tick counter
  const nextTickTimeRef = useRef(0);       // wall-clock ms when next tick should fire

  useEffect(() => {
    return useTempoStore.subscribe((s) => { bpmRef.current = s.bpm; });
  }, []);

  // Unlock the AudioContext on the first user interaction anywhere on the page,
  // not only when the user starts drawing. Removed immediately after first fire.
  useEffect(() => {
    function handleFirstInteraction() {
      unlockAudio();
      document.removeEventListener('pointerdown', handleFirstInteraction);
    }
    document.addEventListener('pointerdown', handleFirstInteraction);
    return () => document.removeEventListener('pointerdown', handleFirstInteraction);
  }, []);

  useEffect(() => {
    let id: ReturnType<typeof setTimeout>;

    function tick() {
      const t = tickRef.current++;

      // Keep cycleMs as a float — rounding here causes systematic drift.
      const beatMs  = 60000 / bpmRef.current;
      const cycleMs = beatMs / 2; // 8th-note interval
      // maxOff capped so spatial delays can't bleed into the next tick window.
      const maxOff  = Math.min(MAX_OFFSET_MS, Math.round(beatMs * 0.4));

      const { drawings } = useDrawingsStore.getState();
      const { viewportMode, visibleDrawingIds } = useViewportStore.getState();
      const active = drawings.filter((d) => {
        if (!d.isActive || d.isMuted) return false;
        if (viewportMode && !visibleDrawingIds.has(d.id)) return false;
        return true;
      });

      if (active.length > 0) {
        const firing = active.filter((d) =>
          shouldFire(d.soundMapping.instrument, t, d.beatPosition),
        );

        // Percussion always plays; melodic is capped and voice-led.
        const percFiring    = firing.filter((d) => PERCUSSION.has(d.soundMapping.instrument));
        const melodicFiring = firing.filter((d) => !PERCUSSION.has(d.soundMapping.instrument));

        // Cap melodic voices at MAX_SIMULTANEOUS_MELODIC, preferring those that
        // fire earliest in the measure (lowest beatPosition = most on-beat).
        const cappedMelodic = melodicFiring
          .slice()
          .sort((a, b) => a.beatPosition - b.beatPosition)
          .slice(0, MAX_SIMULTANEOUS_MELODIC);

        // Voice leading: sort by root frequency, reject any drawing whose root
        // is within 3 semitones of the previously accepted note to prevent clashes.
        const sortedByFreq = cappedMelodic
          .slice()
          .sort((a, b) => (a.soundMapping.frequency[0] ?? 0) - (b.soundMapping.frequency[0] ?? 0));
        const voicedMelodic: typeof sortedByFreq = [];
        let lastMidi = -Infinity;
        for (const d of sortedByFreq) {
          const rootMidi = freqToMidi(d.soundMapping.frequency[0] ?? 440);
          if (rootMidi - lastMidi >= 3) {
            voicedMelodic.push(d);
            lastMidi = rootMidi;
          }
        }

        const candidates = [...percFiring, ...voicedMelodic];
        const voices = candidates.length <= MAX_VOICES ? candidates : sample(candidates, MAX_VOICES);

        for (const drawing of voices) {
          const inst    = drawing.soundMapping.instrument;
          const dur     = inst === 'hi-hat' ? hiHatDuration(t) : CHORD_DURATION;
          // Spatial offset: left-canvas drawings fire first, right-canvas last.
          const spatial = xOffset(drawing.boundingBox.x, drawing.boundingBox.width, maxOff);
          // Seeded humanization: ±30 ms per drawing, independent of canvas position.
          const phase   = seededPhase(drawing.id);
          const delay   = Math.max(0, spatial + phase);

          setTimeout(() => {
            playChord(drawing.soundMapping.frequency, dur, inst, LOOP_VOLUME, drawing.id, drawing.volume / 100)
              .catch(() => {});
          }, delay);
        }
      }

      // Anti-drift: advance the expected-fire timestamp by exactly one cycle,
      // then compute the remaining delay to that point. If this tick fired late,
      // the next fires proportionally early — beat 1 stays anchored over time.
      nextTickTimeRef.current += cycleMs;
      id = setTimeout(tick, Math.max(0, nextTickTimeRef.current - Date.now()));
    }

    nextTickTimeRef.current = Date.now();
    tick();
    return () => clearTimeout(id);
  }, []);
}
