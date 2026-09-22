/**
 * T6 live verification — drives the real anon client against the hosted project
 * and asserts the analytics contract the screen depends on.
 *
 * It seeds a user, writes transactions across two calendar months, then calls
 * the same `analytics_overview` RPC the app calls and checks the payload
 * (totals, delta, breakdown, series) against hand-computed expectations. It
 * also proves RLS scoping: a second user must see zero of the first user's
 * money, and anon must be denied.
 *
 * Run from the repo root:
 *   node scripts/verify-t6.mjs
 *
 * Cleanup: with SUPABASE_SERVICE_ROLE_KEY set, the test users are deleted at
 * the end (cascade); otherwise clean up manually:
 *   delete from auth.users where email like 't6-verify-%' or email like 't6-other-%';
 */
import { createClient } from '@supabase/supabase-js';
import { readAnonKey } from './lib/keys.mjs';

import { provisionTestUser, requireAdminClient } from './lib/admin-confirm.mjs';

const SUPABASE_URL = 'https://bklriyyuglwiqczgbqgq.supabase.co';

const anonKey = readAnonKey();

const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const stamp = Date.now();
const email = `t6-verify-${stamp}@cashtrix.test`;
const otherEmail = `t6-other-${stamp}@cashtrix.test`;
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

/** First instant of the month `n` months before `now`, in tz Asia/Jakarta. */
function monthStartWib(now, monthsAgo) {
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() - monthsAgo;
  // WIB = UTC+7, so the month starts at 17:00 UTC of the previous day.
  return new Date(Date.UTC(y, m, 1) - 7 * 3_600_000);
}

