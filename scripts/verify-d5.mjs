/**
 * D5 live verification — abuse guard Edge Functions (issue #54).
 *
 * Flow: provision A (Admin API, pola V0) → seed-user normal lolos (client
 * path `functions.invoke`) → flood seed-user 12x: 10 lolos + 2 ditolak 429
 * (status + header Retry-After + body rate_limited persis) → export-csv
 * normal lolos → flood export-csv 7x: 5 lolos + 2 ditolak 429 → user B
 * (isolasi: bucket A penuh tidak memengaruhi B) → anon tanpa JWT tetap 401
 * (bukan 429) → delete-account A sukses 200 → panggil lagi dengan JWT mati
 * tetap 401 `invalid_token` (auth dicek SEBELUM rate check) → cleanup B via
 * admin + 0 residu + baris rate-limit uji dibersihkan.
 *
 * Run from the repo root:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/verify-d5.mjs
 * (key needed for provisioning + cleanup; fetch it via the Management API
 * api-keys endpoint — never commit it. Unset sesudahnya.)
 *
 * Cleanup: user A dihapus oleh delete-account yang sedang diuji; user B
 * dihapus di akhir via admin. Verifikasi 0 residu setelahnya:
 *   delete from auth.users where email like 'd5-verify-%' or email like 'd5-other-%';
 */
import { createClient } from '@supabase/supabase-js';

import { provisionTestUser } from './lib/admin-confirm.mjs';
import { readAnonKey } from './lib/keys.mjs';

const SUPABASE_URL = 'https://bklriyyuglwiqczgbqgq.supabase.co';

const anonKey = readAnonKey();

const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
if (!SUPABASE_SERVICE_ROLE) {
  throw new Error(
    'SUPABASE_SERVICE_ROLE_KEY harus di-set (provisi akun uji via Admin API + cleanup)',
  );
}

const stamp = Date.now();
const email = `d5-verify-${stamp}@cashtrix.test`;
const otherEmail = `d5-other-${stamp}@cashtrix.test`;
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
const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Raw fetch ke function: assertions presisi atas status + header + body. */
async function callFunction(name, accessToken) {
  const headers = { apikey: anonKey };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers,
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, retryAfter: res.headers.get('retry-after'), body };
}

function isRateLimited(result, name, limit) {
  return (
    result.status === 429 &&
    result.body?.error === 'rate_limited' &&
    result.body?.function === name &&
    result.body?.limit === limit &&
    result.body?.window_seconds === 60 &&
    Number(result.body?.retry_after_seconds) >= 1 &&
    Number(result.body?.retry_after_seconds) <= 60 &&
    String(result.body?.retry_after_seconds) === String(result.retryAfter)
  );
}

