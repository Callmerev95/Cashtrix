/**
 * V3 live verification — recurring catch-up (ADR-0005) lewat klien anon asli
 * melawan project hosted, menegaskan kontrak yang dipakai kode klien (bentuk
 * rule, jendela starts/ends, lahir di due date tz Profile, plafon 12,
 * unique termasuk soft-delete, jeda, hapus SET NULL, arsip auto-jeda,
 * occurrence masuk Spent, limit 20 aktif, RLS silang-user + anon denial).
 *
 * Run from the repo root so package resolution works normally:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/verify-v3-recurring.mjs
 *
 * Cleans up after itself: the test users are deleted via the service role at
 * the end (cascade removes wallets + rules + transactions).
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';

import { provisionTestUser, requireAdminClient } from './lib/admin-confirm.mjs';

const SUPABASE_URL = 'https://bklriyyuglwiqczgbqgq.supabase.co';

// Publishable key is safe to hold in the bundle (RLS is the guard). Read it
// from .env so the script tracks whatever the app is built with.
const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const anonKey =
  /EXPO_PUBLIC_SUPABASE_ANON_KEY=(.+)/.exec(env)?.[1]?.trim() ?? '';
if (!anonKey) throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY tidak ditemukan');

const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const stamp = Date.now();
const email = `v3-verify-${stamp}@cashtrix.test`;
const password = 'Cashtrix123';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n== ${title}`);
}

const supabase = createClient(SUPABASE_URL, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const other = createClient(SUPABASE_URL, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// V0: konfirmasi email aktif di hosted — akun uji dikonfirmasi via Admin API.
const admin = requireAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

async function main() {
  // -------------------------------------------------------------------------
  section('auth + seed');
  const userId = await provisionTestUser(admin, supabase, {
    email,
    password,
    check,
    tag: 'user uji',
  });
  const seed = await supabase.functions.invoke('seed-user', { method: 'POST' });
  check('seed-user sukses', !seed.error, seed.error?.message);

  for (const [name, type, opening] of [
    ['Dompet A', 'bank', 1_000_000],
    ['Dompet B', 'cash', 500_000],
  ]) {
    const { error } = await supabase
      .from('wallets')
      .insert({ user_id: userId, name, type, opening_balance: opening });
    check(`membuat wallet ${name}`, !error, error?.message);
  }
  const { data: wallets } = await supabase.from('wallets').select('id, name');
  const walletA = wallets.find((w) => w.name === 'Dompet A').id;
  const walletB = wallets.find((w) => w.name === 'Dompet B').id;

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, kind')
    .is('archived_at', null);
  const expenseCat = categories.find((c) => c.kind === 'expense');
  const incomeCat = categories.find((c) => c.kind === 'income');
  check('kategori expense + income tersedia', Boolean(expenseCat && incomeCat));

  const ruleBase = (overrides = {}) => ({
    user_id: userId,
    kind: 'expense',
    amount: 75_000,
    wallet_id: walletA,
    category_id: expenseCat.id,
    due_day: 5,
    due_last: false,
    starts_on: '2026-01-01',
    ends_on: '2026-04-01',
    status: 'active',
    ...overrides,
  });

  // -------------------------------------------------------------------------
  section('bentuk rule ditolak server');
  const transferKind = await supabase
    .from('recurring_rules')
    .insert(ruleBase({ kind: 'transfer' }));
  check(
    'kind transfer ditolak (23514)',
    transferKind.error?.code === '23514',
    transferKind.error?.code,
  );

  const due29 = await supabase
    .from('recurring_rules')
    .insert(ruleBase({ due_day: 29 }));
  check('due 29 ditolak (23514)', due29.error?.code === '23514', due29.error?.code);

  const badStarts = await supabase
    .from('recurring_rules')
    .insert(ruleBase({ starts_on: '2026-01-15' }));
  check(
    'starts_on bukan hari-1 ditolak (23514)',
    badStarts.error?.code === '23514',
    badStarts.error?.code,
  );

  // Wallet arsip: buat + arsipkan dulu, lalu rule menunjuknya.
  const wc = await supabase
    .from('wallets')
    .insert({ user_id: userId, name: 'Dompet C', type: 'ewallet', opening_balance: 0 })
    .select('id')
    .single();
  check('membuat wallet C', !wc.error, wc.error?.message);
  const archived = await supabase
    .from('wallets')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', wc.data.id);
  check('mengarsip wallet C', !archived.error, archived.error?.message);

  const archivedWallet = await supabase
    .from('recurring_rules')
    .insert(ruleBase({ wallet_id: wc.data.id }));
  check(
    'rule ke wallet arsip ditolak (23514)',
    archivedWallet.error?.code === '23514',
    archivedWallet.error?.code,
  );

  // -------------------------------------------------------------------------
  section('catch-up: lahir di due date, plafon 12, idempotent');
  const rExp = await supabase
    .from('recurring_rules')
    .insert(ruleBase({}))
    .select('id')
    .single();
  check('membuat rule expense due 5 (Jan–Mar)', !rExp.error, rExp.error?.message);

  const rLast = await supabase
    .from('recurring_rules')
    .insert(
      ruleBase({
        kind: 'income',
        amount: 100_000,
        category_id: incomeCat.id,
        due_day: null,
        due_last: true,
        starts_on: '2026-01-01',
        ends_on: '2026-03-01',
      }),
    )
    .select('id')
    .single();
  check('membuat rule income due-last (Jan–Feb)', !rLast.error, rLast.error?.message);

  // 13 dues (Jan25–Jan26) → 12 + 1, menguji plafon per panggilan.
  const rCap = await supabase
    .from('recurring_rules')
    .insert(
      ruleBase({
        amount: 7_000,
        due_day: 3,
        starts_on: '2025-01-01',
        ends_on: '2026-02-01',
      }),
    )
    .select('id')
    .single();
  check('membuat rule plafon (13 dues)', !rCap.error, rCap.error?.message);

  const rPaused = await supabase
    .from('recurring_rules')
    .insert(ruleBase({ status: 'paused' }))
    .select('id')
    .single();
  check('membuat rule paused', !rPaused.error, rPaused.error?.message);

  const rFuture = await supabase
    .from('recurring_rules')
    .insert(ruleBase({ due_day: 10, starts_on: '2026-10-01', ends_on: null }))
    .select('id')
    .single();
  check('membuat rule starts masa depan', !rFuture.error, rFuture.error?.message);

  const rDel = await supabase
    .from('recurring_rules')
    .insert(
      ruleBase({ amount: 30_000, due_day: 7, starts_on: '2026-01-01', ends_on: '2026-02-01' }),
    )
    .select('id')
    .single();
  check('membuat rule uji-hapus (Jan7)', !rDel.error, rDel.error?.message);

  const rArch = await supabase
    .from('recurring_rules')
    .insert(
      ruleBase({
        amount: 25_000,
        wallet_id: walletB,
        due_day: 11,
        starts_on: '2026-01-01',
        ends_on: '2026-02-01',
      }),
    )
    .select('id')
    .single();
  check('membuat rule wallet B (Jan11)', !rArch.error, rArch.error?.message);

  // R-exp 3 + R-last 2 + cap 12 + del 1 + arch 1 = 19 (paused/future = 0).
  const first = await supabase.rpc('run_recurring_catchup');
  check('catch-up pertama menulis 19', Number(first.data) === 19, JSON.stringify(first.data ?? first.error));
  const second = await supabase.rpc('run_recurring_catchup');
  check('catch-up kedua menulis sisa 1 (plafon)', Number(second.data) === 1, JSON.stringify(second.data));
  const third = await supabase.rpc('run_recurring_catchup');
  check('catch-up ketiga menulis 0 (idempotent)', Number(third.data) === 0, JSON.stringify(third.data));

  const { data: expRows } = await supabase
    .from('transactions')
    .select('id, occurred_at, occurred_on')
    .eq('recurring_rule_id', rExp.data.id)
    .order('occurred_on');
  check('R-exp punya 3 occurrence (Jan,Feb,Mar)', expRows?.length === 3, String(expRows?.length));
  // WIB = UTC+7 tanpa DST: geser epoch lalu potong tanggal (independen tz mesin).
  const wibDates = (expRows ?? []).map((r) =>
    new Date(new Date(r.occurred_at).getTime() + 7 * 3600 * 1000)
      .toISOString()
      .slice(0, 10),
  );
  check(
    'occurred_at = tengah malam due di WIB',
    wibDates.every((d, i) => d === expRows[i].occurred_on),
    JSON.stringify(wibDates),
  );

  const { data: lastRows } = await supabase
    .from('transactions')
    .select('occurred_on')
    .eq('recurring_rule_id', rLast.data.id)
    .order('occurred_on');
  check(
    'R-last: Jan31 + Feb28 (tidak bolong)',
    JSON.stringify((lastRows ?? []).map((r) => r.occurred_on)) === JSON.stringify(['2026-01-31', '2026-02-28']),
    JSON.stringify(lastRows),
  );

  // -------------------------------------------------------------------------
  section('soft-delete, hapus rule, arsip wallet');
  const victim = expRows[0].id;
  const softDel = await supabase.rpc('soft_delete_transaction', { transaction_id: victim });
  check('soft-delete occurrence = 1', Number(softDel.data) === 1);
  const afterDel = await supabase.rpc('run_recurring_catchup');
  check('catch-up tidak menulis ganda (0)', Number(afterDel.data) === 0, JSON.stringify(afterDel.data));

  const delRule = await supabase.from('recurring_rules').delete().eq('id', rDel.data.id);
  check('hapus rule sukses', !delRule.error, delRule.error?.message);
  const { data: orphan } = await supabase
    .from('transactions')
    .select('id, recurring_rule_id, occurred_on')
    .eq('occurred_on', '2026-01-07');
  check('occurrence tetap setelah rule dihapus (1 baris)', orphan?.length === 1, String(orphan?.length));
  check('kaitan occurrence menjadi null', orphan?.[0]?.recurring_rule_id === null);

  const archiveB = await supabase
    .from('wallets')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', walletB);
  check('mengarsip wallet B', !archiveB.error, archiveB.error?.message);
  const { data: archRule } = await supabase
    .from('recurring_rules')
    .select('status')
    .eq('id', rArch.data.id)
    .single();
  check('rule wallet B otomatis jeda', archRule?.status === 'paused', archRule?.status);

  // -------------------------------------------------------------------------
  section('occurrence masuk Spent dan menembus Alert');
  const budget = await supabase.from('budgets').insert({
    user_id: userId,
    category_id: expenseCat.id,
    month: '2026-02-01',
    amount_limit: 50_000,
  });
  check('membuat budget Feb limit 50rb', !budget.error, budget.error?.message);

  const { data: status } = await supabase
    .from('v_budget_status')
    .select('spent, state')
    .eq('month', '2026-02-01')
    .maybeSingle();
  // Feb: hanya R-exp 75rb (R-cap due 3 di luar jendela ends_on Feb-1;
  // R-del Jan, R-arch Jan; soft-deleted dikecualikan oleh view).
  check('Spent Feb = 75rb', Number(status?.spent) === 75_000, JSON.stringify(status));
  check('state = exceeded', status?.state === 'exceeded', status?.state);

  // -------------------------------------------------------------------------
  section('batas 20 rule aktif');
  // Bebaskan kuota dulu: hapus semua rule aktif sisa (occurrence ter-detach).
  const { data: remaining } = await supabase.from('recurring_rules').select('id');
  for (const row of remaining ?? []) {
    await supabase.from('recurring_rules').delete().eq('id', row.id);
  }
  const { data: monthRow } = await supabase.rpc('current_month', { tz: 'Asia/Jakarta' });
  const [y, m] = String(monthRow).split('-').map(Number);
  const nextMonthOne = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10);

  let fillOk = true;
  for (let i = 0; i < 20; i += 1) {
    const { error } = await supabase
      .from('recurring_rules')
      .insert(ruleBase({ amount: 1_000, due_day: 6, starts_on: nextMonthOne, ends_on: null }));
    if (error) fillOk = false;
  }
  check('20 rule aktif bisa dibuat', fillOk);
  const twentyFirst = await supabase
    .from('recurring_rules')
    .insert(ruleBase({ amount: 1_000, due_day: 6, starts_on: nextMonthOne, ends_on: null }));
  check('rule aktif ke-21 ditolak (23514)', twentyFirst.error?.code === '23514', twentyFirst.error?.code);
  const pausedExtra = await supabase
    .from('recurring_rules')
    .insert(ruleBase({ amount: 1_000, due_day: 6, starts_on: nextMonthOne, ends_on: null, status: 'paused' }));
  check('rule paused ke-21 lolos', !pausedExtra.error, pausedExtra.error?.message);

  // -------------------------------------------------------------------------
  section('cross-user isolation');
  const otherEmail = `v3-other-${stamp}@cashtrix.test`;
  const otherUserId = await provisionTestUser(admin, other, {
    email: otherEmail,
    password,
    check,
    tag: 'user lain',
  });

  const { data: otherRules } = await other.from('recurring_rules').select('id');
  check('user lain melihat 0 rule', otherRules?.length === 0, String(otherRules?.length));

  const otherCatch = await other.rpc('run_recurring_catchup');
  check('catch-up user lain menulis 0', Number(otherCatch.data) === 0, JSON.stringify(otherCatch.data));

  const { data: myRules } = await supabase.from('recurring_rules').select('id');
  check('rule saya tidak tersentuh (21 baris)', myRules?.length === 21, String(myRules?.length));

  // -------------------------------------------------------------------------
  section('anon (tanpa login)');
  const anon = createClient(SUPABASE_URL, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: anonRules } = await anon.from('recurring_rules').select('id');
  check('anon tidak bisa membaca rules (42501)', anonRules?.code === '42501', anonRules?.code);

  const anonCatch = await anon.rpc('run_recurring_catchup');
  check(
    'anon tidak bisa catch-up (42501)',
    anonCatch.error?.code === '42501',
    anonCatch.error?.code,
  );

  // -------------------------------------------------------------------------
  section('cleanup');
  for (const id of [userId, otherUserId]) {
    const { error } = await admin.auth.admin.deleteUser(id);
    check(`hapus user uji ${id.slice(0, 8)}`, !error, error?.message);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nverification crashed:', error);
  process.exit(1);
});
