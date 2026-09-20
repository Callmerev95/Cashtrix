/**
 * V0 one-time E2E provisioning — creates (or repairs) the fixed Maestro
 * account `e2e@cashtrix.test`, marks it confirmed via the Admin API, and
 * seeds the Cash wallet.
 *
 * Why this exists: with hosted email confirmation on, a Maestro run cannot
 * tap the confirmation email, so the happy-path flow always takes the login
 * path. Run once (and after any `'%cashtrix.test'` cleanup):
 *
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/provision-e2e.mjs
 *
 * Run from the repo root so package resolution works normally.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

import { requireAdminClient } from './lib/admin-confirm.mjs';

const SUPABASE_URL = 'https://bklriyyuglwiqczgbqgq.supabase.co';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const anonKey =
  /EXPO_PUBLIC_SUPABASE_ANON_KEY=(.+)/.exec(env)?.[1]?.trim() ?? '';
if (!anonKey) throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY tidak ditemukan');

const admin = requireAdminClient(
  SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
);

const email = 'e2e@cashtrix.test';
const password = 'Cashtrix123';

async function main() {
  const { data: listed } = await admin.auth.admin.listUsers();
  const existing = listed?.users.find((u) => u.email === email);

  if (existing) {
    const { error } = await admin.auth.admin.updateUserById(existing.id, {
      password,
      email_confirm: true,
    });
    if (error) throw error;
    console.log(`ok  e2e account exists (${existing.id.slice(0, 8)}) — password reset + confirmed`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    console.log(`ok  e2e account created (${data.user.id.slice(0, 8)}) — pre-confirmed`);
  }

  const client = createClient(SUPABASE_URL, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  console.log('ok  login as e2e works');

  const seed = await client.functions.invoke('seed-user', { method: 'POST' });
  if (seed.error) throw seed.error;
  console.log('ok  seed-user ok — Maestro can take the login path');
}

main().catch((error) => {
  console.error('\nprovisioning crashed:', error);
  process.exit(1);
});
