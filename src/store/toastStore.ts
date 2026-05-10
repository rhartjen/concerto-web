import { create } from 'zustand';

interface ToastItem {
  id: string;
  message: string;
}

interface ToastState {
  toasts: ToastItem[];
  showToast: (message: string, durationMs?: number) => void;
  dismissToast: (id: string) => void;
}

let _counter = 0;

export const useToastStore = create<ToastState>((set) => ({
  toasts: [],

  showToast: (message, durationMs = 2800) => {
    const id = `toast-${++_counter}`;
    set((s) => ({ toasts: [...s.toasts, { id, message }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, durationMs);
  },

  dismissToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
