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
  console.log('[session:1] initSession start');

  // ── Step 1: Auth ─────────────────────────────────────────────────────────
  let authUserId: string;
  try {
    const sessionResult = await supabase.auth.getSession();
    console.log('[session:2] getSession result:', JSON.stringify({
      session:   sessionResult.data.session ? { user_id: sessionResult.data.session.user.id } : null,
      error:     sessionResult.error?.message ?? null,
    }));

    let session = sessionResult.data.session;

    if (!session) {
      console.log('[session:3] no existing session — calling signInAnonymously');
      const anonResult = await supabase.auth.signInAnonymously();
      console.log('[session:4] signInAnonymously full response:', JSON.stringify({
        session:   anonResult.data.session  ? { user_id: anonResult.data.session.user.id } : null,
        user:      anonResult.data.user     ? { id: anonResult.data.user.id }               : null,
        error:     anonResult.error         ? { message: anonResult.error.message, status: (anonResult.error as { status?: number }).status } : null,
      }));
      if (anonResult.error) throw anonResult.error;
      session = anonResult.data.session;
    }

    if (!session) throw new Error('No session returned after sign-in');
    authUserId = session.user.id;
    console.log('[session:5] auth resolved — authUserId:', authUserId);
  } catch (err) {
    console.error('[session] Auth failed — setting isLoaded:true WITHOUT needsUsername. Modal will NOT appear.', err);
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
    console.log('[session:6] canvasId set:', canvas.id);
  }

  // ── Step 3: User row ─────────────────────────────────────────────────────
  const rawLocalStorageValue = localStorage.getItem(USER_ID_KEY);
  const savedUserId          = rawLocalStorageValue ?? authUserId;
  console.log('[session:7] localStorage raw value:', rawLocalStorageValue, '| savedUserId used for DB query:', savedUserId, '| authUserId:', authUserId);

  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, username')
    .eq('id', savedUserId)
    .maybeSingle();

  console.log('[session:8] users query result:', JSON.stringify({
    user:      user ?? null,
    userError: userError?.message ?? null,
    savedUserId,
  }));

  if (userError) {
    console.error('[session] DB error on user lookup — showing modal. userId:', authUserId);
    useSessionStore.setState({ userId: authUserId, needsUsername: true, isLoaded: true });
    return;
  }

  if (user) {
    console.log('[session:9] returning user found — modal will NOT appear. username:', user.username);
    localStorage.setItem(USER_ID_KEY, user.id);
    useSessionStore.setState({
      userId:   user.id,
      username: user.username,
      isLoaded: true,
    });
  } else {
    console.log('[session:9] no user row — setting needsUsername:true. Modal SHOULD appear.');
    useSessionStore.setState({
      userId:        authUserId,
      needsUsername: true,
      isLoaded:      true,
    });
  }
}

initSession();
