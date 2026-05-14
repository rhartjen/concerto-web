import { supabase } from '../lib/supabase';

/**
 * Validates the current session by making a server round-trip with the stored
 * access token. Returns the user ID, or null if the token is invalid/expired.
 *
 * Uses getUser() rather than refreshSession() to avoid a race condition:
 * sessionStore's visibilitychange handler also calls refreshSession(), and two
 * concurrent refresh calls consume the same refresh token twice — the second
 * returns an error and leaves the client with a stale JWT, causing auth.uid()
 * to be NULL in the DB and producing a spurious RLS 42501 on the next write.
 */
export async function ensureValidSession(): Promise<{ userId: string } | null> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    console.error('[session] getUser failed:', error?.message ?? 'no user returned');
    return null;
  }
  return { userId: data.user.id };
}
