// ── Scale library ─────────────────────────────────────────────────────────────
// Semitone offsets from the root note (0 = root, 12 = octave above root).
// Add more entries here; they appear nowhere else in the codebase.

export const SCALE_INTERVALS = {
  'major':           [0, 2, 4, 5, 7, 9, 11],
  'natural minor':   [0, 2, 3, 5, 7, 8, 10],
  'dorian':          [0, 2, 3, 5, 7, 9, 10],
  'mixolydian':      [0, 2, 4, 5, 7, 9, 10],
  'pentatonic major':[0, 2, 4, 7, 9],
  'pentatonic minor':[0, 3, 5, 7, 10],
  'phrygian':        [0, 1, 3, 5, 7, 8, 10],
} as const satisfies Record<string, readonly number[]>;

export type ScaleName = keyof typeof SCALE_INTERVALS;

// ── Global tonality — change these two lines to retune the entire canvas ──────

/** Root note as semitone offset from C. 0=C  2=D  4=E  5=F  7=G  9=A  11=B */
export const GLOBAL_KEY = 9; // A

// Explicit readonly number[] annotation so indexOf() accepts any number at call sites.
export const GLOBAL_SCALE: readonly number[] = SCALE_INTERVALS['pentatonic minor']; // A minor pentatonic: A C D E G

// ── Utility ───────────────────────────────────────────────────────────────────

/**
 * Snaps a MIDI note number to the nearest pitch within (key, scale).
 * Returns a MIDI note number. Searches all practical octaves (-1 to 10).
 */
export function snapToScale(
  midi:  number,
  key:   number            = GLOBAL_KEY,
  scale: readonly number[] = GLOBAL_SCALE,
): number {
  let closest = midi;
  let minDist = Infinity;
  for (let oct = -1; oct <= 10; oct++) {
    for (const interval of scale) {
      const candidate = key + interval + oct * 12;
      const dist = Math.abs(candidate - midi);
      if (dist < minDist) {
        minDist = dist;
        closest = candidate;
      }
    }
  }
  return closest;
}
