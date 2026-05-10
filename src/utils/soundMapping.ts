import type { BoundingBox } from './pathUtils';
import { type InstrumentName, getInstrumentForColor } from '../constants/instrumentMap';
import { GLOBAL_KEY, GLOBAL_SCALE } from '../constants/musicalKey';

// ─── Public types ──────────────────────────────────────────────────────────────

export interface SoundMapping {
  note:       string;        // root note name, e.g. "E4"
  chord:      string[];      // triad note names, e.g. ["E4", "G4", "B4"]
  frequency:  number[];      // Hz for each chord note, same order
  instrument: InstrumentName;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CHROMATIC = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;

// MIDI range for melodic instruments: C3 (48) – C6 (84).
const MIDI_LOW  = 48;
const MIDI_HIGH = 84;

// Drums: synth functions ignore the frequency array — return a fixed placeholder.
const PERCUSSION: ReadonlySet<InstrumentName> = new Set(['kick drum', 'snare drum', 'hi-hat']);
const DRUM_MIDI = 36; // C2, conventional GM bass-drum note

// ─── Helpers ──────────────────────────────────────────────────────────────────

function midiToFreq(midi: number): number {
  return parseFloat((440 * Math.pow(2, (midi - 69) / 12)).toFixed(2));
}

function midiToName(midi: number): string {
  const semitone = ((midi % 12) + 12) % 12;
  const octave   = Math.floor(midi / 12) - 1; // C4 = MIDI 60 ✓
  return `${CHROMATIC[semitone]}${octave}`;
}

/**
 * Builds a diatonic triad (scale degrees 1-3-5) from rootMidi.
 * All three tones are guaranteed to be within GLOBAL_SCALE — no chromatic clashes.
 */
function diatonicTriad(rootMidi: number): number[] {
  const rootPc = ((rootMidi - GLOBAL_KEY) % 12 + 12) % 12;
  const idx    = GLOBAL_SCALE.indexOf(rootPc);
  if (idx === -1) return [rootMidi, rootMidi, rootMidi]; // should never occur after in-scale derivation

  // Base octave factor: how many full octaves above key does rootMidi sit?
  const baseOct = Math.floor((rootMidi - rootPc - GLOBAL_KEY) / 12);

  return [0, 2, 4].map((step) => {
    const scaleStep   = (idx + step) % GLOBAL_SCALE.length;
    const extraOctave = Math.floor((idx + step) / GLOBAL_SCALE.length);
    return GLOBAL_KEY + (baseOct + extraOctave) * 12 + GLOBAL_SCALE[scaleStep];
  });
}

// ─── Mapping logic ─────────────────────────────────────────────────────────────

/**
 * Maps a drawing to a musical note and diatonic triad within GLOBAL_SCALE.
 *
 *   Bbox diagonal → scale degree   (short → high degree, long → low degree)
 *   Bbox area     → octave 3–6    (small → high, large → low)
 *   Drums         → fixed C2 placeholder (synth ignores frequency)
 *
 * All melodic instruments produce exactly in-scale notes with no frequency
 * jitter. Chord tones are built by walking GLOBAL_SCALE (1-3-5), so every
 * triad is diatonic and clash-free.
 */
export function mapDrawingToSound(
  drawing:  { boundingBox: BoundingBox; id?: string },
  color:    string,
): SoundMapping {
  const instrument = getInstrumentForColor(color);

  if (PERCUSSION.has(instrument)) {
    const name = midiToName(DRUM_MIDI);
    return { note: name, chord: [name], frequency: [midiToFreq(DRUM_MIDI)], instrument };
  }

  const { boundingBox } = drawing;

  // ── Diagonal → scale degree index ─────────────────────────────────────────
  const diagonal     = Math.sqrt(boundingBox.width ** 2 + boundingBox.height ** 2);
  const MAX_DIAGONAL = 500;
  const tLength      = Math.min(diagonal / MAX_DIAGONAL, 1);
  // Short stroke → index near top of scale; long stroke → index near bottom.
  const scaleIdx     = Math.min(
    Math.floor((1 - tLength) * GLOBAL_SCALE.length),
    GLOBAL_SCALE.length - 1,
  );

  // ── Area → octave 3–6 ─────────────────────────────────────────────────────
  const area     = boundingBox.width * boundingBox.height;
  const MAX_AREA = 90_000; // 300×300 canvas units → octave 3
  const tArea    = Math.min(Math.sqrt(area / MAX_AREA), 1);
  const octave   = 3 + Math.round((1 - tArea) * 3); // small → 6, large → 3

  // ── Root MIDI — in-scale by construction ─────────────────────────────────
  // Normalise with % 12 so key offsets > 0 don't accidentally bump an octave.
  const pitchClass = ((GLOBAL_KEY + GLOBAL_SCALE[scaleIdx]) % 12 + 12) % 12;
  const rootMidi   = clampMidi(12 * (octave + 1) + pitchClass);

  // ── Diatonic triad: all tones guaranteed in GLOBAL_SCALE ─────────────────
  const chordMidi = diatonicTriad(rootMidi);

  return {
    note:       midiToName(rootMidi),
    chord:      chordMidi.map(midiToName),
    frequency:  chordMidi.map(midiToFreq),
    instrument,
  };
}

function clampMidi(midi: number): number {
  return Math.max(MIDI_LOW, Math.min(MIDI_HIGH, midi));
}
