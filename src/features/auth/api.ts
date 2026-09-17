/**
 * Auth side effects that are not pure: signing in, signing up, signing out,
 * and the `seed-user` call. Everything user-visible (copy, validation) lives
 * in `./validation.ts` so it stays unit-testable without a bridge.
 */
import { supabase, purgeLocalUserData } from '@/supabase';

export type SignUpOutcome = {
  /** True when Supabase created a session immediately (auto-confirm on). */
  hasSession: boolean;
};

export async function signUpWithEmail(
  email: string,
  password: string,
): Promise<SignUpOutcome> {
  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
  });

  if (error) throw error;

  return { hasSession: data.session !== null };
}

export async function signInWithEmail(email: string, password: string) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) throw error;
  return data;
}

/**
 * Calls the `seed-user` Edge Function (service role, JWT-scoped to the caller).
 * Idempotent: safe on every login, not just the first.
 */
export async function runSeedUser(): Promise<void> {
  const { error } = await supabase.functions.invoke('seed-user', {
    method: 'POST',
  });

  if (error) throw error;
}

/**
 * Sign out = drop the session, then drop every local trace. Order matters:
 * purge after the server call so a failed revocation still leaves the user
 * signed in rather than in a half-state.
 */
export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error && error.status !== 403 && error.status !== 404) {
    throw error;
  }
  await purgeLocalUserData();
}
