/**
 * OAuth Google (`signInWithGoogle`, grill Q7–Q9): browser round-trip memakai
 * URL Supabase dengan `redirectTo` check-email + `skipBrowserRedirect`, lalu
 * menukar kode via jalur `exchangeAuthCallback` yang sama dengan link email.
 * Dismiss browser = `false` (bukan error); sukses = seed best-effort sekali.
 *
 * `supabase.functions` adalah getter yang mengembalikan klien baru tiap
 * akses (assignment `.invoke` tidak menempel), jadi seam-nya adalah modul
 * `@/supabase` sendiri — bukan properti klien. `expo-web-browser` di-mock
 * karena Jest tidak punya browser.
 */
import * as WebBrowser from 'expo-web-browser';

import { signInWithGoogle } from '@/features/auth';
import { supabase } from '@/supabase';

jest.mock('expo-web-browser', () => ({
  maybeCompleteAuthSession: jest.fn(),
  openAuthSessionAsync: jest.fn(),
}));

jest.mock('@/supabase', () => ({
  supabase: {
    auth: {
      signInWithOAuth: jest.fn(),
      exchangeCodeForSession: jest.fn(),
      setSession: jest.fn(),
    },
    functions: { invoke: jest.fn() },
  },
  purgeLocalUserData: jest.fn(),
}));

const openAuthSessionAsync = WebBrowser.openAuthSessionAsync as unknown as jest.Mock;
const signInWithOAuth = supabase.auth.signInWithOAuth as unknown as jest.Mock;
const exchangeCodeForSession =
  supabase.auth.exchangeCodeForSession as unknown as jest.Mock;
const invoke = supabase.functions.invoke as unknown as jest.Mock;

const OAUTH_URL = 'https://bklriyyuglwiqczgbqgq.supabase.co/auth/v1/authorize?provider=google';
const RETURN_URL = 'cashtrix://check-email?code=oauth-code-1';

beforeEach(() => {
  signInWithOAuth.mockReset();
  exchangeCodeForSession.mockReset();
  invoke.mockReset();
  openAuthSessionAsync.mockReset();
  exchangeCodeForSession.mockResolvedValue({ data: { session: null }, error: null });
  invoke.mockResolvedValue({ data: null, error: null });
});

test('sukses: redirectTo check-email + skipBrowserRedirect, tukar kode, seed sekali', async () => {
  signInWithOAuth.mockResolvedValue({
    data: { url: OAUTH_URL, provider: 'google' },
    error: null,
  });
  openAuthSessionAsync.mockResolvedValue({ type: 'success', url: RETURN_URL });

  await expect(signInWithGoogle()).resolves.toBe(true);

  expect(signInWithOAuth).toHaveBeenCalledWith({
    provider: 'google',
    options: { redirectTo: 'cashtrix://check-email', skipBrowserRedirect: true },
  });
  expect(openAuthSessionAsync).toHaveBeenCalledWith(OAUTH_URL, 'cashtrix://check-email');
  expect(exchangeCodeForSession).toHaveBeenCalledWith('oauth-code-1');
  expect(invoke).toHaveBeenCalledWith('seed-user', { method: 'POST' });
});

test('browser dismiss = false, tanpa exchange dan tanpa seed', async () => {
  signInWithOAuth.mockResolvedValue({
    data: { url: OAUTH_URL, provider: 'google' },
    error: null,
  });
  openAuthSessionAsync.mockResolvedValue({ type: 'cancel' });

  await expect(signInWithGoogle()).resolves.toBe(false);

  expect(exchangeCodeForSession).not.toHaveBeenCalled();
  expect(invoke).not.toHaveBeenCalled();
});

test('error OAuth dilempar, browser tak dibuka', async () => {
  signInWithOAuth.mockResolvedValue({
    data: { url: null, provider: null },
    error: new Error('provider_disabled'),
  });

  await expect(signInWithGoogle()).rejects.toThrow('provider_disabled');
  expect(openAuthSessionAsync).not.toHaveBeenCalled();
});

test('tanpa URL OAuth dilempar sebelum browser', async () => {
  signInWithOAuth.mockResolvedValue({
    data: { url: null, provider: null },
    error: null,
  });

  await expect(signInWithGoogle()).rejects.toThrow('oauth_no_url');
  expect(openAuthSessionAsync).not.toHaveBeenCalled();
});
