import { create } from 'zustand';

interface TempoState {
  bpm: number;
  setBpm: (bpm: number) => void;
}

export const useTempoStore = create<TempoState>((set) => ({
  bpm: 90,
  setBpm: (bpm) => set({ bpm }),
}));
