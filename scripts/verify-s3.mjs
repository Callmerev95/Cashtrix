/**
 * S3 live verification — `scan-receipt` Edge Function (issue #57, mock-first).
 *
 * Flow: provision A (Admin API, pola V0) → seed-user → upload objek +
 * baris yatim (Opsi A, pola S2) → prefill happy (`ok:true`, amount 55000 /
 * STARBUCKS / Makanan / confidence <0.5) → prefix asing 404 + objek hilang
 * `{ok:false}` + anon 401 + JWT-mati 401 (auth sebelum rate) → parkir window
 * → flood 7x: 5 lolos + 2 ditolak 429 ber-body → user B (isolasi) → objek
 * yatim Storage disapu dulu (pola S2: cascade DB tidak menghapus objek) →
 * cleanup + 0 residu + baris rate-limit uji dibersihkan.
 *
 * Run from the repo root:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/verify-s3.mjs
 * (key needed for provisioning + cleanup; fetch it via the Management API
 * api-keys endpoint — never commit it. Unset sesudahnya.)
 *
 * Cleanup: user A+B dihapus via admin di akhir (cascade); otherwise manually:
 *   delete from auth.users where email like 's3-verify-%' or email like 's3-other-%';
 */
import { createClient } from '@supabase/supabase-js';

import { provisionTestUser, requireAdminClient } from './lib/admin-confirm.mjs';
import { readAnonKey } from './lib/keys.mjs';

const SUPABASE_URL = 'https://bklriyyuglwiqczgbqgq.supabase.co';

const anonKey = readAnonKey();

const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const stamp = Date.now();
const email = `s3-verify-${stamp}@cashtrix.test`;
const otherEmail = `s3-other-${stamp}@cashtrix.test`;
const password = 'Cashtrix123';

/** 1x1 PNG — isi piksel tak penting: provider S3 masih mock deterministik. */
const TINY_PNG = Uint8Array.from(
  atob(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  ),
  (c) => c.charCodeAt(0),
);

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

/**
 * Fixed window 60s sejajar epoch (pelajaran D5): parkir sampai awal window
 * supaya provisioning + ±7 call flood muat satu window dan asersi 429
 * deterministik.
 */
async function awaitFreshRateWindow(roomSeconds = 45) {
  const targetMod = 60 - roomSeconds;
  const mod = Math.floor(Date.now() / 1000) % 60;
  if (mod > targetMod) {
    await new Promise((resolve) => setTimeout(resolve, (60 - mod + 1) * 1000));
  }
}

