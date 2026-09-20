/**
 * Supabase email-link callback parser — pure, no React and no network.
 *
 * Both the signup-confirmation and the recovery email carry the credential
 * back to the app as a deep link (`cashtrix://check-email` /
 * `cashtrix://reset-password`). Because the client runs with
 * `detectSessionInUrl: false` (native has no URL to parse), the receiving
 * screen hands the raw URL to `exchangeAuthCallback` (`./api.ts`), which
 * relies on this parser first. Unit-tested without a bridge.
 *
 * Two link shapes exist:
 * - PKCE (supabase-js v2 default): `?code=…` (optionally with `type=signup`
 *   or `type=recovery`).
 * - Implicit hash: `#access_token=…&refresh_token=…&type=…`.
 * Expired/invalid links arrive as `?error=…&error_description=…`.
 */
export type AuthCallback =
  | { kind: 'code'; code: string }
  | { kind: 'tokens'; accessToken: string; refreshToken: string }
  | { kind: 'error'; message: string }
  | null;

export function parseAuthCallbackUrl(rawUrl: string): AuthCallback {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }

  const errorDescription =
    url.searchParams.get('error_description') ?? url.searchParams.get('error');
  if (errorDescription) {
    return { kind: 'error', message: errorDescription };
  }

  const code = url.searchParams.get('code');
  if (code) {
    return { kind: 'code', code };
  }

  // Hash fragment: `reset-password#access_token=…&refresh_token=…`.
  const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash;
  if (hash) {
    const params = new URLSearchParams(hash);
    const hashError = params.get('error_description') ?? params.get('error');
    if (hashError) {
      return { kind: 'error', message: hashError };
    }
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    if (accessToken && refreshToken) {
      return { kind: 'tokens', accessToken, refreshToken };
    }
  }

  return null;
}
