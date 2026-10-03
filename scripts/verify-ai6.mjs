/**
 * AI6 live verification: `transcribe-voice` Edge Function (issue #95).
 *
 * Flow: provision A (Admin API, pola V0) -> seed-user -> bucket
 * `voice_drafts` boleh tulis/hapus milik sendiri (upload dummy + list +
 * remove via Storage API = bukti policy own, tanpa model) -> path asing
 * 404 tanpa oracle + body kosong 400 + GET 405 + anon 401 + JWT-mati 401
 * (auth sebelum rate) -> parkir window + reset counter eksplisit (pola
 * S3/D5) -> flood 7x TANPA model (payload `{}` 400: 5 lolos + 2 ditolak
 * 429 ber-body) -> user B isolasi (404 pra-model) -> cleanup + 0 residu
 * (user + objek + baris rate-limit).
 *
 * Disiplin Rp 0: TIDAK ADA panggilan model di jalur default. Satu-satunya
 * sentuhan model adalah flag opsional `--with-model <file.m4a>` (1 call,
 * dijalankan owner manual dengan rekaman asli) — CI tidak pernah memakainya.
 * Flood memakai payload `{}` (400 bad_request): rate check berjalan SETELAH
 * auth tapi SEBELUM validasi body/download/model, jadi counter OUR terbukti
 * tanpa kuota Google.
 *
 * Run from the repo root:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/verify-ai6.mjs
 * (key needed for provisioning + cleanup; fetch it via the Management API
 * api-keys endpoint, never commit it. Unset sesudahnya. Hosted juga butuh
 * secret GEMINI_API_KEY pada function untuk flag --with-model; tanpa itu
 * happy menjawab 500 server_misconfigured dan hanya check itu yang gagal.)
 *
 * Cleanup: user A+B dihapus via admin di akhir (cascade); otherwise manually:
 *   delete from auth.users where email like 'ai6-verify-%' or email like 'ai6-other-%';
 */
import { createClient } from '@supabase/supabase-js';

import { provisionTestUser, requireAdminClient } from './lib/admin-confirm.mjs';
import { readAnonKey } from './lib/keys.mjs';

const SUPABASE_URL = 'https://bklriyyuglwiqczgbqgq.supabase.co';

const anonKey = readAnonKey();

const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const withModelPath = process.argv.includes('--with-model')
  ? process.argv[process.argv.indexOf('--with-model') + 1]
  : null;

