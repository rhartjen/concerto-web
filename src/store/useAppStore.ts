import { create } from 'zustand';

interface AppState {
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  isPlaying: false,
  setIsPlaying: (playing) => set({ isPlaying: playing }),
}));
