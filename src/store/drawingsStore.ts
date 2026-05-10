import { create } from 'zustand';
import type { BoundingBox } from '../utils/pathUtils';
import type { SoundMapping } from '../utils/soundMapping';
import type { InstrumentName } from '../constants/instrumentMap';
import { assignBeatPosition } from '../utils/beatPosition';
import { supabase, type Tables, type Json } from '../lib/supabase';
import { useSessionStore } from './sessionStore';
import { useToastStore } from './toastStore';

const STROKE_WIDTH = 4;

export interface DrawingObject {
  id:          string;
  /** auth.users.id of the creator — used for ownership checks. */
  userId:      string;
  canvasId:    string;
  path:        string;
  boundingBox: BoundingBox;
  position:    { x: number; y: number };
  strokeColor: string;
  strokeWidth: number;
  instrument:  InstrumentName;
  isActive:    boolean;
  isLocked:    boolean;
  /**
   * Session-only mute flag. True for all drawings fetched on load and all
   * realtime inserts from other users. Set to false only when the user draws
   * something themselves, or when they interact with the DrawingPanel toggle.
   * The audio loop skips drawings where isMuted is true.
   */
  isMuted:     boolean;
  createdAt:   number;
  soundMapping: SoundMapping;
  beatPosition: number;
}

const HIDDEN_IDS_KEY = 'concerto_hidden_drawing_ids';

function loadHiddenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(HIDDEN_IDS_KEY);
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch { return new Set<string>(); }
}

function saveHiddenIds(ids: Set<string>): void {
  try { localStorage.setItem(HIDDEN_IDS_KEY, JSON.stringify([...ids])); } catch { /* ignore */ }
}

interface DrawingsState {
  drawings:     DrawingObject[];
  /** IDs of other users' drawings the current user has hidden locally. */
  hiddenIds:    Set<string>;
  addDrawing:           (drawing: DrawingObject) => void;
  updateDrawing:        (id: string, updates: Partial<DrawingObject>) => void;
  mergeDrawing:         (id: string, updates: {
    path:         string;
    boundingBox:  BoundingBox;
    position:     { x: number; y: number };
    soundMapping: SoundMapping;
    createdAt:    number;
  }) => void;
  removeDrawing:        (id: string) => void;
  toggleHidden:         (id: string) => void;
  clearDrawings:        () => void;
  shuffleSoundMappings: () => void;
}

// ── Row converter ─────────────────────────────────────────────────────────────

