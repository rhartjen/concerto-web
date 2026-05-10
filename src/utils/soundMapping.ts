import type { BoundingBox } from './pathUtils';
import { type InstrumentName, getInstrumentForColor } from '../constants/instrumentMap';

// ─── Public types ──────────────────────────────────────────────────────────────

export interface SoundMapping {
  note: string;              // root note name, e.g. "E5"
  chord: string[];           // triad note names, e.g. ["E5", "G#5", "B5"]
  frequency: number[];       // Hz for each chord note, same order
  instrument: InstrumentName;
}

// ─── Music theory constants ────────────────────────────────────────────────────

// C major pentatonic: C D E G A (semitone offsets from C).
const PENTA_SEMITONES = [0, 2, 4, 7, 9] as const;

const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

const MAJOR_TRIAD = [0, 4, 7] as const;
const MINOR_TRIAD = [0, 3, 7] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────────

function midiToFreq(midi: number): number {
  return parseFloat((440 * Math.pow(2, (midi - 69) / 12)).toFixed(2));
}

function midiToName(midi: number): string {
  const semitone = ((midi % 12) + 12) % 12;
  const octave   = Math.floor(midi / 12) - 1; // C4 = MIDI 60
  return `${CHROMATIC[semitone]}${octave}`;
}

// LCG seeded from a string — same seed always returns the same sequence.
function seededRandom(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
  }
  return () => {
    h = (Math.imul(1664525, h) + 1013904223) | 0;
    return (h >>> 0) / 0xffffffff;
  };
}

// ─── Mapping logic ─────────────────────────────────────────────────────────────

/**
 * Maps a drawing to a musical note and chord in C major pentatonic using only
 * stroke geometry — no canvas position is consulted.
 *
 *   Bbox diagonal  → scale degree  (short → high A, long → low C)
 *   Bbox area      → octave 3–6   (small → high, large → low)
 *   Aspect ratio   → chord quality (wide → major, tall → minor)
 *
 * A ±5% frequency jitter seeded from drawing.id means two geometrically
 * identical strokes still produce subtly different pitches.
 */
export function mapDrawingToSound(
  drawing: { boundingBox: BoundingBox; id?: string },
  color: string,
): SoundMapping {
  const { boundingBox } = drawing;

  // ── 1. Bbox diagonal → pentatonic scale degree ──────────────────────────────
  const diagonal  = Math.sqrt(
    boundingBox.width  * boundingBox.width +
    boundingBox.height * boundingBox.height,
  );
  const MAX_DIAGONAL = 500; // canvas units; beyond this saturates to lowest degree
  const tLength      = Math.min(diagonal / MAX_DIAGONAL, 1);

  const scaleIndex = Math.min(
    Math.floor((1 - tLength) * PENTA_SEMITONES.length),
    PENTA_SEMITONES.length - 1,
  );

  // ── 2. Bbox area → octave (3–6) ─────────────────────────────────────────────
  // sqrt(area) grows linearly with stroke extent, giving an even spread across
  // the four octaves. MAX_AREA = 300² — strokes at or above this get octave 3.
  const area     = boundingBox.width * boundingBox.height;
  const MAX_AREA = 90_000;
  const tArea    = Math.min(Math.sqrt(area / MAX_AREA), 1); // 0 = tiny, 1 = large
  const octave   = 3 + Math.round((1 - tArea) * 3);         // tiny → 6, large → 3

  // ── 3. Aspect ratio → chord quality ─────────────────────────────────────────
  const aspectRatio = boundingBox.height > 0 ? boundingBox.width / boundingBox.height : 1;
  const isMajor     = aspectRatio >= 1;

  // ── Build root MIDI and triad ────────────────────────────────────────────────
  const rootSemitone = PENTA_SEMITONES[scaleIndex];
  const rootMidi     = 12 * (octave + 1) + rootSemitone; // C4 = 12*(4+1) = 60 ✓

  const intervals = isMajor ? MAJOR_TRIAD : MINOR_TRIAD;
  const chordMidi = intervals.map((i) => rootMidi + i);

  // ── 4. ID-seeded ±5% frequency jitter ───────────────────────────────────────
  // Single factor applied to all chord tones so intervals are preserved; only
  // the overall pitch shifts slightly between strokes of identical geometry.
  const jitter = drawing.id
    ? 1 + (seededRandom(drawing.id)() * 0.10 - 0.05) // range [0.95, 1.05]
    : 1;

  const frequencies = chordMidi.map((midi) =>
    parseFloat((midiToFreq(midi) * jitter).toFixed(2)),
  );

  return {
    note:       midiToName(rootMidi),
    chord:      chordMidi.map(midiToName),
    frequency:  frequencies,
    instrument: getInstrumentForColor(color),
  };
}
