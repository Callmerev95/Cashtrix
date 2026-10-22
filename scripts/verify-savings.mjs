/**
 * SV4 live verification — Savings v1 (issue #108) lewat klien anon asli
 * melawan project hosted, memakai query yang sama dengan `features/savings`.
 *
 * Run from the repo root:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/verify-savings.mjs
 *
 * Script ini membuat goal, membaca progress dari `v_wallet_balances` setelah
 * Transfer (bukan menjumlah transaksi), menguji duplicate/CHECK/RLS, guard
 * hapus Wallet, lalu menghapus user uji via Admin API.
 */
import { createClient } from '@supabase/supabase-js';

import { provisionTestUser, requireAdminClient } from './lib/admin-confirm.mjs';
import { readAnonKey } from './lib/keys.mjs';

const SUPABASE_URL = 'https://bklriyyuglwiqczgbqgq.supabase.co';
const anonKey = readAnonKey();
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const stamp = Date.now();
const email = `savings-verify-${stamp}@cashtrix.test`;
const otherEmail = `savings-other-${stamp}@cashtrix.test`;
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
const anon = createClient(SUPABASE_URL, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const admin = requireAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

const GOAL_COLUMNS =
  'id, user_id, wallet_id, name, target_amount, target_date, created_at';

function dateKey(daysFromToday) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return date.toISOString().slice(0, 10);
}

