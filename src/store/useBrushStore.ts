import { create } from 'zustand';
import { BRUSH_SIZE_MIN, BRUSH_SIZE_MAX } from '../constants/limits';

const STORAGE_KEY    = 'concerto_brush_size';
const DEFAULT_SIZE   = 8;

function clamp(v: number): number {
  return Math.max(BRUSH_SIZE_MIN, Math.min(BRUSH_SIZE_MAX, v));
}

function loadSize(): number {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw !== null) return clamp(Number(raw));
  } catch { /* ignore */ }
  return DEFAULT_SIZE;
}

interface BrushState {
  brushSize:    number;
  setBrushSize: (size: number) => void;
}

export const useBrushStore = create<BrushState>((set) => ({
  brushSize: loadSize(),
  setBrushSize: (size) => {
    const clamped = clamp(size);
    try { localStorage.setItem(STORAGE_KEY, String(clamped)); } catch { /* ignore */ }
    set({ brushSize: clamped });
  },
}));
