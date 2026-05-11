import { create } from 'zustand';
import type { BoundingBox } from '../utils/pathUtils';
import type { SoundMapping } from '../utils/soundMapping';
import { mapDrawingToSound } from '../utils/soundMapping';
import type { InstrumentName } from '../constants/instrumentMap';
import { supabase, type Tables, type Json } from '../lib/supabase';
import { useSessionStore } from './sessionStore';
import { useToastStore } from './toastStore';
import { ensureValidSession } from '../utils/sessionGuard';

const STROKE_WIDTH = 4;

export interface DrawingObject {
  id:          string;
  /** auth.users.id of the creator — used for ownership checks. */
  userId:      string;
  username:    string | null;
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
   * Session-only mute flag. False by default for all drawings (loaded or new).
   * The audio loop skips drawings where isMuted is true. Toggled via DrawingPanel.
   */
  isMuted:     boolean;
  /** Per-drawing volume 0–100. Persisted to Supabase. Default 70. */
  volume:      number;
  createdAt:   number;
  soundMapping: SoundMapping;
  beatPosition: number;
}

// Key the hidden-IDs store by userId so two users sharing a browser don't
// bleed into each other's hidden sets. The userId is written to localStorage
// by sessionStore before any canvas interaction is possible, so it's already
// available here at synchronous store-init time for returning users.
function hiddenIdsKey(): string {
  try {
    const uid = localStorage.getItem('concerto_user_id');
    return uid ? `concerto_hidden_drawing_ids:${uid}` : 'concerto_hidden_drawing_ids';
  } catch {
    return 'concerto_hidden_drawing_ids';
  }
}

function loadHiddenIds(): Set<string> {
  try {
    const raw = localStorage.getItem(hiddenIdsKey());
    return new Set<string>(raw ? JSON.parse(raw) : []);
  } catch { return new Set<string>(); }
}

function saveHiddenIds(ids: Set<string>): void {
  try { localStorage.setItem(hiddenIdsKey(), JSON.stringify([...ids])); } catch { /* ignore */ }
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
  setVolume:            (id: string, volume: number) => void;
  clearDrawings: () => void;
  shuffleMutes:  () => void;
}

// ── Row converter ─────────────────────────────────────────────────────────────

function rowToDrawing(row: Tables<'drawings'>, username: string | null = null): DrawingObject {
  const instrument  = row.instrument as InstrumentName;
  const boundingBox = row.bounding_box as unknown as BoundingBox;
  // Re-derive sound mapping from stored geometry so all loaded drawings
  // immediately reflect the current global key/scale rather than values
  // computed by older algorithm versions (e.g. with frequency jitter).
  const soundMapping = mapDrawingToSound({ boundingBox, id: row.id }, row.color);
  return {
    id:          row.id,
    userId:      row.user_id,
    username,
    canvasId:    row.canvas_id,
    path:        row.path_data,
    boundingBox,
    position:    row.canvas_position as unknown as { x: number; y: number },
    strokeColor: row.color,
    strokeWidth: row.stroke_width ?? STROKE_WIDTH,
    instrument,
    isActive:    true,
    isLocked:    false,
    isMuted:     false,
    volume:      (row.volume as number | null) ?? 70,
    createdAt:   new Date(row.created_at).getTime(),
    beatPosition: Number(row.beat_position),
    soundMapping,
  };
}

// ── Store ─────────────────────────────────────────────────────────────────────

const volumeTimers = new Map<string, ReturnType<typeof setTimeout>>();