const supabase = createClient(SUPABASE_URL, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const other = createClient(SUPABASE_URL, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const admin = requireAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

/** Raw fetch ke function: assertions presisi atas status + header + body. */
async function callScan(accessToken, payload, method = 'POST') {
  const headers = { apikey: anonKey, 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/scan-receipt`, {
    method,
    headers,
    body: method === 'POST' ? JSON.stringify(payload) : undefined,
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, retryAfter: res.headers.get('retry-after'), body };
}

function isRateLimited(result) {
  return (
    result.status === 429 &&
    result.body?.error === 'rate_limited' &&
    result.body?.function === 'scan-receipt' &&
    result.body?.limit === 5 &&
    result.body?.window_seconds === 60 &&
    Number(result.body?.retry_after_seconds) >= 1 &&
    Number(result.body?.retry_after_seconds) <= 60 &&
    String(result.body?.retry_after_seconds) === String(result.retryAfter)
  );
}

/** Upload Opsi A: objek via Storage API + baris yatim via RLS klien. */
async function uploadReceiptAs(client, userId, tag) {
  const path = `${userId}/s3-${tag}-${stamp}.png`;
  const { error: uploadError } = await client.storage
    .from('receipts')
    .upload(path, new Blob([TINY_PNG], { type: 'image/png' }), {
      contentType: 'image/png',
    });
  check(`objek ${tag} terupload`, !uploadError, uploadError?.message);
  const { error: rowError } = await client
    .from('transaction_receipts')
    .insert({ user_id: userId, transaction_id: null, storage_path: path });
  check(`baris yatim ${tag} tercatat`, !rowError, rowError?.message);
  return path;
}

async function main() {
  // -------------------------------------------------------------------------
  section('auth + seed + lampiran');
  const userId = await provisionTestUser(admin, supabase, {
    email,
    password,
    check,
    tag: 'user uji',
  });

  const seed = await supabase.functions.invoke('seed-user', { method: 'POST' });
  check('seed-user sukses', !seed.error, seed.error?.message);

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? '';
  check('sesi A tersedia untuk raw fetch', Boolean(token));

  const path = await uploadReceiptAs(supabase, userId, 'a');

  // -------------------------------------------------------------------------
  section('prefill happy (mock deterministik)');
  const happy = await callScan(token, { storage_path: path });
  check('scan 200 ok:true', happy.status === 200 && happy.body?.ok === true,
    `${happy.status} ${JSON.stringify(happy.body)}`);
  check('amount 55000 (TOTAL, bukan TUNAI 60000)', happy.body?.amount === 55000,
    JSON.stringify(happy.body));
  check('merchant STARBUCKS', happy.body?.merchant === 'STARBUCKS',
    JSON.stringify(happy.body));
  check('saran kategori Makanan', happy.body?.category_suggestion === 'Makanan',
    JSON.stringify(happy.body));
  check('occurred_on 2026-09-12', happy.body?.occurred_on === '2026-09-12',
    JSON.stringify(happy.body));
  check(
    'confidence jujur (<0.5)',
    typeof happy.body?.confidence === 'number' && happy.body.confidence < 0.5,
    JSON.stringify(happy.body),
  );

  // Transport storage-path: tanpa file sementara — prefix user hanya berisi
  // lampiran sendiri (story 15 vacuously terpenuhi oleh desain).
  const { data: listed } = await supabase.storage.from('receipts').list(userId);
  check(
    'tanpa objek temp (hanya lampiran)',
    (listed ?? []).length === 1 && listed[0].name.endsWith('.png'),
    JSON.stringify((listed ?? []).map((o) => o.name)),
  );

  // -------------------------------------------------------------------------
  section('jalur error: 404 asing, ok:false hilang, 405, 401');
  const foreign2 = await callScan(token, { storage_path: '00000000-0000-0000-0000-000000000000/s3-x.png' });
  check(
    'prefix asing → 404 receipt_not_found (tanpa oracle)',
    foreign2.status === 404 && foreign2.body?.error === 'receipt_not_found',
    `${foreign2.status} ${JSON.stringify(foreign2.body)}`,
  );
  const missing = await callScan(token, { storage_path: `${userId}/s3-tidak-ada.png` });
  check(
    'objek hilang → 200 { ok:false } (lanjut manual)',
    missing.status === 200 && missing.body?.ok === false,
    `${missing.status} ${JSON.stringify(missing.body)}`,
  );
  const badBody = await callScan(token, {});
  check('body kosong → 404', badBody.status === 404, `got ${badBody.status}`);
  const getMethod = await callScan(token, { storage_path: path }, 'GET');
  check('GET → 405', getMethod.status === 405, `got ${getMethod.status}`);

  const anon = await callScan(null, { storage_path: path });
  check(
    'anon tanpa JWT → 401 (bukan 429)',
    anon.status === 401 && anon.body?.error === 'missing_authorization',
    `${anon.status} ${JSON.stringify(anon.body)}`,
  );

  // -------------------------------------------------------------------------
  section('flood: 5 lolos + 2 ditolak 429 ber-body');
  await awaitFreshRateWindow();
  let okCount = 0;
  let limitedCount = 0;
  let shapeOk = true;
  for (let i = 0; i < 7; i += 1) {
    const r = await callScan(token, { storage_path: path });
    if (r.status === 200 && r.body?.ok === true) okCount += 1;
    else if (isRateLimited(r)) limitedCount += 1;
    else {
      shapeOk = false;
      console.log(`    unexpected scan #${i + 1}:`, r.status, JSON.stringify(r.body));
    }
  }
  check('5 scan lolos', okCount === 5, `got ${okCount}`);
  check('2 scan terakhir ditolak 429', limitedCount === 2, `got ${limitedCount}`);
  check('tidak ada respons aneh saat flood', shapeOk);

  // -------------------------------------------------------------------------
  section('isolasi antar-user (bucket A penuh, B segar)');
  const otherUserId = await provisionTestUser(admin, other, {
    email: otherEmail,
    password,
    check,
    tag: 'user lain',
  });
  const { data: otherSession } = await other.auth.getSession();
  const otherToken = otherSession.session?.access_token ?? '';
  const otherPath = await uploadReceiptAs(other, otherUserId, 'b');
  const bScan = await callScan(otherToken, { storage_path: otherPath });
  check(
    'user B scan lolos walau bucket A penuh',
    bScan.status === 200 && bScan.body?.ok === true,
    `${bScan.status} ${JSON.stringify(bScan.body)}`,
  );

  // JWT mati → 401 invalid_token (auth dicek SEBELUM rate check).
  const { error: signOutError } = await supabase.auth.signOut();
  check('sign-out A mematikan JWT', !signOutError, signOutError?.message);
  const deadCall = await callScan(token, { storage_path: path });
  check(
    'JWT mati → 401 invalid_token (bukan 429/500)',
    deadCall.status === 401 && deadCall.body?.error === 'invalid_token',
    `${deadCall.status} ${JSON.stringify(deadCall.body)}`,
  );

  // -------------------------------------------------------------------------
  section('cleanup');
  // Pola S2: cascade DB tidak menghapus objek — sapu objek yatim dulu.
  for (const p of [path, otherPath]) {
    const { error: removeError } = await admin.storage.from('receipts').remove([p]);
    check(`objek ${p.split('/')[1]} disapu`, !removeError, removeError?.message);
  }
  for (const uid of [userId, otherUserId]) {
    const { error: deleteError } = await admin.auth.admin.deleteUser(uid);
    check(`hapus user uji ${uid.slice(0, 8)}`, !deleteError, deleteError?.message);
  }

  for (const probeEmail of [email, otherEmail]) {
    const { data } = await admin.auth.admin.listUsers();
    const residue = (data?.users ?? []).filter((u) => u.email === probeEmail);
    check(`0 residu ${probeEmail.split('@')[0]}`, residue.length === 0);
  }

  const { error: rateCleanupError } = await admin
    .from('function_rate_limits')
    .delete()
    .in('bucket_key', [userId, otherUserId]);
  check('baris rate-limit uji dibersihkan', !rateCleanupError, rateCleanupError?.message);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nverification crashed:', error);
  process.exit(1);
});