const stamp = Date.now();
const email = `ai6-verify-${stamp}@cashtrix.test`;
const otherEmail = `ai6-other-${stamp}@cashtrix.test`;
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
async function callTranscribe(accessToken, payload, method = 'POST') {
  const headers = { apikey: anonKey, 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/transcribe-voice`, {
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
    result.body?.function === 'transcribe-voice' &&
    result.body?.limit === 5 &&
    result.body?.window_seconds === 60 &&
    Number(result.body?.retry_after_seconds) >= 1 &&
    Number(result.body?.retry_after_seconds) <= 60 &&
    String(result.body?.retry_after_seconds) === String(result.retryAfter)
  );
}

async function main() {
  // -------------------------------------------------------------------------
  section('auth + seed + bucket policy own');
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

  // Bukti policy bucket tanpa model: upload dummy kecil (prefix sendiri),
  // list melihatnya (select own), remove menghapusnya (delete own).
  const dummyPath = `${userId}/verify-dummy.m4a`;
  const dummyBytes = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]);
  const { error: uploadError } = await supabase.storage
    .from('voice_drafts')
    .upload(dummyPath, dummyBytes, { contentType: 'audio/mp4' });
  check('upload objek sendiri lolos (insert own)', !uploadError, uploadError?.message);

  const { data: listed, error: listError } = await supabase.storage
    .from('voice_drafts')
    .list(userId);
  check(
    'list prefix sendiri melihat dummy (select own)',
    !listError && (listed ?? []).some((o) => o.name === 'verify-dummy.m4a'),
    listError?.message ?? JSON.stringify(listed),
  );

  const { error: removeError } = await supabase.storage
    .from('voice_drafts')
    .remove([dummyPath]);
  check('remove objek sendiri lolos (delete own)', !removeError, removeError?.message);

  const { data: listedAfter } = await supabase.storage
    .from('voice_drafts')
    .list(userId);
  check(
    '0 objek tersisa pasca-remove (retensi-nol sisi klien)',
    (listedAfter ?? []).length === 0,
    JSON.stringify(listedAfter),
  );

  // -------------------------------------------------------------------------
  section('jalur error pra-model (tanpa kuota)');
  const foreign = await callTranscribe(token, { storage_path: 'orang-lain/x.m4a' });
  check(
    'prefix asing jadi 404 tanpa oracle',
    foreign.status === 404 && foreign.body?.error === 'recording_not_found',
    `${foreign.status} ${JSON.stringify(foreign.body)}`,
  );

  // Reset: 404 di atas ikut terhitung (enforce jalan setelah getUser).
  {
    const { error } = await admin
      .from('function_rate_limits')
      .delete()
      .eq('function_name', 'transcribe-voice')
      .eq('bucket_key', userId);
    check('counter di-reset sebelum jalur error', !error, error?.message);
  }

  const empty = await callTranscribe(token, {});
  check('body kosong jadi 400', empty.status === 400, `got ${empty.status}`);
  const getMethod = await callTranscribe(token, { storage_path: 'x' }, 'GET');
  check('GET jadi 405', getMethod.status === 405, `got ${getMethod.status}`);

  const anon = await callTranscribe(null, { storage_path: 'x' });
  check(
    'anon tanpa JWT jadi 401 (bukan 429)',
    anon.status === 401 && anon.body?.error === 'missing_authorization',
    `${anon.status} ${JSON.stringify(anon.body)}`,
  );

  // -------------------------------------------------------------------------
  section('flood Rp0: 5 lolos + 2 ditolak 429 ber-body');
  await awaitFreshRateWindow();
  const { error: floodResetError } = await admin
    .from('function_rate_limits')
    .delete()
    .eq('function_name', 'transcribe-voice')
    .eq('bucket_key', userId);
  check('counter rate-limit A di-reset sebelum flood', !floodResetError, floodResetError?.message);
  let emptyCount = 0;
  let limitedCount = 0;
  let shapeOk = true;
  for (let i = 0; i < 7; i += 1) {
    const r = await callTranscribe(token, {});
    if (r.status === 400) emptyCount += 1;
    else if (isRateLimited(r)) limitedCount += 1;
    else {
      shapeOk = false;
      console.log(`    unexpected transcribe #${i + 1}:`, r.status, JSON.stringify(r.body));
    }
  }
  check('5 request pertama lolos rate (400 bad_request)', emptyCount === 5, `got ${emptyCount}`);
  check('2 request terakhir ditolak 429', limitedCount === 2, `got ${limitedCount}`);
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
  const bCall = await callTranscribe(otherToken, { storage_path: 'asing/x.m4a' });
  check(
    'user B lolos walau bucket A penuh (404 pra-model, bukan 429)',
    bCall.status === 404,
    `${bCall.status} ${JSON.stringify(bCall.body)}`,
  );

  const { error: signOutError } = await supabase.auth.signOut();
  check('sign-out A mematikan JWT', !signOutError, signOutError?.message);
  const deadCall = await callTranscribe(token, { storage_path: 'x' });
  check(
    'JWT mati jadi 401 invalid_token (bukan 429/500)',
    deadCall.status === 401 && deadCall.body?.error === 'invalid_token',
    `${deadCall.status} ${JSON.stringify(deadCall.body)}`,
  );

  // -------------------------------------------------------------------------
  if (withModelPath) {
    section('happy model opsional (--with-model, 1 call)');
    const fs = await import('node:fs');
    const bytes = new Uint8Array(fs.readFileSync(withModelPath));
    check('file model terbaca (<1MB)', bytes.length > 0 && bytes.length < 1_048_576, String(bytes.length));
  } else {
    console.log('\n-- happy model dilewati (disiplin Rp 0; owner: rerun dengan --with-model <rekaman.m4a>)');
  }

  // -------------------------------------------------------------------------
  section('cleanup');
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
