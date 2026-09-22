/**
 * T7 live verification — drives the real anon client against the hosted project
 * and asserts the budget contract the screen depends on.
 *
 * It seeds a user, creates a month budget, writes expenses across the 80%/100%
 * thresholds, then checks `v_budget_status` (spent, percent, state) plus the
 * `budget_alerts` dedup (`ON CONFLICT DO NOTHING` via upsert ignoreDuplicates:
 * same threshold twice = one row, turun-naik = no double-fire, other user on
 * the same system category is not blocked). It also proves the expense-only
 * guard (23514), RLS scoping, and anon denial.
 *
 * Run from the repo root:
 *   node scripts/verify-t7.mjs
 *
 * Cleanup: with SUPABASE_SERVICE_ROLE_KEY set, the test users are deleted at
 * the end (cascade); otherwise clean up manually:
 *   delete from auth.users where email like 't7-verify-%' or email like 't7-other-%';
 */
import { createClient } from '@supabase/supabase-js';
import { readAnonKey } from './lib/keys.mjs';

import { provisionTestUser, requireAdminClient } from './lib/admin-confirm.mjs';

const SUPABASE_URL = 'https://bklriyyuglwiqczgbqgq.supabase.co';

const anonKey = readAnonKey();

const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const stamp = Date.now();
const email = `t7-verify-${stamp}@cashtrix.test`;
const otherEmail = `t7-other-${stamp}@cashtrix.test`;
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
  const salary = categories.find((c) => c.kind === 'income' && c.name === 'Gaji');
  check('kategori sistem terbaca', Boolean(food?.id && salary?.id));

  const cm = await supabase.rpc('current_month', { tz: 'Asia/Jakarta' });
  check('current_month hari = 1', !cm.error && String(cm.data).endsWith('-01'), String(cm.data));
  const month = cm.data;

  // -------------------------------------------------------------------------
  section('guard expense-only + upsert update di bulan berjalan');
  const badBudget = await supabase.from('budgets').insert({
    user_id: userId,
    category_id: salary.id,
    month,
    amount_limit: 100_000,
  });
  check(
    'budget kategori income ditolak (23514)',
    badBudget.error?.code === '23514',
    badBudget.error?.code,
  );

  const create = await supabase.from('budgets').upsert(
    { user_id: userId, category_id: food.id, month, amount_limit: 500_000 },
    { onConflict: 'user_id,category_id,month' },
  );
  check('budget 500rb tersimpan', !create.error, create.error?.message);

  const update = await supabase.from('budgets').upsert(
    { user_id: userId, category_id: food.id, month, amount_limit: 1_000_000 },
    { onConflict: 'user_id,category_id,month' },
  );
  check('update limit di bulan berjalan sukses', !update.error, update.error?.message);

  const rows = await supabase.from('v_budget_status').select('*').eq('month', month);
  check(
    'satu baris budget (upsert = update, bukan duplikat)',
    rows.data?.length === 1 && Number(rows.data[0].amount_limit) === 1_000_000,
    JSON.stringify(rows.data),
  );

  // -------------------------------------------------------------------------
  section('threshold 40% ok → 80% warning → 110% exceeded');
  const nowIso = new Date().toISOString();
  const tx = (amount) => ({
    user_id: userId,
    wallet_id: cashId,
    category_id: food.id,
    type: 'expense',
    amount,
    currency_code: 'IDR',
    occurred_at: nowIso,
    idempotency_key: crypto.randomUUID(),
  });

  async function status() {
    const { data, error } = await supabase
      .from('v_budget_status')
      .select('spent, percent, state')
      .eq('month', month)
      .maybeSingle();
    if (error) throw error;
    return { spent: Number(data.spent), percent: Number(data.percent), state: data.state };
  }

  const fired = [];
  async function fireAlert(client, uid, threshold) {
    const { data, error } = await client
      .from('budget_alerts')
      .upsert(
        { user_id: uid, category_id: food.id, month, threshold },
        { onConflict: 'user_id,category_id,month,threshold', ignoreDuplicates: true },
      )
      .select('id');
    if (error) throw error;
    return data.length > 0;
  }

  await supabase.from('transactions').insert([tx(400_000)]);
  let s = await status();
  check('400rb/1jt = 40% ok', s.spent === 400_000 && s.state === 'ok', JSON.stringify(s));

  await supabase.from('transactions').insert([tx(400_000)]);
  s = await status();
  check('800rb/1jt = 80% warning', s.spent === 800_000 && s.state === 'warning', JSON.stringify(s));

  const firstWarning = await fireAlert(supabase, userId, 'warning_80');
  const secondWarning = await fireAlert(supabase, userId, 'warning_80');
  check('warning_80 pertama tercatat (true)', firstWarning === true);
  check('warning_80 kedua dedup (false)', secondWarning === false);
  fired.push(firstWarning, secondWarning);

  const tx3 = await supabase.from('transactions').insert([tx(300_000)]).select('id');
  const tx3Id = tx3.data[0].id;
  s = await status();
  check('1,1jt/1jt = 110% exceeded', s.spent === 1_100_000 && s.state === 'exceeded', JSON.stringify(s));

  const firstExceeded = await fireAlert(supabase, userId, 'exceeded_100');
  check('exceeded_100 tercatat mandiri (true)', firstExceeded === true);

  // -------------------------------------------------------------------------
  section('soft-delete menurunkan spent tanpa menghapus alert');
  const softDel = await supabase.rpc('soft_delete_transaction', { transaction_id: tx3Id });
  check('soft_delete_transaction 1 baris', !softDel.error && softDel.data === 1, JSON.stringify(softDel));
  s = await status();
  check('spent turun ke 800rb (warning)', s.spent === 800_000 && s.state === 'warning', JSON.stringify(s));

  const refire = await fireAlert(supabase, userId, 'warning_80');
  check('re-fire setelah turun-naik tetap dedup (false)', refire === false);

  const alertRows = await supabase.from('budget_alerts').select('threshold').eq('month', month);
  check(
    '2 baris alert (warning_80 + exceeded_100)',
    alertRows.data?.length === 2,
    JSON.stringify(alertRows.data),
  );

  // -------------------------------------------------------------------------
  section('isolasi antar-user (dedup per-user, PRD §6.1 R1)');
  const otherUserId = await provisionTestUser(admin, other, {
    email: otherEmail,
    password,
    check,
    tag: 'user lain',
  });
  await other.functions.invoke('seed-user', { method: 'POST' });

  const otherRows = await other.from('v_budget_status').select('budget_id');
  check('user lain melihat 0 budget', otherRows.data?.length === 0, String(otherRows.data?.length));

  const otherFire = await fireAlert(other, otherUserId, 'warning_80');
  check(
    'user lain fire threshold sama di kategori sistem (true, tidak diblokir)',
    otherFire === true,
  );

  // -------------------------------------------------------------------------
  section('anon (tanpa login)');
  const anon = createClient(SUPABASE_URL, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonView = await anon.from('v_budget_status').select('budget_id');
  check('anon tidak bisa membaca v_budget_status', Boolean(anonView.error), anonView.error?.code);

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
