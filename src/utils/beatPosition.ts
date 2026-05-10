import type { InstrumentName } from '../constants/instrumentMap';

// ── Seeded random ──────────────────────────────────────────────────────────────
// Hashes a string into an LCG seed so the same drawing ID always produces the
// same beat position (stable for the drawing's lifetime, no re-roll per tick).

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

// ── Weighted beat slot tables ──────────────────────────────────────────────────
// Beat positions: 1=beat1, 1.5=and-of-1, 2=beat2, 2.5=and-of-2, etc.
// Repeating a value doubles its probability; omitting beat 1 from synth lead
// keeps it off the downbeat where kick already lives.

const BEAT_SLOTS: Partial<Record<InstrumentName, readonly number[]>> = {
  // 4 on-beats at full weight; "and" of 2 and 4 at half weight.
  'chimes':     [1, 1, 2, 2, 3, 3, 4, 4, 2.5, 4.5],

  // Downbeats only — never on the backbeat.
  'horn/bass':  [1, 3],

  // Off the kick's downbeat; weight spread across beats 2, 3, 4.
  'synth lead': [2, 3, 4],

  // Same pool as horns; firing rate controlled in the scheduler (every 2 measures).
  'vocal pad':  [1, 3],
};

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns a beat position for the given instrument, seeded by the drawing's ID.
 * The result is deterministic: the same (id, instrument) pair always returns
 * the same value. Instruments without a slot table return 1 as a no-op default.
 */
export function assignBeatPosition(id: string, instrument: InstrumentName): number {
  const slots = BEAT_SLOTS[instrument];
  if (!slots) return 1;
  const rand = seededRandom(id);
  return slots[Math.floor(rand() * slots.length)];
}
