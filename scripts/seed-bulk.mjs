/**
 * Bulk seed for scroll testing (virtualized history) — NOT a verifier.
 *
 * Creates a throwaway user with ~200 transactions spread over the past
 * 60 days (all past dates: the no-future trigger rejects anything ahead),
 * prints its credentials for device login, and LEAVES it behind so the
 * history list can be scrolled on a real phone.
 *
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-bulk.mjs
 *   SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-bulk.mjs --cleanup
 *
 * Cleanup deletes every `bulk-*` test user (cascade removes wallets +
 * transactions). Never run against a real account: the email pattern is the
 * only guard.
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

import { provisionTestUser, requireAdminClient } from './lib/admin-confirm.mjs';

const SUPABASE_URL = 'https://bklriyyuglwiqczgbqgq.supabase.co';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const anonKey =
  /EXPO_PUBLIC_SUPABASE_ANON_KEY=(.+)/.exec(env)?.[1]?.trim() ?? '';
if (!anonKey) throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY tidak ditemukan');

const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const COUNT = 200;
const DAYS = 60;

const supabase = createClient(SUPABASE_URL, anonKey);
const admin = requireAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

let passed = 0;
let failed = 0;
function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label} ${detail}`);
  }
}

function pick(list, i) {
  return list[i % list.length];
}

async function main() {
  if (process.argv.includes('--cleanup')) {
    const { data, error } = await admin.auth.admin.listUsers();
    if (error) throw error;
    const targets = (data.users ?? []).filter((u) =>
      u.email?.startsWith('bulk-'),
    );
    for (const u of targets) {
      const del = await admin.auth.admin.deleteUser(u.id);
      check(`hapus ${u.email}`, !del.error, del.error?.message);
    }
    console.log(`\n${passed} ok, ${failed} gagal (${targets.length} user)`);
    process.exit(failed === 0 ? 0 : 1);
  }

  const stamp = Date.now();
  const email = `bulk-${stamp}@cashtrix.test`;
  const password = 'Cashtrix123';

  let checks = 0;
  const checkFn = (label, condition, detail = '') => {
    checks += 1;
    check(`${checks}. ${label}`, condition, detail);
  };

  const userId = await provisionTestUser(admin, supabase, {
    email,
    password,
    check: checkFn,
    tag: 'user bulk',
  });
  const seed = await supabase.functions.invoke('seed-user', { method: 'POST' });
  checkFn('seed-user sukses', !seed.error, seed.error?.message);

  const { data: wallets } = await supabase
    .from('wallets')
    .select('id')
    .order('created_at');
  const cashId = wallets[0].id;
  const { data: extra } = await supabase
    .from('wallets')
    .insert({ user_id: userId, name: 'BCA Live', type: 'bank', opening_balance: 5_000_000 })
    .select('id')
    .single();
  const bcaId = extra.id;

  const { data: categories } = await supabase
    .from('categories')
    .select('id, kind')
    .is('archived_at', null);
  const expenseCats = categories.filter((c) => c.kind === 'expense');
  const incomeCats = categories.filter((c) => c.kind === 'income');

  const rows = [];
  const now = Date.now();
  for (let i = 0; i < COUNT; i += 1) {
    const isIncome = i % 7 === 0;
    const daysAgo = i % DAYS;
    const occurredAt = new Date(
      now - daysAgo * 86_400_000 - (i % 12) * 3_600_000,
    ).toISOString();
    const cats = isIncome ? incomeCats : expenseCats;
    rows.push({
      user_id: userId,
      wallet_id: i % 3 === 0 ? bcaId : cashId,
      category_id: pick(cats, i).id,
      type: isIncome ? 'income' : 'expense',
      amount: 10_000 + ((i * 37_000) % 490_000),
      occurred_at: occurredAt,
      note: `bulk ${i}`,
      idempotency_key: crypto.randomUUID(),
    });
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const { data, error } = await supabase
      .from('transactions')
      .insert(rows.slice(i, i + 50))
      .select('id');
    if (error) throw error;
    inserted += data.length;
  }
  checkFn(`insert ${COUNT} transaksi`, inserted === COUNT, String(inserted));

  console.log(`\n${passed} ok, ${failed} gagal`);
  console.log(`\nLogin di HP dengan:\n  email: ${email}\n  password: ${password}`);
  console.log('Cleanup: SUPABASE_SERVICE_ROLE_KEY=... node scripts/seed-bulk.mjs --cleanup');
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((cause) => {
  console.error('FATAL', cause instanceof Error ? cause.message : cause);
  process.exit(1);
});