async function main() {
  const now = new Date();

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

  const { data: wallets } = await supabase
    .from('wallets')
    .select('id, name')
    .order('created_at');
  const cashId = wallets?.[0]?.id;
  check('seed membuat wallet', Boolean(cashId), JSON.stringify(wallets));

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, kind')
    .is('archived_at', null);
  const food = categories.find((c) => c.kind === 'expense' && c.name === 'Makanan');
  const transport = categories.find(
    (c) => c.kind === 'expense' && c.name === 'Transportasi',
  );
  const salary = categories.find((c) => c.kind === 'income' && c.name === 'Gaji');

  // -------------------------------------------------------------------------
  section('menulis transaksi lintas dua bulan');
  // Current month (this month, WIB): expense Makanan 300k + expense Transport
  // 100k + income 5.000.000. Previous month: expense Makanan 200k.
  const thisMonthIncome = new Date(monthStartWib(now, 0).getTime() + 9 * 3_600_000);
  const row = (over) => ({
    user_id: userId,
    wallet_id: cashId,
    currency_code: 'IDR',
    idempotency_key: crypto.randomUUID(),
    ...over,
  });

  const inserts = await supabase.from('transactions').insert([
    row({
      category_id: food.id,
      type: 'expense',
      amount: 300_000,
      occurred_at: new Date(monthStartWib(now, 0).getTime() + 2 * 3_600_000).toISOString(),
    }),
    row({
      category_id: transport.id,
      type: 'expense',
      amount: 100_000,
      occurred_at: new Date(monthStartWib(now, 0).getTime() + 50 * 3_600_000).toISOString(),
    }),
    row({
      category_id: salary.id,
      type: 'income',
      amount: 5_000_000,
      occurred_at: thisMonthIncome.toISOString(),
    }),
    row({
      category_id: food.id,
      type: 'expense',
      amount: 200_000,
      occurred_at: new Date(monthStartWib(now, 1).getTime() + 20 * 3_600_000).toISOString(),
    }),
  ]);
  check('insert 4 transaksi lintas bulan', !inserts.error, inserts.error?.message);

  // -------------------------------------------------------------------------
  section('analytics_overview (rentang bulan ini)');
  const rangeStart = monthStartWib(now, 0);
  const rangeEnd = monthStartWib(now, -1);
  const prevStart = monthStartWib(now, 1);
  const prevEnd = rangeStart;

  const overview = await supabase.rpc('analytics_overview', {
    range_start: rangeStart.toISOString(),
    range_end: rangeEnd.toISOString(),
    prev_start: prevStart.toISOString(),
    prev_end: prevEnd.toISOString(),
    tz: 'Asia/Jakarta',
    wallet_filter: null,
    daily: true,
  });
  check('analytics_overview callable', !overview.error, overview.error?.message);
  const payload = overview.data ?? {};

  check(
    'totals.expense = 400.000',
    Number(payload.totals?.expense) === 400_000,
    JSON.stringify(payload.totals),
  );
  check(
    'totals.income = 5.000.000',
    Number(payload.totals?.income) === 5_000_000,
    JSON.stringify(payload.totals),
  );
  check(
    'totals.net = 4.600.000',
    Number(payload.totals?.net) === 4_600_000,
    JSON.stringify(payload.totals),
  );
  check(
    'delta.expense = +100% (400k vs 200k)',
    Math.round(Number(payload.delta?.expense)) === 100,
    String(payload.delta?.expense),
  );
  check(
    'delta.income null (bulan lalu tanpa income, bukan Infinity)',
    payload.delta?.income === null,
    String(payload.delta?.income),
  );
  check(
    'breakdown = 2 kategori expense, Makanan teratas',
    payload.breakdown?.length === 2 &&
      payload.breakdown[0]?.category_name === 'Makanan',
    JSON.stringify(payload.breakdown?.map((b) => b.category_name)),
  );
  check(
    'share Makanan = 0.75 (300k/400k)',
    Math.abs(Number(payload.breakdown?.[0]?.share) - 0.75) < 1e-6,
    String(payload.breakdown?.[0]?.share),
  );
  check(
    'series berisi bucket harian bulan ini',
    Array.isArray(payload.series) && payload.series.length >= 2,
    String(payload.series?.length),
  );

  // -------------------------------------------------------------------------
  section('filter wallet');
  const noWallet = await supabase.rpc('analytics_overview', {
    range_start: rangeStart.toISOString(),
    range_end: rangeEnd.toISOString(),
    prev_start: prevStart.toISOString(),
    prev_end: prevEnd.toISOString(),
    tz: 'Asia/Jakarta',
    wallet_filter: '00000000-0000-4000-a000-000000000000',
    daily: true,
  });
  check(
    'wallet asing -> totals 0 (filter menyaring, bukan error)',
    !noWallet.error && Number(noWallet.data?.totals?.expense) === 0,
    JSON.stringify(noWallet.data?.totals),
  );

  // -------------------------------------------------------------------------
  section('rentang tanpa transaksi -> bukan NaN/Infinity');
  const empty = await supabase.rpc('analytics_overview', {
    range_start: '2000-01-01T00:00:00Z',
    range_end: '2000-02-01T00:00:00Z',
    prev_start: '1999-12-01T00:00:00Z',
    prev_end: '2000-01-01T00:00:00Z',
    tz: 'Asia/Jakarta',
    wallet_filter: null,
    daily: true,
  });
  check(
    'rentang kosong -> totals 0',
    Number(empty.data?.totals?.expense) === 0,
    JSON.stringify(empty.data?.totals),
  );
  check(
    'rentang kosong -> delta null',
    empty.data?.delta?.expense === null,
    String(empty.data?.delta?.expense),
  );
  check(
    'rentang kosong -> breakdown & series []',
    empty.data?.breakdown?.length === 0 && empty.data?.series?.length === 0,
    JSON.stringify(empty.data),
  );

  // -------------------------------------------------------------------------
  section('v_monthly_summary + current_month');
  const monthly = await supabase
    .from('v_monthly_summary')
    .select('month, total_income, total_expense, net')
    .order('month', { ascending: false });
  check(
    'v_monthly_summary: 2 baris (bulan ini + bulan lalu)',
    monthly.data?.length === 2,
    String(monthly.data?.length),
  );
  check(
    'v_monthly_summary: bulan ini expense 400k',
    Number(monthly.data?.[0]?.total_expense) === 400_000,
    JSON.stringify(monthly.data?.[0]),
  );

  const cm = await supabase.rpc('current_month', { tz: 'Asia/Jakarta' });
  check(
    'current_month callable, hari = 1',
    !cm.error && String(cm.data).endsWith('-01'),
    String(cm.data),
  );

  // -------------------------------------------------------------------------
  section('isolasi antar-user (RLS lewat security invoker)');
  const otherUserId = await provisionTestUser(admin, other, {
    email: otherEmail,
    password,
    check,
    tag: 'user lain',
  });
  await other.functions.invoke('seed-user', { method: 'POST' });

  const otherOverview = await other.rpc('analytics_overview', {
    range_start: rangeStart.toISOString(),
    range_end: rangeEnd.toISOString(),
    prev_start: prevStart.toISOString(),
    prev_end: prevEnd.toISOString(),
    tz: 'Asia/Jakarta',
    wallet_filter: null,
    daily: true,
  });
  check(
    'user lain melihat 0 (tidak bocor lewat agregasi)',
    Number(otherOverview.data?.totals?.expense) === 0 &&
      Number(otherOverview.data?.totals?.income) === 0,
    JSON.stringify(otherOverview.data?.totals),
  );

  const otherMonthly = await other
    .from('v_monthly_summary')
    .select('month');
  check(
    'v_monthly_summary user lain: 0 baris',
    otherMonthly.data?.length === 0,
    String(otherMonthly.data?.length),
  );

  // -------------------------------------------------------------------------
  section('anon (tanpa login)');
  const anon = createClient(SUPABASE_URL, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonOverview = await anon.rpc('analytics_overview', {
    range_start: rangeStart.toISOString(),
    range_end: rangeEnd.toISOString(),
    prev_start: prevStart.toISOString(),
    prev_end: prevEnd.toISOString(),
    tz: 'Asia/Jakarta',
    wallet_filter: null,
    daily: true,
  });
  check(
    'anon tidak bisa memanggil analytics_overview (42501)',
    anonOverview.error?.code === '42501' || Boolean(anonOverview.error),
    anonOverview.error?.code,
  );

  const anonView = await anon.from('v_monthly_summary').select('month');
  check('anon tidak bisa membaca v_monthly_summary', Boolean(anonView.error), anonView.error?.code);

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
