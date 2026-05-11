import { supabase } from '../lib/supabase';

/**
 * Refreshes the Supabase session and returns the current user ID, or null if
 * the session is invalid/expired. Use before any Supabase write operation to
 * catch expired anonymous sessions before they produce opaque RLS errors.
 */
export async function ensureValidSession(): Promise<{ userId: string } | null> {
  const { data, error } = await supabase.auth.refreshSession();
  if (error || !data.session) {
    console.error('[session] refresh failed:', error?.message ?? 'no session returned');
    return null;
  }
  return { userId: data.session.user.id };
}
