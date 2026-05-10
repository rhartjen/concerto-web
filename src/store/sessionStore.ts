import { create } from 'zustand';
import { supabase } from '../lib/supabase';

// localStorage key that persists the user's app-level UUID across sessions.
// Belt-and-suspenders alongside Supabase's own session storage: if the anonymous
// auth token rotates but the users row survives, we can still look up the user.
const USER_ID_KEY = 'concerto_user_id';

// ── State shape ───────────────────────────────────────────────────────────────

interface SessionState {
  /** UUID from the users table (mirrors auth.users.id). Null until loaded. */
  userId:        string | null;
  /** Display name chosen by the user. Null until confirmed. */
  username:      string | null;
  /** UUID of the active canvas row (fetched by slug = 'main'). */
  canvasId:      string | null;
  /** True once the init sequence has completed (success or error). */
  isLoaded:      boolean;
  /** True when the user has no users row yet — triggers the username modal. */
  needsUsername: boolean;

  /**
   * Called by the username modal (E3) after the user submits their chosen name.
   * Inserts the users row, persists the user_id to localStorage, and clears
   * the needsUsername flag. Throws on conflict (e.g. duplicate username).
   */
  setUsername: (username: string) => Promise<void>;
}

// ── Store ─────────────────────────────────────────────────────────────────────

export const useSessionStore = create<SessionState>((set, get) => ({
  userId:        null,
  username:      null,
  canvasId:      null,
  isLoaded:      false,
  needsUsername: false,

  setUsername: async (username: string) => {
    const { userId, canvasId } = get();
    if (!userId) return;

    const { error } = await supabase.from('users').insert({
      id:        userId,
      username,
      canvas_id: canvasId,
    });

    if (error) throw error; // Surface to the modal (e.g. unique constraint → name taken)

    localStorage.setItem(USER_ID_KEY, userId);
    set({ username, needsUsername: false });
  },
}));

// ── Session initializer ───────────────────────────────────────────────────────
// Runs once at module load (no React lifecycle dependency).
// Uses setState directly — not a hook.

async function initSession(): Promise<void> {
  // ── Step 1: Auth ─────────────────────────────────────────────────────────
  // Separated into its own try/catch: if auth itself fails there is no userId
  // and we cannot show the modal meaningfully, so we just unblock the UI.
  let authUserId: string;
  try {
    let { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      session = data.session;
    }

    if (!session) throw new Error('No session returned after sign-in');
    authUserId = session.user.id;
  } catch (err) {
    console.error('[session] Auth failed:', err);
    useSessionStore.setState({ isLoaded: true });
    return;
  }

  // ── Step 2: Canvas (non-fatal) ───────────────────────────────────────────
  const { data: canvas, error: canvasError } = await supabase
    .from('canvases')
    .select('id')
    .eq('slug', 'main')
    .single();

  if (canvasError) {
    console.error('[session] Failed to load canvas:', canvasError.message);
  } else {
    useSessionStore.setState({ canvasId: canvas.id });
  }

  // ── Step 3: User row ─────────────────────────────────────────────────────
  // Prefer the user_id saved to localStorage from a prior visit. Falls back
  // to the current auth UID for brand-new sessions.
  const savedUserId = localStorage.getItem(USER_ID_KEY) ?? authUserId;

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, username')
    .eq('id', savedUserId)
    .maybeSingle();

  if (userError) {
    // DB error (e.g. schema not yet applied, RLS policy). We have a valid auth
    // session, so show the modal anyway — the insert attempt will surface the
    // real error if the table still doesn't exist.
    console.error('[session] Failed to load user:', userError.message);
    useSessionStore.setState({ userId: authUserId, needsUsername: true, isLoaded: true });
    return;
  }

  if (user) {
    localStorage.setItem(USER_ID_KEY, user.id);
    useSessionStore.setState({
      userId:   user.id,
      username: user.username,
      isLoaded: true,
    });
  } else {
    useSessionStore.setState({
      userId:        authUserId,
      needsUsername: true,
      isLoaded:      true,
    });
  }
}

initSession();
