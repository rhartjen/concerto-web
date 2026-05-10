import { create } from 'zustand';

interface ViewportState {
  viewportMode: boolean;
  /** All active drawings whose bounding box intersects the current viewport. */
  visibleDrawingIds: ReadonlySet<string>;
  setViewportMode: (on: boolean) => void;
  setVisibleDrawingIds: (ids: ReadonlySet<string>) => void;
}

export const useViewportStore = create<ViewportState>((set) => ({
  viewportMode: false,
  visibleDrawingIds: new Set<string>(),
  setViewportMode: (on) => set({ viewportMode: on }),
  setVisibleDrawingIds: (ids) => set({ visibleDrawingIds: ids }),
}));
