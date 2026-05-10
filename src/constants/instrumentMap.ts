export type InstrumentName =
  | '808 bass'
  | 'kick drum'
  | 'snare drum'
  | 'hi-hat'
  | 'chimes'
  | 'synth pad'
  | 'horn/bass'
  | 'synth lead'
  | 'vocal pad';

export interface InstrumentEntry {
  hex: string;
  instrument: InstrumentName;
  label: string;
}

export const INSTRUMENT_MAP: readonly InstrumentEntry[] = [
  { hex: '#E84040', instrument: '808 bass',   label: '808'   },
  { hex: '#E87830', instrument: 'kick drum',  label: 'KICK'  },
  { hex: '#D4A028', instrument: 'snare drum', label: 'SNARE' },
  { hex: '#D4CC48', instrument: 'hi-hat',     label: 'HHAT'  },
  { hex: '#96C440', instrument: 'chimes',     label: 'CHIME' },
  { hex: '#58C498', instrument: 'synth pad',  label: 'PAD'   },
  { hex: '#4A90E8', instrument: 'horn/bass',  label: 'HORN'  },
  { hex: '#A09CFF', instrument: 'synth lead', label: 'LEAD'  },
  { hex: '#D46E88', instrument: 'vocal pad',  label: 'VOX'   },
];

// Per-instrument gain multipliers for mix balance (drums loudest → pads quietest).
export const INSTRUMENT_GAIN: Record<InstrumentName, number> = {
  'kick drum':  1.00,
  'snare drum': 0.90,
  'hi-hat':     0.50,  // ~-6 dB vs kick
  '808 bass':   0.85,
  'synth lead': 0.70,
  'horn/bass':  0.65,
  'chimes':     0.60,
  'synth pad':  0.55,
  'vocal pad':  0.45,
};

export function getInstrumentForColor(hex: string): InstrumentName {
  const entry = INSTRUMENT_MAP.find(
    (e) => e.hex.toLowerCase() === hex.toLowerCase(),
  );
  return entry?.instrument ?? 'synth pad';
}