function rowToDrawing(row: Tables<'drawings'>): DrawingObject {
  const instrument = row.instrument as InstrumentName;
  return {
    id:          row.id,
    userId:      row.user_id,
    canvasId:    row.canvas_id,
    path:        row.path_data,
    boundingBox: row.bounding_box as unknown as BoundingBox,
    position:    row.canvas_position as unknown as { x: number; y: number },
    strokeColor: row.color,
    strokeWidth: STROKE_WIDTH,
    instrument,
    isActive:    true,
    isLocked:    false,
    isMuted:     true,   // always start muted regardless of any stored state
    createdAt:   new Date(row.created_at).getTime(),
    beatPosition: Number(row.beat_position),
    soundMapping: {
      note:      row.note,
      chord:     row.chord as unknown as string[],
      frequency: row.frequencies as unknown as number[],
      instrument,
    },
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useDrawingsStore = create<DrawingsState>((set, get) => ({
  drawings:  [],
  hiddenIds: loadHiddenIds(),

  addDrawing: (drawing) => {
    set((state) => ({ drawings: [...state.drawings, drawing] }));

    // Build the DB-column-shaped payload once.
    const insertPayload = {
      id:              drawing.id,
      canvas_id:       drawing.canvasId,
      user_id:         drawing.userId,
      path_data:       drawing.path,
      canvas_position: drawing.position,
      bounding_box:    drawing.boundingBox,
      color:           drawing.strokeColor,
      instrument:      drawing.instrument,
      note:            drawing.soundMapping.note,
      chord:           drawing.soundMapping.chord,
      frequencies:     drawing.soundMapping.frequency,
      beat_position:   drawing.beatPosition,
    };

    // Call the Edge Function — it verifies the JWT, checks rate/canvas limits,
    // then inserts. On any error, roll back the optimistic store entry.
    void (async () => {
      const { error } = await supabase.functions.invoke('create-drawing', {
        body: {
          drawing:   insertPayload,
          user_id:   drawing.userId,
          canvas_id: drawing.canvasId,
        },
      });

      if (!error) return;

      // Extract the message from the function's JSON response body.
      let msg = 'Failed to save drawing';
      try {
        if ('context' in error && error.context instanceof Response) {
          const body = await (error.context as Response).json();
          if (typeof body?.error === 'string') msg = body.error;
        }
      } catch { /* ignore parse failures */ }

      console.error('[drawings] create-drawing:', msg);

      // Revert the optimistic add.
      useDrawingsStore.setState((state) => ({
        drawings: state.drawings.filter((d) => d.id !== drawing.id),
      }));

      useToastStore.getState().showToast(msg);
    })();
  },

  updateDrawing: (id, updates) =>
    set((state) => ({
      drawings: state.drawings.map((d) => {
        if (d.id !== id) return d;
        const next = { ...d, ...updates };
        // Any interaction with the isActive toggle unmutes the drawing.
        if ('isActive' in updates) next.isMuted = false;
        return next;
      }),
    })),

  mergeDrawing: (id, updates) => {
    const { userId } = useSessionStore.getState();
    const drawing = get().drawings.find((d) => d.id === id);

    set((state) => ({
      drawings: state.drawings.map((d) =>
        d.id === id ? { ...d, ...updates } : d,
      ),
    }));

    // RLS enforces this server-side too; we skip the round-trip for non-owned rows.
    if (!drawing || drawing.userId !== userId) return;

    supabase.from('drawings').update({
      path_data:       updates.path,
      bounding_box:    updates.boundingBox as unknown as Json,
      canvas_position: updates.position,
      note:            updates.soundMapping.note,
      chord:           updates.soundMapping.chord,
      frequencies:     updates.soundMapping.frequency,
    }).eq('id', id).then(({ error }) => {
      if (error) console.error('[drawings] merge update failed:', error.message);
    });
  },

  removeDrawing: (id) => {
    const { userId } = useSessionStore.getState();
    const drawing = get().drawings.find((d) => d.id === id);
    if (!drawing) return;
    if (drawing.userId !== userId) {
      console.warn('[drawings] cannot delete another user\'s drawing');
      return;
    }

    // Optimistic removal — remove from store immediately, then soft-delete in DB.
    set((state) => ({
      drawings: state.drawings.filter((d) => d.id !== id),
    }));

    supabase.from('drawings').update({ is_deleted: true })
      .eq('id', id)
      .then(({ error }) => {
        if (error) console.error('[drawings] soft-delete failed:', error.message);
      });
  },

  toggleHidden: (id) => {
    set((state) => {
      const next = new Set(state.hiddenIds);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveHiddenIds(next);
      return { hiddenIds: next };
    });
  },

  clearDrawings: () => set({ drawings: [] }),

  shuffleSoundMappings: () =>
    set((state) => {
      const unlocked = state.drawings.filter((d) => !d.isLocked);
      if (unlocked.length < 2) return state;

      const mappings = unlocked.map((d) => d.soundMapping);
      for (let i = mappings.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [mappings[i], mappings[j]] = [mappings[j], mappings[i]];
      }

      const newMap = new Map(unlocked.map((d, i) => [d.id, mappings[i]]));
      return {
        drawings: state.drawings.map((d) => {
          if (!newMap.has(d.id)) return d;
          const sm = newMap.get(d.id)!;
          return {
            ...d,
            soundMapping:  sm,
            instrument:    sm.instrument,
            beatPosition:  assignBeatPosition(d.id, sm.instrument),
          };
        }),
      };
    }),
}));

// ── Supabase sync ─────────────────────────────────────────────────────────────
// Runs once when the session is ready (canvasId available). Fetches all
// existing drawings then opens a realtime channel for live updates.

let syncStarted = false;

async function startSync(canvasId: string): Promise<void> {
  // Initial hydration — all fetched drawings start muted.
  const { data, error } = await supabase
    .from('drawings')
    .select('*')
    .eq('canvas_id', canvasId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[drawings] initial load failed:', error.message);
  } else {
    useDrawingsStore.setState({ drawings: (data ?? []).map(rowToDrawing) });
  }

  // Realtime subscription for live canvas updates.
  supabase
    .channel(`drawings:${canvasId}`)
    .on(
      'postgres_changes',
      {
        event:  '*',
        schema: 'public',
        table:  'drawings',
        filter: `canvas_id=eq.${canvasId}`,
      },
      (payload) => {
        const { userId } = useSessionStore.getState();

        if (payload.eventType === 'INSERT') {
          const row = payload.new as unknown as Tables<'drawings'>;
          if (row.user_id === userId) return; // already in store via optimistic add
          if (row.is_deleted) return;
          useDrawingsStore.setState((state) => ({
            drawings: [...state.drawings, rowToDrawing(row)],
          }));
        }

        if (payload.eventType === 'UPDATE') {
          const row = payload.new as unknown as Tables<'drawings'>;

          if (row.is_deleted) {
            // Soft-delete — remove from store regardless of ownership.
            useDrawingsStore.setState((state) => ({
              drawings: state.drawings.filter((d) => d.id !== row.id),
            }));
            return;
          }

          // Another user updated their drawing (e.g. stroke merge).
          // Preserve local client-only state (isActive, isLocked, isMuted).
          if (row.user_id !== userId) {
            useDrawingsStore.setState((state) => ({
              drawings: state.drawings.map((d) => {
                if (d.id !== row.id) return d;
                return {
                  ...rowToDrawing(row),
                  isActive: d.isActive,
                  isLocked: d.isLocked,
                  isMuted:  d.isMuted,
                };
              }),
            }));
          }
        }
      },
    )
    .subscribe();
}

// Watch for session readiness — fires immediately if already loaded.
useSessionStore.subscribe((state) => {
  if (state.isLoaded && state.canvasId && !syncStarted) {
    syncStarted = true;
    startSync(state.canvasId);
  }
});