export const useDrawingsStore = create<DrawingsState>((set, get) => ({
  drawings:  [],
  hiddenIds: loadHiddenIds(),

  addDrawing: (drawing) => {
    set((state) => ({ drawings: [...state.drawings, drawing] }));

    // Cast JSON-column fields so the payload is usable for both the Edge Function
    // body (untyped) and the typed direct-insert fallback below.
    const insertPayload = {
      id:              drawing.id,
      canvas_id:       drawing.canvasId,
      user_id:         drawing.userId,
      path_data:       drawing.path,
      canvas_position: drawing.position       as unknown as Json,
      bounding_box:    drawing.boundingBox    as unknown as Json,
      color:           drawing.strokeColor,
      instrument:      drawing.instrument,
      note:            drawing.soundMapping.note,
      chord:           drawing.soundMapping.chord     as unknown as Json,
      frequencies:     drawing.soundMapping.frequency as unknown as Json,
      beat_position:   drawing.beatPosition,
      volume:          drawing.volume,
      stroke_width:    drawing.strokeWidth,
    };

    void (async () => {
      const { error } = await supabase.functions.invoke('create-drawing', {
        body: { drawing: insertPayload, user_id: drawing.userId, canvas_id: drawing.canvasId },
      });

      if (!error) return;

      // Read HTTP status + message from the response when available.
      let httpStatus: number | null = null;
      let responseMsg: string | null = null;
      if ('context' in error && error.context instanceof Response) {
        httpStatus = (error.context as Response).status;
        try {
          const body = await (error.context as Response).json();
          if (typeof body?.error === 'string') responseMsg = body.error;
        } catch { /* ignore */ }
      }

      // Explicit 4xx rejections from a deployed function (rate limit, drawing cap,
      // canvas inactive, auth error) — roll back and surface the message.
      const isRejection = httpStatus !== null && httpStatus >= 400 && httpStatus < 500 && httpStatus !== 404;
      if (isRejection) {
        console.error('[drawings] create-drawing rejected:', responseMsg);
        useDrawingsStore.setState((s) => ({ drawings: s.drawings.filter((d) => d.id !== drawing.id) }));
        useToastStore.getState().showToast(responseMsg ?? 'Failed to save drawing');
        return;
      }

      // Function not deployed (404), server error (5xx), or network failure —
      // fall back to a direct insert. The drawings_insert_own RLS policy permits
      // this because user_id === auth.uid() for anonymous sessions.
      const { error: insertError } = await supabase.from('drawings').insert(insertPayload);
      if (!insertError) return;

      console.error('[drawings] direct insert fallback failed:', insertError.message);
      useDrawingsStore.setState((s) => ({ drawings: s.drawings.filter((d) => d.id !== drawing.id) }));
      useToastStore.getState().showToast('Failed to save drawing');
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

    void (async () => {
      // Refresh session before writing — catches expired anonymous tokens before
      // they produce opaque RLS errors.
      const session = await ensureValidSession();
      if (!session) {
        useDrawingsStore.setState((s) => ({ drawings: [...s.drawings, drawing] }));
        useToastStore.getState().showToast('Delete failed: session expired — reload and try again');
        return;
      }

      // Confirm auth.uid() still matches drawing.userId. A mismatch means the
      // anonymous session rotated and the new token owns a different user row.
      const authUid = session.userId;
      console.log('[drawings] soft-delete auth check', {
        authUid,
        drawingUserId: drawing.userId,
        storeUserId:   userId,
        match:         authUid === drawing.userId,
      });

      if (authUid !== drawing.userId) {
        console.error('[drawings] soft-delete blocked — auth.uid() does not match drawing.userId (session rotated?)');
        useDrawingsStore.setState((s) => ({ drawings: [...s.drawings, drawing] }));
        useToastStore.getState().showToast('Delete failed: user_id mismatch — session may have rotated');
        return;
      }

      const { error } = await supabase
        .from('drawings')
        .update({ is_deleted: true })
        .eq('id', id)
        .eq('user_id', authUid);

      if (!error) return;

      // Rollback and surface the exact Supabase error so the root cause is visible.
      console.error('[drawings] soft-delete failed', {
        code:    error.code,
        message: error.message,
        details: error.details,
        hint:    error.hint,
      });
      useDrawingsStore.setState((s) => ({ drawings: [...s.drawings, drawing] }));
      const detail = [error.code, error.message].filter(Boolean).join(' — ');
      useToastStore.getState().showToast(`Delete failed: ${detail}`);
    })();
  },

  toggleHidden: (id) => {
    set((state) => {
      const next = new Set(state.hiddenIds);
      if (next.has(id)) next.delete(id); else next.add(id);
      saveHiddenIds(next);
      return { hiddenIds: next };
    });
  },

  setVolume: (id, volume) => {
    set((state) => ({
      drawings: state.drawings.map((d) => d.id === id ? { ...d, volume } : d),
    }));
    const existing = volumeTimers.get(id);
    if (existing) clearTimeout(existing);
    volumeTimers.set(id, setTimeout(() => {
      volumeTimers.delete(id);
      supabase.from('drawings').update({ volume }).eq('id', id).then(({ error }) => {
        if (error) console.error('[drawings] volume update failed:', error.message);
      });
    }, 400));
  },

  clearDrawings: () => set({ drawings: [] }),

  // Randomly mute/unmute every unlocked drawing. Locked drawings keep their
  // current mute state. Bias: each unlocked drawing has a 40% chance of being
  // unmuted, so a busy canvas produces a sparse, fresh combination on each tap.
  shuffleMutes: () =>
    set((state) => ({
      drawings: state.drawings.map((d) =>
        d.isLocked ? d : { ...d, isMuted: Math.random() > 0.4 },
      ),
    })),
}));

// ── Supabase sync ─────────────────────────────────────────────────────────────
// Runs once when the session is ready (canvasId available). Fetches all
// existing drawings then opens a realtime channel for live updates.

// userId → username cache; populated during initial sync and on realtime INSERTs
// from users not yet seen. Avoids per-drawing round-trips on the hot path.
const knownUsernames = new Map<string, string | null>();

let syncStarted = false;

async function startSync(canvasId: string): Promise<void> {
  const { data, error } = await supabase
    .from('drawings')
    .select('*')
    .eq('canvas_id', canvasId)
    .eq('is_deleted', false)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[drawings] initial load failed:', error.message);
  } else {
    const rows = data ?? [];
    // Batch-fetch usernames for every unique creator in one query.
    const userIds = [...new Set(rows.map((r) => r.user_id))];
    if (userIds.length > 0) {
      const { data: usersData } = await supabase
        .from('users')
        .select('id, username')
        .in('id', userIds);
      for (const u of usersData ?? []) knownUsernames.set(u.id, u.username);
    }
    // Force isMuted: true on every loaded drawing — mute state never persists
    // across sessions. The user's own new drawings start unmuted (Canvas.tsx).
    const dbDrawings = rows.map((r) => ({
      ...rowToDrawing(r, knownUsernames.get(r.user_id) ?? null),
      isMuted: true,
    }));
    useDrawingsStore.setState((state) => {
      // Merge: keep optimistic drawings already in store (own strokes drawn during
      // the async fetch), and append only DB rows not yet present locally.
      const existingIds = new Set(state.drawings.map((d) => d.id));
      const newFromDB   = dbDrawings.filter((d) => !existingIds.has(d.id));
      return { drawings: [...state.drawings, ...newFromDB] };
    });
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
          void (async () => {
            // Fetch username if we haven't seen this user before.
            if (!knownUsernames.has(row.user_id)) {
              const { data: uData } = await supabase
                .from('users').select('username').eq('id', row.user_id).maybeSingle();
              knownUsernames.set(row.user_id, uData?.username ?? null);
            }
            // Start muted so a new arrival doesn't interrupt the listener's session.
            // The user can unmute via DrawingPanel or the shuffle button.
            const incoming = {
              ...rowToDrawing(row, knownUsernames.get(row.user_id) ?? null),
              isMuted: true,
            };
            useDrawingsStore.setState((state) => ({
              drawings: [...state.drawings, incoming],
            }));
          })();
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
                  ...rowToDrawing(row, knownUsernames.get(row.user_id) ?? d.username),
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
