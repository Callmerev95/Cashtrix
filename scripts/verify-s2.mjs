/**
 * S2 live verification — drives the real anon client against the hosted project
 * and asserts the receipt contract the Add form depends on (Opsi A).
 *
 * Upload-segera: object via Storage API + orphan row (`transaction_id NULL`),
 * then link-on-save (UPDATE), pre-save cancel (object + row), expiry purge
 * (old rows gone, fresh kept), cross-user no-op + FK 23503, anon denial.
 *
 * Run from the repo root:
 *   node scripts/verify-s2.mjs
 *
 * Requires SUPABASE_SERVICE_ROLE_KEY (provisionTestUser pattern, V0).
 * Cleanup: test users deleted at the end (cascade); otherwise manually:
 *   delete from auth.users where email like 's2-verify-%' or email like 's2-other-%';
 */
import { createClient } from '@supabase/supabase-js';
import { readAnonKey } from './lib/keys.mjs';

import { provisionTestUser, requireAdminClient } from './lib/admin-confirm.mjs';

const SUPABASE_URL = 'https://bklriyyuglwiqczgbqgq.supabase.co';

const anonKey = readAnonKey();

const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const stamp = Date.now();
const email = `s2-verify-${stamp}@cashtrix.test`;
const otherEmail = `s2-other-${stamp}@cashtrix.test`;
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

  const { data: wallets } = await supabase.from('wallets').select('id, name');
  const wallet = wallets?.[0];
  check('dompet seed terbaca', Boolean(wallet?.id), JSON.stringify(wallets));

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, kind')
    .is('archived_at', null);
  const food = categories.find((c) => c.kind === 'expense');
  check('kategori expense terbaca', Boolean(food?.id));

  const txRes = await supabase
    .from('transactions')
    .insert({
      user_id: userId,
      wallet_id: wallet.id,
      category_id: food.id,
      type: 'expense',
      amount: 30000,
      occurred_at: new Date(Date.now() - 86400000).toISOString(),
      idempotency_key: crypto.randomUUID(),
    })
    .select('id')
    .single();
  check('transaksi uji tersimpan', !txRes.error && Boolean(txRes.data?.id), txRes.error?.message);
  const txId = txRes.data?.id;

  // -------------------------------------------------------------------------
  section('upload-segera (Opsi A): objek + baris yatim');
  const receiptId = crypto.randomUUID();
  const path = `${userId}/${receiptId}.jpg`;
  const bytes = new Uint8Array(1024).fill(7);
  const up = await supabase.storage
    .from('receipts')
    .upload(path, bytes, { contentType: 'image/jpeg' });
  check('upload objek ke receipts/{userId}/ sukses', !up.error, up.error?.message);

  const orphan = await supabase
    .from('transaction_receipts')
    .insert({ id: receiptId, user_id: userId, transaction_id: null, storage_path: path })
    .select('id, transaction_id')
    .single();
  check(
    'baris yatim pra-save legal (transaction_id NULL)',
    !orphan.error && orphan.data?.transaction_id === null,
    orphan.error?.message ?? JSON.stringify(orphan.data),
  );

  // -------------------------------------------------------------------------
  section('taut saat save');
  const link = await supabase
    .from('transaction_receipts')
    .update({ transaction_id: txId })
    .eq('id', receiptId)
    .eq('user_id', userId)
    .select('id');
  check('taut ke transaksi miliknya (1 baris)', !link.error && link.data?.length === 1, link.error?.message);

  const mine = await supabase.from('transaction_receipts').select('id, transaction_id');
  check('tautan terbaca kembali', mine.data?.some((r) => r.transaction_id === txId) === true, JSON.stringify(mine.data));

  // -------------------------------------------------------------------------
  section('batal pra-save: objek + baris hilang');
  const cancelId = crypto.randomUUID();
  const cancelPath = `${userId}/${cancelId}.jpg`;
  await supabase.storage.from('receipts').upload(cancelPath, bytes, { contentType: 'image/jpeg' });
  await supabase.from('transaction_receipts').insert({
    id: cancelId, user_id: userId, transaction_id: null, storage_path: cancelPath,
  });
  const rmObj = await supabase.storage.from('receipts').remove([cancelPath]);
  check('hapus objek via API sukses', !rmObj.error, rmObj.error?.message);
  const rmRow = await supabase.from('transaction_receipts').delete().eq('id', cancelId).eq('user_id', userId);
  check('hapus baris yatim sukses', !rmRow.error, rmRow.error?.message);
  const gone = await supabase.storage.from('receipts').download(cancelPath);
  check('objek benar hilang (download gagal)', Boolean(gone.error), 'masih bisa diunduh!');

  // -------------------------------------------------------------------------
  section('purge 30 hari');
  const oldPath = `${userId}/${crypto.randomUUID()}.jpg`;
  await supabase.storage.from('receipts').upload(oldPath, bytes, { contentType: 'image/jpeg' });
  const oldRow = await supabase.from('transaction_receipts').insert({
    user_id: userId,
    transaction_id: null,
    storage_path: oldPath,
    created_at: new Date(Date.now() - 31 * 86400000).toISOString(),
  }).select('id').single();
  check('baris tua tersimpan', !oldRow.error, oldRow.error?.message);
  const purge = await supabase.rpc('purge_expired_receipts');
  check('purge >= 1', !purge.error && purge.data >= 1, purge.error?.message ?? String(purge.data));
  const afterPurge = await supabase.from('transaction_receipts').select('id');
  check('baris tua hilang', !afterPurge.data?.some((r) => r.id === oldRow.data?.id), JSON.stringify(afterPurge.data?.map((r) => r.id)));
  check(
    'baris tertaut yang segar bertahan (riwayat aman)',
    afterPurge.data?.some((r) => r.id === receiptId) === true,
    JSON.stringify(afterPurge.data?.map((r) => r.id)),
  );

  // -------------------------------------------------------------------------
  section('isolasi antar-user');
  const otherUserId = await provisionTestUser(admin, other, {
    email: otherEmail,
    password,
    check,
    tag: 'user lain',
  });
  await other.functions.invoke('seed-user', { method: 'POST' });

  const otherRows = await other.from('transaction_receipts').select('id');
  check('user lain melihat 0 lampiran', otherRows.data?.length === 0, String(otherRows.data?.length));

  const foreignLink = await other
    .from('transaction_receipts')
    .update({ transaction_id: txId })
    .eq('id', receiptId);
  check('taut milik orang = no-op sunyi', !foreignLink.error, foreignLink.error?.message);
  const mineAfter = await supabase.from('transaction_receipts').select('transaction_id').eq('id', receiptId).single();
  check('tautan saya tidak tersentuh', mineAfter.data?.transaction_id === txId, JSON.stringify(mineAfter.data));

  const forged = await other.from('transaction_receipts').insert({
    user_id: userId, transaction_id: null, storage_path: `${otherUserId}/palsu.jpg`,
  });
  check('user_id tempaan ditolak', Boolean(forged.error), 'lolos tanpa error!');

  const otherWallets = await other.from('wallets').select('id');
  const otherTx = await other.from('transactions').insert({
    user_id: otherUserId,
    wallet_id: otherWallets.data[0].id,
    category_id: food.id,
    type: 'expense',
    amount: 1000,
    occurred_at: new Date(Date.now() - 86400000).toISOString(),
    idempotency_key: crypto.randomUUID(),
  }).select('id').single();
  const crossLink = await supabase
    .from('transaction_receipts')
    .update({ transaction_id: otherTx.data.id })
    .eq('id', receiptId)
    .eq('user_id', userId);
  check('taut ke transaksi orang lain ditolak FK (23503)', crossLink.error?.code === '23503', crossLink.error?.code ?? 'lolos tanpa error!');

  // -------------------------------------------------------------------------
  section('anon (tanpa login)');
  const anon = createClient(SUPABASE_URL, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonRead = await anon.from('transaction_receipts').select('id');
  check('anon tidak bisa membaca receipts', Boolean(anonRead.error), anonRead.error?.code);
  const anonWrite = await anon.from('transaction_receipts').insert({
    user_id: userId, storage_path: 'x.jpg',
  });
  check('anon tidak bisa menulis receipts', Boolean(anonWrite.error), anonWrite.error?.code);
  const anonBucket = await anon.storage.from('receipts').download(path);
  check('anon tidak bisa mengunduh objek', Boolean(anonBucket.error), 'objek bocor!');

  // -------------------------------------------------------------------------
  section('cleanup');
  // admin.deleteUser men-cascade baris DB, tapi TIDAK objek Storage —
  // sapu sisa objek prefix user uji via service_role (pola sekali pakai).
  const svc = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const id of [userId, otherUserId]) {
    const listed = await svc.storage.from('receipts').list(id);
    const names = listed.data?.map((f) => `${id}/${f.name}`) ?? [];
    if (names.length > 0) {
      const { error } = await svc.storage.from('receipts').remove(names);
      check(`sapu ${names.length} objek yatim ${id.slice(0, 8)}`, !error, error?.message);
    }
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
