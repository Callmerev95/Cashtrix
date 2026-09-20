/**
 * Auth deep-link parser tests (V0 / #29) — the Jest seam for the email-link
 * callbacks: pure function, no bridge, no network.
 *
 * Covers both Supabase link shapes (PKCE `code` query param and implicit
 * hash tokens), error links, and non-callback deep links.
 */
import { parseAuthCallbackUrl } from '@/features/auth/deep-link';

describe('parseAuthCallbackUrl', () => {
  it('parses a PKCE code link (signup confirmation)', () => {
    expect(
      parseAuthCallbackUrl('cashtrix://check-email?code=abc123&type=signup'),
    ).toEqual({ kind: 'code', code: 'abc123' });
  });

  it('parses a PKCE code link (password recovery)', () => {
    expect(
      parseAuthCallbackUrl('cashtrix://reset-password?code=xyz789&type=recovery'),
    ).toEqual({ kind: 'code', code: 'xyz789' });
  });

  it('parses implicit hash tokens', () => {
    expect(
      parseAuthCallbackUrl(
        'cashtrix://reset-password#access_token=at123&refresh_token=rt456&type=recovery',
      ),
    ).toEqual({ kind: 'tokens', accessToken: 'at123', refreshToken: 'rt456' });
  });

  it('surfaces expired/invalid links as errors (query)', () => {
    const parsed = parseAuthCallbackUrl(
      'cashtrix://reset-password?error=access_denied&error_description=Email%20link%20is%20invalid%20or%20has%20expired',
    );
    expect(parsed?.kind).toBe('error');
    if (parsed?.kind === 'error') {
      expect(parsed.message).toContain('expired');
    }
  });

  it('surfaces expired/invalid links as errors (hash)', () => {
    const parsed = parseAuthCallbackUrl(
      'cashtrix://check-email#error=access_denied&error_description=expired',
    );
    expect(parsed).toEqual({ kind: 'error', message: 'expired' });
  });

  it('ignores ordinary deep links without credentials', () => {
    expect(parseAuthCallbackUrl('cashtrix://reset-password')).toBeNull();
    expect(parseAuthCallbackUrl('cashtrix://check-email?email=a@b.c')).toBeNull();
  });

  it('rejects partial tokens and garbage', () => {
    expect(
      parseAuthCallbackUrl('cashtrix://reset-password#access_token=only-one'),
    ).toBeNull();
    expect(parseAuthCallbackUrl('not a url')).toBeNull();
    expect(parseAuthCallbackUrl('')).toBeNull();
  });
});
