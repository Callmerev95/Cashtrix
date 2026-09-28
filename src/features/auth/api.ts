/**
 * Auth side effects that are not pure: signing in, signing up, signing out,
 * password reset, and the `seed-user` call. Everything user-visible (copy, validation) lives
 * in `./validation.ts` so it stays unit-testable without a bridge.
 */
import * as WebBrowser from 'expo-web-browser';

import { supabase, purgeLocalUserData } from '@/supabase';

import { parseAuthCallbackUrl } from './deep-link';

// Browser-based OAuth needs the in-app session completed on return (web
// only; a no-op on native, so calling it at module scope is safe).
WebBrowser.maybeCompleteAuthSession();

/**
 * Where Supabase sends the user after they tap the signup-confirmation
 * email link. Group segments are transparent in deep links, so
 * `cashtrix://check-email` lands on the `(auth)/check-email` route, which
 * exchanges the attached code for a session (V0).
 */
const CHECK_EMAIL_DEEP_LINK = 'cashtrix://check-email';

/**
 * Where Supabase sends the user after they tap the password-recovery email
 * link. Lands on the `(auth)/reset-password` route (V0).
 */
const RESET_PASSWORD_DEEP_LINK = 'cashtrix://reset-password';

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
    options: { emailRedirectTo: CHECK_EMAIL_DEEP_LINK },
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
 * Signs in (or registers) with Google via the system browser. The OAuth
 * round-trip returns to `cashtrix://check-email` carrying a PKCE `code`,
 * which the Check Email screen exchanges for a session and seeds — the same
 * path as the email-confirmation link, so the gate, MFA, and lock behave
 * identically. Resolves `true` on success, `false` when the user dismisses
 * the browser without completing (not an error). Seeds best-effort on a new
 * session — `openAuthSessionAsync` consumes the return URL itself, so the
 * Check Email screen never sees it.
 */
export async function signInWithGoogle(): Promise<boolean> {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: CHECK_EMAIL_DEEP_LINK, skipBrowserRedirect: true },
  });
  if (error) throw error;
  if (!data.url) throw new Error('oauth_no_url');

  const result = await WebBrowser.openAuthSessionAsync(data.url, CHECK_EMAIL_DEEP_LINK);
  if (result.type !== 'success' || !result.url) return false;
  const exchanged = await exchangeAuthCallback(result.url);
  if (exchanged) await runSeedUser().catch(() => undefined);
  return exchanged;
}
/**
 * Sends a password reset email to the user.
 * The email contains a deep link to `cashtrix://reset-password` which opens the app.
 */
export async function sendPasswordResetEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
    redirectTo: RESET_PASSWORD_DEEP_LINK,
  });
  if (error) throw error;
}

/** Re-sends the signup-confirmation email (Check Email screen, V0). */
export async function resendSignupEmail(email: string): Promise<void> {
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email: email.trim(),
    options: { emailRedirectTo: CHECK_EMAIL_DEEP_LINK },
  });
  if (error) throw error;
}

/**
 * Exchanges a Supabase email-link callback (`cashtrix://…` carrying a PKCE
 * `code` or hash tokens) for a session. Returns `true` when the URL carried
 * a credential, `false` when it is an ordinary deep link. Throws when the
 * link carries an error or the exchange fails, so screens can render it.
 */
export async function exchangeAuthCallback(rawUrl: string): Promise<boolean> {
  const parsed = parseAuthCallbackUrl(rawUrl);
  if (!parsed) return false;
  if (parsed.kind === 'error') throw new Error(parsed.message);
  if (parsed.kind === 'code') {
    const { error } = await supabase.auth.exchangeCodeForSession(parsed.code);
    if (error) throw error;
    return true;
  }
  const { error } = await supabase.auth.setSession({
    access_token: parsed.accessToken,
    refresh_token: parsed.refreshToken,
  });
  if (error) throw error;
  return true;
}

/**
 * Updates the user's password after they've clicked the reset link.
 * This should be called from the reset-password screen after the user enters a new password.
 */
export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw error;
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
