/**
 * URL polyfill — must be imported before `@supabase/supabase-js` so
 * `URL`/`URLSearchParams` behave in Hermes (supabase-js builds request URLs
 * with them; Hermes' built-in `URL` is incomplete).
 */
import 'react-native-url-polyfill/auto';

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

import { LOCK_ENABLED_KEY } from '@/features/lock/domain';

/** Supabase project `Cashtrix` (AGENTS.md → Database). */
const SUPABASE_URL = 'https://bklriyyuglwiqczgbqgq.supabase.co';

/**
 * Publishable key. Sent with every client request, so it is not a secret;
 * the real guard is RLS (deny-by-default on 100% of tables). Only the service
 * role key — which lives in Edge Functions — must stay out of the bundle.
 */
const SUPABASE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

if (!SUPABASE_PUBLISHABLE_KEY) {
  // Fail loudly in dev: a silently empty key makes every request 401 and the
  // symptom (login "Email atau password salah") points at the wrong cause.
  console.warn(
    '[supabase] EXPO_PUBLIC_SUPABASE_ANON_KEY belum diisi — lihat .env.example',
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // Native apps have no OAuth redirect URL to parse; leave it off so the
    // auth client never tries to read a session from the URL.
    detectSessionInUrl: false,
  },
});

/**
 * Storage keys owned by the app. Sign out clears all of them (PRD §2.3 Epic A
 * / R2). T5 registers its persistent cache (`expo-sqlite`) name here once the
 * cache exists — the purge already walks this list.
 */
export const LOCAL_STORAGE_KEYS = [
  'cashtrix:last-transaction-type',
  'cashtrix:last-wallet-id',
  LOCK_ENABLED_KEY,
] as const;

/** Extra purge hooks (e.g. dropping the SQLite cache in T5). */
type PurgeListener = () => Promise<void> | void;
const purgeListeners = new Set<PurgeListener>();

/** Register a cleanup callback that runs on sign out. Returns an unsubscribe. */
export function onLocalDataPurge(listener: PurgeListener): () => void {
  purgeListeners.add(listener);
  return () => purgeListeners.delete(listener);
}

/**
 * Removes every trace of local user data: our own storage keys, any Supabase
 * auth token left behind, and registered caches. Deliberately *not* a blanket
 * `AsyncStorage.clear()` — unrelated keys would be collateral damage.
 */
export async function purgeLocalUserData(): Promise<void> {
  const keys = [...LOCAL_STORAGE_KEYS, ...(await supabaseAuthStorageKeys())];
  await AsyncStorage.multiRemove(keys);
  await Promise.all([...purgeListeners].map((listener) => listener()));
}

/** Auth token keys created by supabase-js under the default storage key. */
async function supabaseAuthStorageKeys(): Promise<string[]> {
  const all = await AsyncStorage.getAllKeys();
  return all.filter((key) => key.startsWith('sb-') && key.endsWith('-auth-token'));
}
