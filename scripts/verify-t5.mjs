/**
 * T5 live verification — runs the real anon client against the hosted project
 * and asserts the contract the client code depends on (RLS scoping, view
 * shape, idempotency, soft-delete + restore, wallet balance effect).
 *
 * Run from the repo root so package resolution works normally:
 *   node scripts/verify-t5.mjs
 *
 * Cleans up after itself: the test user is deleted via the service role at the
 * end (cascade removes wallets + transactions).
 */
import { createClient } from '@supabase/supabase-js';
import { readAnonKey } from './lib/keys.mjs';

import { provisionTestUser, requireAdminClient } from './lib/admin-confirm.mjs';

const SUPABASE_URL = 'https://bklriyyuglwiqczgbqgq.supabase.co';

// Publishable key is safe to hold in the bundle (RLS is the guard). Env var
// on CI, `.env` locally (scripts/lib/keys.mjs).
const anonKey = readAnonKey();

const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const stamp = Date.now();
const email = `t5-verify-${stamp}@cashtrix.test`;
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
  check('seed membuat wallet Cash', wallets?.[0]?.name === 'Cash', wallets?.[0]?.name);
  const cashId = wallets[0].id;

  const { data: extra, error: extraError } = await supabase
    .from('wallets')
    .insert({ user_id: userId, name: 'BCA Live', type: 'bank', opening_balance: 1_000_000 })
    .select('id')
    .single();
  check('membuat wallet kedua', !extraError, extraError?.message);
  const bcaId = extra.id;

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, kind')
    .is('archived_at', null);
  check('kategori sistem terlihat (12)', categories?.length === 12, String(categories?.length));
  const expenseCat = categories.find((c) => c.kind === 'expense' && c.name === 'Makanan');
  const incomeCat = categories.find((c) => c.kind === 'income' && c.name === 'Gaji');

  // -------------------------------------------------------------------------
  section('create + idempotency');
  const key = crypto.randomUUID();
  const occurredAt = new Date().toISOString();

  const first = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      wallet_id: bcaId,
      category_id: expenseCat.id,
      type: 'expense',
      amount: 250_000,
      occurred_at: occurredAt,
      note: '  Makan siang  ',
      idempotency_key: key,
    })
    .select('id')
    .single();
  check('insert transaksi pertama sukses', !first.error, first.error?.message);
  const expenseId = first.data.id;

  const dup = await supabase.from('transactions').insert({
    user_id: userId,
    wallet_id: bcaId,
    category_id: expenseCat.id,
    type: 'expense',
    amount: 250_000,
    occurred_at: occurredAt,
    note: 'retry',
    idempotency_key: key,
  });
  check(
    'retry dengan idempotency key sama ditolak (23505)',
    dup.error?.code === '23505',
    dup.error?.code,
  );

  const income = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      wallet_id: bcaId,
      category_id: incomeCat.id,
      type: 'income',
      amount: 7_000_000,
      occurred_at: new Date(Date.now() - 3_600_000).toISOString(),
      idempotency_key: crypto.randomUUID(),
    })
    .select('id')
    .single();
  check('insert income sukses', !income.error, income.error?.message);

  // -------------------------------------------------------------------------
  section('v_transactions_feed');
  const { data: feed, error: feedError } = await supabase
    .from('v_transactions_feed')
    .select(
      'id, type, amount, currency_code, occurred_at, note, category_id, category_name, category_icon, wallet_id, wallet_name',
    )
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false });

  check('feed terbaca', !feedError, feedError?.message);
  check('feed berisi 2 baris hidup', feed?.length === 2, String(feed?.length));
  check('feed mengurutkan terbaru dulu', feed?.[0]?.type === 'expense');
  check('feed menyertakan nama kategori', feed?.[0]?.category_name === 'Makanan');
  check('feed menyertakan ikon kategori', feed?.[0]?.category_icon === 'restaurant');
  check('feed menyertakan nama wallet', feed?.[0]?.wallet_name === 'BCA Live');
  check('feed menyertakan catatan', feed?.[0]?.note === '  Makan siang  ');

  // -------------------------------------------------------------------------
  section('balances (v_wallet_balances ikut berubah)');
  const { data: balances } = await supabase
    .from('v_wallet_balances')
    .select('wallet_id, name, balance, transaction_count');

  const bca = balances.find((b) => b.wallet_id === bcaId);
  const cash = balances.find((b) => b.wallet_id === cashId);
  check('BCA = 1.000.000 + 7.000.000 − 250.000', Number(bca.balance) === 7_750_000, String(bca.balance));
  check('BCA transaction_count = 2', Number(bca.transaction_count) === 2);
  check('Cash tetap 0', Number(cash.balance) === 0);

  // -------------------------------------------------------------------------
  section('soft-delete + restore');
  const del = await supabase.rpc('soft_delete_transaction', { transaction_id: expenseId });
  check('soft_delete mengembalikan 1', Number(del.data) === 1, JSON.stringify(del.data));

  const { data: afterDelete } = await supabase
    .from('v_transactions_feed')
    .select('id');
  check('feed tinggal 1 baris', afterDelete?.length === 1, String(afterDelete?.length));

  const { data: afterDeleteBalances } = await supabase
    .from('v_wallet_balances')
    .select('wallet_id, balance, transaction_count');
  const bcaAfter = afterDeleteBalances.find((b) => b.wallet_id === bcaId);
  check('saldo BCA kembali 8.000.000', Number(bcaAfter.balance) === 8_000_000, String(bcaAfter.balance));
  check('count BCA kembali 1', Number(bcaAfter.transaction_count) === 1);

  const delAgain = await supabase.rpc('soft_delete_transaction', { transaction_id: expenseId });
  check('soft_delete idempoten (0)', Number(delAgain.data) === 0);

  const restore = await supabase.rpc('restore_transaction', { transaction_id: expenseId });
  check('restore mengembalikan 1', Number(restore.data) === 1);

  const { data: afterRestore } = await supabase
    .from('v_transactions_feed')
    .select('id');
  check('feed kembali 2 baris', afterRestore?.length === 2, String(afterRestore?.length));

  // -------------------------------------------------------------------------
  section('cross-user isolation');
  const otherEmail = `t5-other-${stamp}@cashtrix.test`;
  const otherUserId = await provisionTestUser(admin, other, {
    email: otherEmail,
    password,
    check,
    tag: 'user lain',
  });

  const { data: otherFeed } = await other.from('v_transactions_feed').select('id');
  check('user lain melihat 0 transaksi', otherFeed?.length === 0, String(otherFeed?.length));

  const { error: otherWrite } = await other.from('transactions').insert({
    user_id: userId,
    wallet_id: bcaId,
    category_id: expenseCat.id,
    type: 'expense',
    amount: 1_000,
    occurred_at: occurredAt,
    idempotency_key: crypto.randomUUID(),
  });
  check('user lain tidak bisa menulis atas nama saya (42501)', otherWrite?.code === '42501', otherWrite?.code);

  const otherDelete = await other.rpc('soft_delete_transaction', { transaction_id: expenseId });
  check('user lain tidak bisa menghapus transaksi saya (0)', Number(otherDelete.data) === 0);

  const otherRestore = await other.rpc('restore_transaction', { transaction_id: expenseId });
  check('user lain tidak bisa memulihkan transaksi saya (0)', Number(otherRestore.data) === 0);

  // -------------------------------------------------------------------------
  section('anon (tanpa login)');
  const anon = createClient(SUPABASE_URL, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: anonFeed } = await anon.from('v_transactions_feed').select('id');
  check('anon tidak bisa membaca feed (42501)', anonFeed?.code === '42501', anonFeed?.code);

  const { error: anonDelete } = await anon.rpc('soft_delete_transaction', { transaction_id: expenseId });
  check('anon tidak bisa memanggil soft_delete (42501)', Boolean(anonDelete), anonDelete?.code);

  // -------------------------------------------------------------------------
  section('purge retensi 30 hari (callable)');
  const purge = await supabase.rpc('purge_deleted_transactions');
  check('purge callable oleh authenticated', !purge.error, purge.error?.message);
  check('purge tidak menghapus baris hidup', Number(purge.data) === 0, JSON.stringify(purge.data));

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
