/**
 * V4 live verification — undo snackbar + arsip Wallet (issue #33) lewat klien
 * anon asli melawan project hosted, memakai query yang sama persis dengan kode
 * aplikasi (`listWallets`, `listWalletOptions`, `listWalletFilters`,
 * `soft_delete_transaction` / `restore_transaction`).
 *
 * Run from the repo root so package resolution works normally:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/verify-v4.mjs
 *
 * Cleans up after itself: the test users are deleted via the service role at
 * the end (cascade removes wallets + transactions).
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
const email = `v4-verify-${stamp}@cashtrix.test`;
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

  const bca = await supabase
    .from('wallets')
    .insert({ user_id: userId, name: 'BCA Live', type: 'bank', opening_balance: 1_000_000 })
    .select('id')
    .single();
  check('membuat wallet BCA Live', !bca.error, bca.error?.message);
  const bcaId = bca.data.id;

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, kind')
    .is('archived_at', null);
  const expenseCat = categories.find((c) => c.kind === 'expense');

  const nowIso = () => new Date().toISOString();

  // Transfer Cash→BCA duluan supaya feed punya baris ke wallet yang diarsip.
  const transfer = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      wallet_id: cashId,
      counterparty_wallet_id: bcaId,
      category_id: null,
      type: 'transfer',
      amount: 100_000,
      occurred_at: nowIso(),
      idempotency_key: crypto.randomUUID(),
    })
    .select('id')
    .single();
  check('transfer Cash→BCA sukses', !transfer.error, transfer.error?.message);

  const expense = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      wallet_id: cashId,
      category_id: expenseCat.id,
      type: 'expense',
      amount: 25_000,
      occurred_at: nowIso(),
      idempotency_key: crypto.randomUUID(),
    })
    .select('id')
    .single();
  check('expense 25rb di Cash sukses', !expense.error, expense.error?.message);

  // -------------------------------------------------------------------------
  section('arsip: update archived_at via klien');
  const archive = await supabase
    .from('wallets')
    .update({ archived_at: nowIso() })
    .eq('id', bcaId);
  check('arsip BCA via update sukses', !archive.error, archive.error?.message);

  // Query persis `listWallets` (api.ts): view + archived_at terpetakan.
  const { data: listed, error: listedError } = await supabase
    .from('v_wallet_balances')
    .select('wallet_id, name, archived_at')
    .order('created_at');
  check('listWallets terbaca', !listedError, listedError?.message);
  const bcaRow = listed.find((w) => w.wallet_id === bcaId);
  check('BCA terarsip (archived_at terisi)', bcaRow?.archived_at != null, String(bcaRow?.archived_at));
  check('Cash tetap aktif (archived_at null)', listed.find((w) => w.wallet_id === cashId)?.archived_at === null);

  // Query persis `listWalletOptions` (transactions/api.ts): picker form.
  const { data: options } = await supabase
    .from('wallets')
    .select('id, name')
    .is('archived_at', null)
    .order('created_at');
  check('picker: BCA hilang', !options.some((w) => w.id === bcaId), JSON.stringify(options.map((w) => w.name)));
  check('picker: Cash tetap ada', options.some((w) => w.id === cashId));

  // Query persis `listWalletFilters` (analytics/api.ts): chip filter.
  const { data: filters } = await supabase
    .from('v_wallet_balances')
    .select('wallet_id, name')
    .is('archived_at', null)
    .order('created_at');
  check('filter analytics: BCA hilang', !filters.some((w) => w.wallet_id === bcaId));
  check('filter analytics: Cash tetap ada', filters.some((w) => w.wallet_id === cashId));

  // -------------------------------------------------------------------------
  section('feed: transfer lama ke wallet terarsip tetap bernama');
  const { data: feedRow, error: feedError } = await supabase
    .from('v_transactions_feed')
    .select('id, counterparty_wallet_name')
    .eq('id', transfer.data.id)
    .single();
  check('feed terbaca', !feedError, feedError?.message);
  check(
    'feed: nama tujuan = BCA Live meski terarsip',
    feedRow?.counterparty_wallet_name === 'BCA Live',
    feedRow?.counterparty_wallet_name,
  );

  // -------------------------------------------------------------------------
  section('buka-arsip: archived_at null kembali');
  const unarchive = await supabase
    .from('wallets')
    .update({ archived_at: null })
    .eq('id', bcaId);
  check('buka-arsip BCA sukses', !unarchive.error, unarchive.error?.message);

  const { data: optionsAfter } = await supabase
    .from('wallets')
    .select('id')
    .is('archived_at', null);
  check('picker: BCA kembali ada', optionsAfter.some((w) => w.id === bcaId));

  // -------------------------------------------------------------------------
  section('undo: soft-delete lalu restore (jendela snackbar)');
  const del = await supabase.rpc('soft_delete_transaction', { transaction_id: expense.data.id });
  check('hapus expense = 1 baris', Number(del.data) === 1, JSON.stringify(del.data));

  const { data: feedGone } = await supabase
    .from('v_transactions_feed')
    .select('id')
    .eq('id', expense.data.id);
  check('feed: baris terhapus hilang', feedGone?.length === 0, String(feedGone?.length));

  const undo = await supabase.rpc('restore_transaction', { transaction_id: expense.data.id });
  check('Urungkan = restore 1 baris', Number(undo.data) === 1, JSON.stringify(undo.data));

  const { data: feedBack } = await supabase
    .from('v_transactions_feed')
    .select('id')
    .eq('id', expense.data.id);
  check('feed: baris kembali setelah Urungkan', feedBack?.length === 1, String(feedBack?.length));

  // -------------------------------------------------------------------------
  section('hapus wallet terarsip tetap jalur reassign');
  const hardDelete = await supabase.from('wallets').delete().eq('id', bcaId);
  check('hapus BCA (dirujuk transfer) ditolak (23503)', hardDelete.error?.code === '23503', hardDelete.error?.code);

  // -------------------------------------------------------------------------
  section('cross-user isolation');
  const otherEmail = `v4-other-${stamp}@cashtrix.test`;
  await provisionTestUser(admin, other, {
    email: otherEmail,
    password,
    check,
    tag: 'user lain',
  });

  // RLS update orang lain = no-op (0 baris), bukan error — arsip tak berubah.
  const foreignArchive = await other
    .from('wallets')
    .update({ archived_at: nowIso() })
    .eq('id', cashId);
  check('user lain update wallet saya tanpa error fatal', !foreignArchive.error, foreignArchive.error?.message);

  const { data: cashStill } = await supabase
    .from('wallets')
    .select('archived_at')
    .eq('id', cashId)
    .single();
  check('arsip wallet saya tak tersentuh user lain', cashStill?.archived_at === null, String(cashStill?.archived_at));

  const { data: otherFeed } = await other.from('v_transactions_feed').select('id');
  check('user lain melihat 0 transaksi', otherFeed?.length === 0, String(otherFeed?.length));

  const otherRestore = await other.rpc('restore_transaction', { transaction_id: expense.data.id });
  check('user lain tidak bisa restore transaksi saya (0)', Number(otherRestore.data) === 0, JSON.stringify(otherRestore.data));

  // -------------------------------------------------------------------------
  section('anon (tanpa login)');
  const anon = createClient(SUPABASE_URL, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: anonArchive } = await anon
    .from('wallets')
    .update({ archived_at: nowIso() })
    .eq('id', cashId);
  check('anon tidak bisa mengarsip (42501)', anonArchive?.code === '42501', anonArchive?.code);

  const { error: anonBalances } = await anon.from('v_wallet_balances').select('wallet_id');
  check('anon tidak bisa membaca saldo (42501)', anonBalances?.code === '42501', anonBalances?.code);

  // -------------------------------------------------------------------------
  section('cleanup');
  for (const em of [email, otherEmail]) {
    const { data: found } = await admin.auth.admin.listUsers();
    const target = found.users.find((u) => u.email === em);
    if (target) {
      const { error } = await admin.auth.admin.deleteUser(target.id);
      check(`hapus user uji ${em.slice(0, 12)}`, !error, error?.message);
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nverification crashed:', error);
  process.exit(1);
});