async function main() {
  section('auth + seed');
  const userId = await provisionTestUser(admin, supabase, {
    email,
    password,
    check,
    tag: 'user uji',
  });
  const seed = await supabase.functions.invoke('seed-user', { method: 'POST' });
  check('seed-user sukses', !seed.error, seed.error?.message);

  const source = await supabase
    .from('wallets')
    .insert({
      user_id: userId,
      name: 'Sumber Live',
      type: 'bank',
      opening_balance: 1_000_000,
    })
    .select('id')
    .single();
  check('membuat wallet sumber', !source.error, source.error?.message);
  const sourceId = source.data.id;

  const target = await supabase
    .from('wallets')
    .insert({
      user_id: userId,
      name: 'Tabungan Live',
      type: 'bank',
      opening_balance: 500_000,
    })
    .select('id')
    .single();
  check('membuat wallet target', !target.error, target.error?.message);
  const targetId = target.data.id;

  const disposable = await supabase
    .from('wallets')
    .insert({
      user_id: userId,
      name: 'Tanpa Target',
      type: 'cash',
      opening_balance: 0,
    })
    .select('id')
    .single();
  check('membuat wallet untuk uji hapus', !disposable.error, disposable.error?.message);
  const disposableId = disposable.data.id;

  section('create + list');
  const created = await supabase
    .from('savings_goals')
    .insert({
      user_id: userId,
      wallet_id: targetId,
      name: 'Liburan Bali',
      target_amount: 1_000_000,
      target_date: dateKey(90),
    })
    .select('id')
    .single();
  check('membuat goal sukses', !created.error, created.error?.message);
  const goalId = created.data.id;

  const { data: goals, error: goalsError } = await supabase
    .from('savings_goals')
    .select(GOAL_COLUMNS)
    .order('created_at', { ascending: true });
  check('listSavingsGoals terbaca', !goalsError, goalsError?.message);
  check('list berisi 1 goal', goals?.length === 1, String(goals?.length));
  check('nama goal = Liburan Bali', goals?.[0]?.name === 'Liburan Bali', goals?.[0]?.name);
  check(
    'target nominal = 1.000.000',
    Number(goals?.[0]?.target_amount) === 1_000_000,
    String(goals?.[0]?.target_amount),
  );

  section('constraint');
  const duplicate = await supabase.from('savings_goals').insert({
    user_id: userId,
    wallet_id: targetId,
    name: 'Duplikat',
    target_amount: 1_000_000,
    target_date: null,
  });
  check('satu Wallet hanya satu goal (23505)', duplicate.error?.code === '23505', duplicate.error?.code);

  const zero = await supabase.from('savings_goals').insert({
    user_id: userId,
    wallet_id: disposableId,
    name: 'Nol',
    target_amount: 0,
    target_date: null,
  });
  check('target 0 ditolak (23514)', zero.error?.code === '23514', zero.error?.code);

  const tooBig = await supabase.from('savings_goals').insert({
    user_id: userId,
    wallet_id: disposableId,
    name: 'Besar',
    target_amount: 1_000_000_000_000,
    target_date: null,
  });
  check('target di atas batas ditolak (23514)', tooBig.error?.code === '23514', tooBig.error?.code);

  const longName = await supabase.from('savings_goals').insert({
    user_id: userId,
    wallet_id: disposableId,
    name: 'a'.repeat(61),
    target_amount: 100_000,
    target_date: null,
  });
  check('nama 61 karakter ditolak (23514)', longName.error?.code === '23514', longName.error?.code);

  const blankName = await supabase.from('savings_goals').insert({
    user_id: userId,
    wallet_id: disposableId,
    name: '   ',
    target_amount: 100_000,
    target_date: null,
  });
  check('nama kosong ditolak (23514)', blankName.error?.code === '23514', blankName.error?.code);

  section('update');
  const updated = await supabase
    .from('savings_goals')
    .update({
      name: 'Liburan Bali 2027',
      target_amount: 1_500_000,
      target_date: dateKey(180),
    })
    .eq('id', goalId)
    .eq('user_id', userId);
  check('update goal sukses', !updated.error, updated.error?.message);

  const { data: updatedGoal } = await supabase
    .from('savings_goals')
    .select(GOAL_COLUMNS)
    .eq('id', goalId)
    .single();
  check(
    'update nama + nominal tersimpan',
    updatedGoal?.name === 'Liburan Bali 2027' &&
      Number(updatedGoal?.target_amount) === 1_500_000,
    JSON.stringify(updatedGoal),
  );

  const pastDate = await supabase
    .from('savings_goals')
    .update({ target_date: '2020-01-01' })
    .eq('id', goalId)
    .eq('user_id', userId);
  check('target_date masa lalu tetap legal di DB', !pastDate.error, pastDate.error?.message);

  await supabase
    .from('savings_goals')
    .update({ target_date: dateKey(180) })
    .eq('id', goalId)
    .eq('user_id', userId);

  section('progress dari Saldo Wallet setelah Transfer');
  const transfer = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      wallet_id: sourceId,
      counterparty_wallet_id: targetId,
      category_id: null,
      type: 'transfer',
      amount: 250_000,
      occurred_at: new Date().toISOString(),
      idempotency_key: crypto.randomUUID(),
    })
    .select('id')
    .single();
  check('Transfer 250rb ke goal sukses', !transfer.error, transfer.error?.message);

  const { data: balanceRow, error: balanceError } = await supabase
    .from('v_wallet_balances')
    .select('wallet_id, balance')
    .eq('wallet_id', targetId)
    .single();
  check('Saldo target terbaca dari v_wallet_balances', !balanceError, balanceError?.message);
  check(
    'Saldo target = 750.000 (500rb + Transfer)',
    Number(balanceRow?.balance) === 750_000,
    String(balanceRow?.balance),
  );
  check(
    'progress = 50% dari target 1.500.000',
    (Number(balanceRow?.balance) / Number(updatedGoal?.target_amount)) * 100 === 50,
    `${balanceRow?.balance}/${updatedGoal?.target_amount}`,
  );

  section('guard hapus Wallet + hapus goal');
  const pastGoal = await supabase
    .from('savings_goals')
    .insert({
      user_id: userId,
      wallet_id: disposableId,
      name: 'Target Lama',
      target_amount: 100_000,
      target_date: '2020-01-01',
    })
    .select('id')
    .single();
  check('goal dengan tanggal masa lalu dibuat', !pastGoal.error, pastGoal.error?.message);

  const blockedDelete = await supabase
    .from('wallets')
    .delete()
    .eq('id', disposableId);
  check(
    'hapus Wallet bertarget ditolak (23503)',
    blockedDelete.error?.code === '23503',
    blockedDelete.error?.code,
  );

  const deleteGoal = await supabase
    .from('savings_goals')
    .delete()
    .eq('id', pastGoal.data.id)
    .eq('user_id', userId);
  check('hapus goal sukses', !deleteGoal.error, deleteGoal.error?.message);

  const deleteWallet = await supabase
    .from('wallets')
    .delete()
    .eq('id', disposableId);
  check('Wallet bisa dihapus setelah goal hilang', !deleteWallet.error, deleteWallet.error?.message);

  section('cross-user isolation');
  const otherId = await provisionTestUser(admin, other, {
    email: otherEmail,
    password,
    check,
    tag: 'user lain',
  });

  const { data: otherGoals } = await other
    .from('savings_goals')
    .select('id');
  check('user lain melihat 0 goal', otherGoals?.length === 0, String(otherGoals?.length));

  const foreignUpdate = await other
    .from('savings_goals')
    .update({ name: 'Hacked' })
    .eq('id', goalId);
  check('user lain update goal saya tanpa error fatal', !foreignUpdate.error, foreignUpdate.error?.message);

  const { data: stillMine } = await supabase
    .from('savings_goals')
    .select('name')
    .eq('id', goalId)
    .single();
  check('goal saya tidak berubah oleh user lain', stillMine?.name === 'Liburan Bali 2027', stillMine?.name);

  const foreignDelete = await other
    .from('savings_goals')
    .delete()
    .eq('id', goalId);
  check('user lain delete goal saya tanpa error fatal', !foreignDelete.error, foreignDelete.error?.message);

  const { data: goalStill } = await supabase
    .from('savings_goals')
    .select('id')
    .eq('id', goalId);
  check('goal saya tetap ada setelah delete user lain', goalStill?.length === 1, String(goalStill?.length));

  const foreignInsert = await other.from('savings_goals').insert({
    user_id: userId,
    wallet_id: targetId,
    name: 'Curang',
    target_amount: 100_000,
    target_date: null,
  });
  check('insert dengan user_id orang lain ditolak (42501)', foreignInsert.error?.code === '42501', foreignInsert.error?.code);

  const foreignWallet = await other.from('savings_goals').insert({
    user_id: otherId,
    wallet_id: targetId,
    name: 'Dompet Orang',
    target_amount: 100_000,
    target_date: null,
  });
  check('goal ke Wallet orang lain ditolak (23503)', foreignWallet.error?.code === '23503', foreignWallet.error?.code);

  section('anon');
  const anonSelect = await anon.from('savings_goals').select('id');
  check('anon tidak bisa membaca goal (42501)', anonSelect.error?.code === '42501', anonSelect.error?.code);

  const anonInsert = await anon.from('savings_goals').insert({
    user_id: userId,
    wallet_id: targetId,
    name: 'Anon',
    target_amount: 100_000,
    target_date: null,
  });
  check('anon tidak bisa membuat goal (42501)', anonInsert.error?.code === '42501', anonInsert.error?.code);

  section('cleanup');
  for (const [tag, id] of [
    ['user uji', userId],
    ['user lain', otherId],
  ]) {
    const { error } = await admin.auth.admin.deleteUser(id);
    check(`hapus ${tag}`, !error, error?.message);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nverification crashed:', error);
  process.exit(1);
});
