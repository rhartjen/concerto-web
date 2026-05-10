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
  try {
    // ── Step 1: Restore existing session or create a new anonymous one ───────
    //
    // getSession() returns the persisted session from Supabase's localStorage
    // storage without a network round-trip. signInAnonymously() is only called
    // when there is genuinely no active session (true first visit).
    let { data: { session } } = await supabase.auth.getSession();

    if (!session) {
      const { data, error } = await supabase.auth.signInAnonymously();
      if (error) throw error;
      session = data.session;
    }

    if (!session) {
      console.error('[session] Could not establish an auth session.');
      useSessionStore.setState({ isLoaded: true });
      return;
    }

    const authUserId = session.user.id;

    // ── Step 2: Fetch the main canvas row ────────────────────────────────────
    //
    // The canvas UUID is needed before any drawing operations, so we fetch it
    // early and store it globally. A missing row here is a configuration error
    // (the seed INSERT in schema.sql should have created it).
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

    // ── Step 3: Look up the users row ─────────────────────────────────────────
    //
    // Prefer the user_id saved to localStorage from a prior visit. If the
    // anonymous auth token rotates but the users row still exists under the
    // old UUID, this lets us reconnect the user to their existing data.
    // Falls back to the current auth UID for brand-new sessions.
    const savedUserId = localStorage.getItem(USER_ID_KEY) ?? authUserId;

    const { data: user, error: userError } = await supabase
      .from('users')
      .select('id, username')
      .eq('id', savedUserId)
      .maybeSingle(); // null data (no error) when the row doesn't exist yet

    if (userError) {
      console.error('[session] Failed to load user:', userError.message);
      useSessionStore.setState({ userId: authUserId, isLoaded: true });
      return;
    }

    if (user) {
      // Returning user — refresh the localStorage entry and hydrate the store.
      localStorage.setItem(USER_ID_KEY, user.id);
      useSessionStore.setState({
        userId:   user.id,
        username: user.username,
        isLoaded: true,
      });
    } else {
      // First visit (or users row was deleted) — prompt for a username.
      useSessionStore.setState({
        userId:        authUserId,
        needsUsername: true,
        isLoaded:      true,
      });
    }
  } catch (err) {
    console.error('[session] Unexpected init error:', err);
    useSessionStore.setState({ isLoaded: true });
  }
}

initSession();
