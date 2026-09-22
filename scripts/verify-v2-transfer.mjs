/**
 * V2 live verification — transfer satu baris (ADR-0004) lewat klien anon asli
 * melawan project hosted, menegaskan kontrak yang dipakai kode klien (bentuk
 * baris, saldo dua wallet, feed satu baris, analytics diam, reassign collapse,
 * RLS silang-user + anon denial).
 *
 * Run from the repo root so package resolution works normally:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/verify-v2-transfer.mjs
 *
 * Cleans up after itself: the test users are deleted via the service role at
 * the end (cascade removes wallets + transactions).
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
const email = `v2-verify-${stamp}@cashtrix.test`;
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

  for (const name of ['BCA Live', 'GoPay Live']) {
    const { error } = await supabase
      .from('wallets')
      .insert({ user_id: userId, name, type: 'bank', opening_balance: 1_000_000 });
    check(`membuat wallet ${name}`, !error, error?.message);
  }
  const { data: all } = await supabase.from('wallets').select('id, name');
  const bcaId = all.find((w) => w.name === 'BCA Live').id;
  const gopayId = all.find((w) => w.name === 'GoPay Live').id;

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, kind')
    .is('archived_at', null);
  const expenseCat = categories.find((c) => c.kind === 'expense');

  const nowIso = () => new Date().toISOString();

  // -------------------------------------------------------------------------
  section('shape: transfer vs income/expense');
  const good = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      wallet_id: bcaId,
      counterparty_wallet_id: gopayId,
      category_id: null,
      type: 'transfer',
      amount: 250_000,
      occurred_at: nowIso(),
      idempotency_key: crypto.randomUUID(),
    })
    .select('id')
    .single();
  check('insert transfer valid sukses', !good.error, good.error?.message);
  const transferId = good.data.id;

  const withCategory = await supabase.from('transactions').insert({
    user_id: userId,
    wallet_id: bcaId,
    counterparty_wallet_id: gopayId,
    category_id: expenseCat.id,
    type: 'transfer',
    amount: 1_000,
    occurred_at: nowIso(),
    idempotency_key: crypto.randomUUID(),
  });
  check('transfer + kategori ditolak (23514)', withCategory.error?.code === '23514', withCategory.error?.code);

  const noCounterparty = await supabase.from('transactions').insert({
    user_id: userId,
    wallet_id: bcaId,
    category_id: null,
    type: 'transfer',
    amount: 1_000,
    occurred_at: nowIso(),
    idempotency_key: crypto.randomUUID(),
  });
  check('transfer tanpa tujuan ditolak (23514)', noCounterparty.error?.code === '23514', noCounterparty.error?.code);

  const incomeWithCounterparty = await supabase.from('transactions').insert({
    user_id: userId,
    wallet_id: bcaId,
    counterparty_wallet_id: gopayId,
    category_id: expenseCat.id,
    type: 'income',
    amount: 1_000,
    occurred_at: nowIso(),
    idempotency_key: crypto.randomUUID(),
  });
  check('income + counterparty ditolak (23514)', incomeWithCounterparty.error?.code === '23514', incomeWithCounterparty.error?.code);

  const sameWallet = await supabase.from('transactions').insert({
    user_id: userId,
    wallet_id: bcaId,
    counterparty_wallet_id: bcaId,
    category_id: null,
    type: 'transfer',
    amount: 1_000,
    occurred_at: nowIso(),
    idempotency_key: crypto.randomUUID(),
  });
  check('transfer sumber = tujuan ditolak (23514)', sameWallet.error?.code === '23514', sameWallet.error?.code);

  const future = await supabase.from('transactions').insert({
    user_id: userId,
    wallet_id: bcaId,
    counterparty_wallet_id: gopayId,
    category_id: null,
    type: 'transfer',
    amount: 1_000,
    occurred_at: new Date(Date.now() + 86_400_000).toISOString(),
    idempotency_key: crypto.randomUUID(),
  });
  check('transfer future date ditolak (23514)', future.error?.code === '23514', future.error?.code);

  // -------------------------------------------------------------------------
  section('saldo: sumber turun, tujuan naik, gabungan diam');
  const { data: balances } = await supabase
    .from('v_wallet_balances')
    .select('wallet_id, balance, transaction_count');
  const bal = (id) => balances.find((b) => b.wallet_id === id);
  check('BCA = 1.000.000 − 250.000', Number(bal(bcaId).balance) === 750_000, String(bal(bcaId).balance));
  check('GoPay = 1.000.000 + 250.000', Number(bal(gopayId).balance) === 1_250_000, String(bal(gopayId).balance));
  check(
    'gabungan = 2.000.000 (transfer net nol)',
    balances.reduce((sum, b) => sum + Number(b.balance), 0) === 2_000_000,
    String(balances.reduce((sum, b) => sum + Number(b.balance), 0)),
  );
  check('count BCA = 1 (sumber dihitung)', Number(bal(bcaId).transaction_count) === 1);
  check('count GoPay = 1 (tujuan dihitung)', Number(bal(gopayId).transaction_count) === 1);

  // -------------------------------------------------------------------------
  section('feed satu baris + analytics diam');
  const { data: feed, error: feedError } = await supabase
    .from('v_transactions_feed')
    .select('id, type, category_id, category_name, wallet_name, counterparty_wallet_id, counterparty_wallet_name')
    .eq('id', transferId)
    .single();
  check('feed terbaca', !feedError, feedError?.message);
  check('feed: category null', feed?.category_id === null && feed?.category_name === null);
  check('feed: nama tujuan = GoPay Live', feed?.counterparty_wallet_name === 'GoPay Live', feed?.counterparty_wallet_name);
  check('label klien: "Transfer ke GoPay Live"', `Transfer ke ${feed?.counterparty_wallet_name}` === 'Transfer ke GoPay Live');

  const overview = await supabase.rpc('analytics_overview', {
    range_start: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    range_end: new Date(Date.now() + 60_000).toISOString(),
    prev_start: new Date(Date.now() - 60 * 86_400_000).toISOString(),
    prev_end: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    tz: 'Asia/Jakarta',
    wallet_filter: null,
    daily: true,
  });
  check('analytics_overview callable', !overview.error, overview.error?.message);
  check('analytics mengabaikan transfer (expense 0)', Number(overview.data?.totals?.expense) === 0, JSON.stringify(overview.data?.totals));

  // -------------------------------------------------------------------------
  section('edit + hapus satu baris');
  const edit = await supabase
    .from('transactions')
    .update({ amount: 300_000, note: 'ubah nominal' })
    .eq('id', transferId);
  check('edit amount transfer sukses', !edit.error, edit.error?.message);

  const { data: afterEdit } = await supabase
    .from('v_wallet_balances')
    .select('wallet_id, balance');
  const balAfter = (id) => afterEdit.find((b) => b.wallet_id === id);
  check('BCA = 700.000 setelah edit', Number(balAfter(bcaId).balance) === 700_000, String(balAfter(bcaId).balance));
  check('GoPay = 1.300.000 setelah edit', Number(balAfter(gopayId).balance) === 1_300_000, String(balAfter(gopayId).balance));

  const del = await supabase.rpc('soft_delete_transaction', { transaction_id: transferId });
  check('hapus transfer = 1 baris', Number(del.data) === 1, JSON.stringify(del.data));

  const { data: afterDelete } = await supabase
    .from('v_wallet_balances')
    .select('wallet_id, balance');
  const balDel = (id) => afterDelete.find((b) => b.wallet_id === id);
  check(
    'saldo kembali (BCA 1jt, GoPay 1jt)',
    Number(balDel(bcaId).balance) === 1_000_000 && Number(balDel(gopayId).balance) === 1_000_000,
    JSON.stringify(afterDelete.map((b) => b.balance)),
  );

  // -------------------------------------------------------------------------
  section('reassign: pindah kedua kolom, collapse ditolak');
  // Transfer baru Cash→BCA untuk latihan reassign.
  const t2 = await supabase
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
  check('transfer kedua (Cash→BCA) sukses', !t2.error, t2.error?.message);

  const collapse = await supabase.rpc('reassign_wallet_transactions', {
    from_wallet: cashId,
    to_wallet: bcaId,
  });
  check('reassign Cash→BCA ditolak collapse (23514)', collapse.error?.code === '23514', collapse.error?.code ?? collapse.error?.message);

  // Catatan: transfer pertama (BCA→GoPay, soft-deleted) tetap ikut guard
  // collapse — reassign memindahkan baris soft-deleted juga, jadi reassign
  // BCA→GoPay tetap ditolak meski barisnya sudah dihapus.
  const stillCollapse = await supabase.rpc('reassign_wallet_transactions', {
    from_wallet: bcaId,
    to_wallet: gopayId,
  });
  check('reassign BCA→GoPay tetap collapse via baris soft-deleted (23514)', stillCollapse.error?.code === '23514', stillCollapse.error?.code ?? stillCollapse.error?.message);

  // Cash→GoPay aman: tidak ada baris yang menjadi sumber=tujuan.
  const moved = await supabase.rpc('reassign_wallet_transactions', {
    from_wallet: cashId,
    to_wallet: gopayId,
  });
  check('reassign Cash→GoPay sukses', !moved.error, moved.error?.message);
  check('reassign Cash→GoPay memindahkan 1 baris', Number(moved.data) === 1, JSON.stringify(moved.data));

  const { data: t2row } = await supabase
    .from('transactions')
    .select('wallet_id, counterparty_wallet_id')
    .eq('id', t2.data.id)
    .single();
  check(
    'wallet_id Cash→BCA ikut pindah ke GoPay (GoPay→BCA)',
    t2row?.wallet_id === gopayId && t2row?.counterparty_wallet_id === bcaId,
    JSON.stringify(t2row),
  );

  // GoPay→Cash memindahkan KEDUA sisi: wallet t2 (GoPay→Cash) dan counterparty
  // transfer pertama yang soft-deleted (BCA→GoPay jadi BCA→Cash).
  const moved2 = await supabase.rpc('reassign_wallet_transactions', {
    from_wallet: gopayId,
    to_wallet: cashId,
  });
  check('reassign GoPay→Cash sukses', !moved2.error, moved2.error?.message);
  check('reassign GoPay→Cash memindahkan 2 baris', Number(moved2.data) === 2, JSON.stringify(moved2.data));

  const { data: t2back } = await supabase
    .from('transactions')
    .select('wallet_id, counterparty_wallet_id')
    .eq('id', t2.data.id)
    .single();
  check(
    't2 kembali Cash→BCA',
    t2back?.wallet_id === cashId && t2back?.counterparty_wallet_id === bcaId,
    JSON.stringify(t2back),
  );

  // -------------------------------------------------------------------------
  section('cross-user isolation');
  const otherEmail = `v2-other-${stamp}@cashtrix.test`;
  const otherUserId = await provisionTestUser(admin, other, {
    email: otherEmail,
    password,
    check,
    tag: 'user lain',
  });

  const { data: otherFeed } = await other.from('v_transactions_feed').select('id');
  check('user lain melihat 0 transaksi', otherFeed?.length === 0, String(otherFeed?.length));

  const ownWallet = await other
    .from('wallets')
    .insert({ user_id: otherUserId, name: 'Dompet Lain', type: 'cash', opening_balance: 0 })
    .select('id')
    .single();
  check('user lain punya wallet sendiri', !ownWallet.error, ownWallet.error?.message);

  const foreignCounterparty = await other.from('transactions').insert({
    user_id: otherUserId,
    wallet_id: ownWallet.data.id,
    counterparty_wallet_id: bcaId,
    category_id: null,
    type: 'transfer',
    amount: 1_000,
    occurred_at: nowIso(),
    idempotency_key: crypto.randomUUID(),
  });
  check(
    'counterparty wallet orang lain ditolak (23503)',
    foreignCounterparty.error?.code === '23503',
    foreignCounterparty.error?.code,
  );

  const otherDelete = await other.rpc('soft_delete_transaction', { transaction_id: t2.data.id });
  check('user lain tidak bisa menghapus transfer saya (0)', Number(otherDelete.data) === 0);

  // -------------------------------------------------------------------------
  section('anon (tanpa login)');
  const anon = createClient(SUPABASE_URL, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: anonFeed } = await anon.from('v_transactions_feed').select('id');
  check('anon tidak bisa membaca feed (42501)', anonFeed?.code === '42501', anonFeed?.code);

  const { error: anonBalances } = await anon.from('v_wallet_balances').select('wallet_id');
  check('anon tidak bisa membaca saldo (42501)', anonBalances?.code === '42501', anonBalances?.code);

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