async function main() {
  // -------------------------------------------------------------------------
  section('auth + seed-user normal (client path)');
  const userId = await provisionTestUser(admin, supabase, {
    email,
    password,
    check,
    tag: 'user uji',
  });

  const seed = await supabase.functions.invoke('seed-user', { method: 'POST' });
  check('seed-user via client lolos', !seed.error, seed.error?.message);

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? '';
  check('sesi A tersedia untuk raw fetch', Boolean(token));

  // -------------------------------------------------------------------------
  section('flood seed-user: 10 lolos + 2 ditolak 429');
  // 1 hit (client) sudah terpakai → 9 lolos + 2 ditolak dari 11 raw call.
  let okCount = 0;
  let limitedCount = 0;
  let shapeOk = true;
  for (let i = 0; i < 11; i += 1) {
    const r = await callFunction('seed-user', token);
    if (r.status === 200) okCount += 1;
    else if (isRateLimited(r, 'seed-user', 10)) limitedCount += 1;
    else {
      shapeOk = false;
      console.log(`    unexpected seed-user #${i + 2}:`, r.status, JSON.stringify(r.body));
    }
  }
  check('9 seed-user berikutnya lolos', okCount === 9, `got ${okCount}`);
  check('2 seed-user terakhir ditolak 429 ber-body rate_limited', limitedCount === 2, `got ${limitedCount}`);
  check('tidak ada respons aneh saat flood seed-user', shapeOk);

  // -------------------------------------------------------------------------
  section('export-csv normal + flood: 5 lolos + 2 ditolak 429');
  const exported = await supabase.functions.invoke('export-csv', { method: 'POST' });
  check('export-csv via client lolos', !exported.error, exported.error?.message);

  // Catatan: export-csv menjawab text/csv — `res.json()` gagal → body null
  // untuk yang lolos (bedakan via status saja); yang ditolak menjawab JSON
  // sehingga `isRateLimited` bisa memvalidasi body penuh.
  let csvOk = 0;
  let csvLimited = 0;
  let csvShapeOk = true;
  for (let i = 0; i < 6; i += 1) {
    const r = await callFunction('export-csv', token);
    if (r.status === 200) csvOk += 1;
    else if (isRateLimited(r, 'export-csv', 5)) csvLimited += 1;
    else {
      csvShapeOk = false;
      console.log(`    unexpected export-csv #${i + 2}:`, r.status, JSON.stringify(r.body)?.slice(0, 160));
    }
  }
  check('4 export-csv berikutnya lolos (200)', csvOk === 4, `got ${csvOk}`);
  check('2 export-csv terakhir ditolak 429', csvLimited === 2, `got ${csvLimited}`);
  check('tidak ada respons aneh saat flood export-csv', csvShapeOk);

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

  const bSeed = await other.functions.invoke('seed-user', { method: 'POST' });
  check('user B seed-user lolos walau bucket A penuh', !bSeed.error, bSeed.error?.message);

  const bExport = await callFunction('export-csv', otherToken);
  check(
    'user B export-csv lolos + body 429 tak muncul di jalur normal',
    bExport.status === 200,
    `got ${bExport.status}`,
  );

  // B membuktikan bentuk penuh satu penolakan export-csv (limit 5: 1 sudah
  // terpakai di atas → 4 lolos + 1 ditolak dari 5 raw call).
  let bLimitedBody = null;
  for (let i = 0; i < 5; i += 1) {
    const r = await callFunction('export-csv', otherToken);
    if (r.status === 429) bLimitedBody = r;
  }
  check(
    'body 429 export-csv lengkap (function/limit/window/retry + header)',
    bLimitedBody !== null && isRateLimited(bLimitedBody, 'export-csv', 5),
    JSON.stringify(bLimitedBody?.body),
  );

  // -------------------------------------------------------------------------
  section('anon tetap 401 (bukan 429)');
  const anonSeed = await callFunction('seed-user', null);
  check(
    'anon seed-user 401 missing_authorization',
    anonSeed.status === 401 && anonSeed.body?.error === 'missing_authorization',
    `${anonSeed.status} ${JSON.stringify(anonSeed.body)}`,
  );
  const anonExport = await callFunction('export-csv', null);
  check('anon export-csv 401', anonExport.status === 401, `got ${anonExport.status}`);
  const anonDelete = await callFunction('delete-account', null);
  check('anon delete-account 401', anonDelete.status === 401, `got ${anonDelete.status}`);

  // -------------------------------------------------------------------------
  section('delete-account normal + JWT mati tetap 401 (auth sebelum rate)');
  const deleted = await supabase.functions.invoke('delete-account', { method: 'POST' });
  check('delete-account A sukses', !deleted.error, deleted.error?.message);

  const deadCall = await callFunction('delete-account', token);
  check(
    'JWT mati → 401 invalid_token (bukan 429/500)',
    deadCall.status === 401 && deadCall.body?.error === 'invalid_token',
    `${deadCall.status} ${JSON.stringify(deadCall.body)}`,
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

  // Baris rate-limit uji hanya berisi user_id acak — bersihkan agar tabel
  // operasional tidak menumpuk sampah verifikasi.
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
