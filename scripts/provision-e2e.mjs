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
import { readAnonKey } from './lib/keys.mjs';

import { requireAdminClient } from './lib/admin-confirm.mjs';

const SUPABASE_URL = 'https://bklriyyuglwiqczgbqgq.supabase.co';

const anonKey = readAnonKey();

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

  // V6: the happy path's Transfer step needs exactly two wallets with
  // deterministic defaults (source = last-used Cash, destination = the only
  // other wallet), so the flow taps no wallet names. "Bank" is also the
  // walletTypeMeta label, keeping the recurring wallet tap grounded.
  const { data: e2eUser } = await client.auth.getUser();
  const userId = e2eUser?.user?.id;
  if (!userId) throw new Error('sesi e2e tidak terbentuk setelah login');
  const { data: existingWallets, error: listError } = await client
    .from('wallets')
    .select('id, name, archived_at');
  if (listError) throw listError;
  const bank = existingWallets?.find((w) => w.name === 'Bank');
  if (!bank) {
    const { error } = await client
      .from('wallets')
      .insert({ user_id: userId, name: 'Bank', type: 'bank' });
    if (error) throw error;
    console.log('ok  wallet Bank dibuat (tujuan Transfer deterministik)');
  } else {
    const { error } = await client
      .from('wallets')
      .update({ archived_at: null })
      .eq('id', bank.id);
    if (error) throw error;
    console.log('ok  wallet Bank sudah ada (buka-arsip bila perlu)');
  }

  // V6: re-provision is the documented reset point — one run creates one
  // rule, and active rules cap at 20. Clearing here keeps re-runs green
  // without touching the flow.
  const { error: rulesError } = await client
    .from('recurring_rules')
    .delete()
    .eq('user_id', userId);
  if (rulesError) throw rulesError;
  console.log('ok  recurring rules e2e dibersihkan (reset lintas-run)');
}

main().catch((error) => {
  console.error('\nprovisioning crashed:', error);
  process.exit(1);
});
