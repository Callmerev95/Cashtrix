/**
 * T9 live verification — drives the real anon client against the hosted project
 * and asserts the data-ownership contract (issue #10, PRD §2.3 Epic F).
 *
 * Flow: signup → seed → wallet + transaksi (note bermusuhan: koma + quote) →
 * export-csv (header persis + isi + escaping + order desc + soft-delete
 * excluded) → cross-user isolation → anon denial (401) → avatar upload +
 * budget/alert → delete-account → login lama gagal + tidak ada baris tersisa
 * (profiles/wallets/categories/transactions/budgets/budget_alerts/auth.users +
 * storage kosong) + grep service-role-key tidak ada di src/ + app/.
 *
 * Run from the repo root:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/verify-t9.mjs
 * (key needed for the post-delete row-absence proof + cleanup; fetch it via
 * the Management API api-keys endpoint — never commit it.)
 *
 * Cleanup: user A dihapus oleh delete-account yang sedang diuji; user B
 * dihapus di akhir via admin. Verifikasi 0 residu setelahnya:
 *   delete from auth.users where email like 't9-verify-%' or email like 't9-other-%';
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { provisionTestUser } from './lib/admin-confirm.mjs';

const SUPABASE_URL = 'https://bklriyyuglwiqczgbqgq.supabase.co';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const anonKey =
  /EXPO_PUBLIC_SUPABASE_ANON_KEY=(.+)/.exec(env)?.[1]?.trim() ?? '';
if (!anonKey) throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY tidak ditemukan');

const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_SERVICE_ROLE) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY harus di-set (bukti tidak ada baris tersisa + cleanup)',
  );
}

const stamp = Date.now();
const email = `t9-verify-${stamp}@cashtrix.test`;
const otherEmail = `t9-other-${stamp}@cashtrix.test`;
const password = 'Cashtrix123';

// 1x1 PNG (68 byte) — cukup untuk membuktikan lifecycle avatar storage.
const PNG_1PX = Uint8Array.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
  0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
  0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53, 0xde, 0x00, 0x00, 0x00,
  0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
  0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59, 0xe7, 0x00, 0x00, 0x00,
  0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
]);

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
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

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
  check('seed membuat wallet', Boolean(cashId));

  const customWallet = await supabase
    .from('wallets')
    .insert({ user_id: userId, name: 'T9 Dompet', type: 'bank', opening_balance: 0 })
    .select('id')
    .single();
  check('wallet kustom T9 Dompet tersimpan', !customWallet.error, customWallet.error?.message);
  const customWalletId = customWallet.data.id;

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, kind')
    .is('archived_at', null);
  const food = categories.find((c) => c.kind === 'expense' && c.name === 'Makanan');
  const salary = categories.find((c) => c.kind === 'income' && c.name === 'Gaji');
  check('kategori sistem terbaca', Boolean(food?.id && salary?.id));

  // -------------------------------------------------------------------------
  section('transaksi uji (note bermusuhan untuk escaping)');
  const older = new Date(Date.now() - 3600_000).toISOString();
  const newer = new Date().toISOString();
  const hostileNote = 'nasi padang, rendang "extra"';
  const tx1 = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      wallet_id: cashId,
      category_id: food.id,
      type: 'expense',
      amount: 50_000,
      currency_code: 'IDR',
      occurred_at: older,
      note: hostileNote,
      idempotency_key: crypto.randomUUID(),
    })
    .select('id')
    .single();
  check('tx1 expense tersimpan', !tx1.error, tx1.error?.message);

  const tx2 = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      wallet_id: customWalletId,
      category_id: salary.id,
      type: 'income',
      amount: 1_000_000,
      currency_code: 'IDR',
      occurred_at: newer,
      note: 'gaji september',
      idempotency_key: crypto.randomUUID(),
    })
    .select('id')
    .single();
  check('tx2 income tersimpan', !tx2.error, tx2.error?.message);

  // -------------------------------------------------------------------------
  section('export-csv (AC #1)');
  const exported = await supabase.functions.invoke('export-csv', { method: 'POST' });
  check('export-csv sukses', !exported.error, exported.error?.message);
  const csv = typeof exported.data === 'string' ? exported.data : '';
  check('respons adalah string CSV', typeof exported.data === 'string');

  const lines = csv.split('\n');
  check(
    'header kolom persis (date,type,category,wallet,amount,currency,note)',
    lines[0] === 'date,type,category,wallet,amount,currency,note',
    JSON.stringify(lines[0]),
  );
  check('2 baris data', lines.length === 3, `got ${lines.length} baris`);
  check('memuat kategori + wallet milik caller', csv.includes('Makanan') && csv.includes('T9 Dompet'));
  check('memuat amount + currency', csv.includes('50000') && csv.includes('1000000') && csv.includes('IDR'));
  check(
    'note bermusuhan ter-escape RFC 4180',
    csv.includes('"nasi padang, rendang ""extra"""'),
  );
  check(
    'order occurred_at desc (tx baru di atas)',
    csv.indexOf('gaji september') !== -1 &&
      csv.indexOf('gaji september') < csv.indexOf('nasi padang'),
  );

  // -------------------------------------------------------------------------
  section('soft-deleted excluded dari CSV');
  const softDel = await supabase.rpc('soft_delete_transaction', {
    transaction_id: tx1.data.id,
  });
  check('soft_delete_transaction 1 baris', !softDel.error && softDel.data === 1);
  const reExported = await supabase.functions.invoke('export-csv', { method: 'POST' });
  const csv2 = typeof reExported.data === 'string' ? reExported.data : '';
  check(
    'transaksi terhapus tidak muncul di CSV',
    !csv2.includes('nasi padang') && csv2.includes('gaji september'),
  );
  // Kembalikan agar delete-account diuji dengan data lengkap (termasuk
  // baris soft-deleted — function harus menghapusnya permanen juga).
  const restored = await supabase.rpc('restore_transaction', {
    transaction_id: tx1.data.id,
  });
  check('restore_transaction 1 baris', !restored.error && restored.data === 1);

  // -------------------------------------------------------------------------
  section('isolasi antar-user');
  const otherUserId = await provisionTestUser(admin, other, {
    email: otherEmail,
    password,
    check,
    tag: 'user lain',
  });
  await other.functions.invoke('seed-user', { method: 'POST' });

  const otherExport = await other.functions.invoke('export-csv', { method: 'POST' });
  const otherCsv = typeof otherExport.data === 'string' ? otherExport.data : 'NON-STRING';
  check('user B export sukses', !otherExport.error, otherExport.error?.message);
  check(
    'user B tidak melihat CSV user A (header only)',
    otherCsv === 'date,type,category,wallet,amount,currency,note',
    JSON.stringify(otherCsv).slice(0, 120),
  );

  // -------------------------------------------------------------------------
  section('anon denial (401)');
  const anon = createClient(SUPABASE_URL, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonExport = await anon.functions.invoke('export-csv', { method: 'POST' });
  check('anon export-csv ditolak', Boolean(anonExport.error), 'tidak ada error?!');
  const anonDelete = await anon.functions.invoke('delete-account', { method: 'POST' });
  check('anon delete-account ditolak', Boolean(anonDelete.error), 'tidak ada error?!');

  // -------------------------------------------------------------------------
  section('avatar + budget disiapkan sebelum hapus');
  const avatarPath = `${userId}/avatar.png`;
  const upload = await supabase.storage
    .from('avatars')
    .upload(avatarPath, new Blob([PNG_1PX], { type: 'image/png' }), {
      contentType: 'image/png',
    });
  check('avatar ter-upload', !upload.error, upload.error?.message);

  const cm = await supabase.rpc('current_month', { tz: 'Asia/Jakarta' });
  const month = cm.data;
  const budget = await supabase.from('budgets').upsert(
    { user_id: userId, category_id: food.id, month, amount_limit: 500_000 },
    { onConflict: 'user_id,category_id,month' },
  );
  check('budget tersimpan', !budget.error, budget.error?.message);
  const alert = await supabase.from('budget_alerts').upsert(
    { user_id: userId, category_id: food.id, month, threshold: 'warning_80' },
    { onConflict: 'user_id,category_id,month,threshold', ignoreDuplicates: true },
  );
  check('alert tersimpan', !alert.error, alert.error?.message);

  // -------------------------------------------------------------------------
  section('delete-account (AC #2, #5)');
  const deleted = await supabase.functions.invoke('delete-account', { method: 'POST' });
  check('delete-account sukses', !deleted.error, deleted.error?.message);
  check(
    'respons deleted=true',
    deleted.data?.deleted === true,
    JSON.stringify(deleted.data),
  );

  const loginAgain = await supabase.auth.signInWithPassword({ email, password });
  check('login kredensial lama gagal', Boolean(loginAgain.error), 'masih bisa login?!');

  const tables = [
    ['profiles', 'id', userId],
    ['wallets', 'user_id', userId],
    ['categories', 'user_id', userId],
    ['transactions', 'user_id', userId],
    ['budgets', 'user_id', userId],
    ['budget_alerts', 'user_id', userId],
  ];
  for (const [table, column, value] of tables) {
    const { data, error } = await admin.from(table).select('id').eq(column, value);
    check(
      `tidak ada baris tersisa di ${table}`,
      !error && data?.length === 0,
      error?.message ?? `masih ada ${data?.length} baris`,
    );
  }

  const goneUser = await admin.auth.admin.getUserById(userId);
  check(
    'auth user terhapus',
    Boolean(goneUser.error) || !goneUser.data?.user,
    'user masih ada?!',
  );

  const { data: leftoverObjects } = await admin.storage.from('avatars').list(userId);
  check(
    'avatar terhapus dari storage',
    (leftoverObjects ?? []).length === 0,
    `${(leftoverObjects ?? []).length} objek tersisa`,
  );

  // -------------------------------------------------------------------------
  section('service role key tidak ada di client (AC #4)');
  function walk(dir) {
    let files = [];
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) files = files.concat(walk(full));
      else if (/\.(ts|tsx)$/.test(entry)) files.push(full);
    }
    return files;
  }
  const clientFiles = [...walk('src'), ...walk('app')];
  const leaked = clientFiles.filter((file) => {
    const content = readFileSync(file, 'utf8');
    return /service_role|SERVICE_ROLE/i.test(content);
  });
  check(
    'tidak ada service_role di src/ + app/',
    leaked.length === 0,
    leaked.join(', '),
  );

  // -------------------------------------------------------------------------
  section('cleanup');
  const { error: deleteOtherError } = await admin.auth.admin.deleteUser(otherUserId);
  check('hapus user uji B', !deleteOtherError, deleteOtherError?.message);

  for (const probeEmail of [email, otherEmail]) {
    const { data } = await admin.auth.admin.listUsers();
    const residue = (data?.users ?? []).filter((u) => u.email === probeEmail);
    check(`0 residu ${probeEmail.split('@')[0]}`, residue.length === 0);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nverification crashed:', error);
  process.exit(1);
});
