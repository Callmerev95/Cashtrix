/**
 * AI1 live verification: `parse-voice` Edge Function (issue #90).
 *
 * Flow: provision A (Admin API, pola V0) -> seed-user -> 4 teks acak
 * (sinonim, urutan terbalik, slang goceng, 1,5 juta) kembali JSON strict
 * yang valid -> categoryHint liar tidak pernah mengarang (null atau nama
 * yang dikenal) -> body kosong 400 + GET 405 + anon 401 + JWT-mati 401
 * (auth sebelum rate) -> parkir window + reset counter eksplisit (pola
 * S3/D5: parkir hanya menjamin ruang, bukan counter nol) -> flood 7x
 * TANPA model (payload 400: 5 lolos + 2 ditolak 429 ber-body — counter OUR
 * dibuktikan tanpa kuota Google) -> user B isolasi -> cleanup + 0 residu
 * + baris rate-limit uji dibersihkan.
 *
 * Pacing Rp 0: key AI Studio free-tier 15 RPM — 13 request pemakai-model
 * berjalan sekuensial berjarak 5 detik (`pace()`), tanpa paralel.
 *
 * Run from the repo root:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/verify-ai-voice.mjs
 * (key needed for provisioning + cleanup; fetch it via the Management API
 * api-keys endpoint, never commit it. Unset sesudahnya. Hosted juga butuh
 * secret GEMINI_API_KEY pada function, kalau belum ada happy path menjawab
 * 500 server_misconfigured dan script gagal dengan pesan yang jelas.)
 *
 * Cleanup: user A+B dihapus via admin di akhir (cascade); otherwise manually:
 *   delete from auth.users where email like 'ai-verify-%' or email like 'ai-other-%';
 */
import { createClient } from '@supabase/supabase-js';

import { provisionTestUser, requireAdminClient } from './lib/admin-confirm.mjs';
import { readAnonKey } from './lib/keys.mjs';

const SUPABASE_URL = 'https://bklriyyuglwiqczgbqgq.supabase.co';

const anonKey = readAnonKey();

const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const stamp = Date.now();
const email = `ai-verify-${stamp}@cashtrix.test`;
const otherEmail = `ai-other-${stamp}@cashtrix.test`;
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

/**
 * Fixed window 60s sejajar epoch (pelajaran D5): parkir sampai awal window
 * supaya provisioning + flood 7x muat satu window dan asersi 429
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

/**
 * Pacing Rp 0 (AI1): key AI Studio free-tier dibatasi 15 RPM. Setiap
 * request pemakai-model dipisahkan minimal 5 detik dari request
 * pemakai-model sebelumnya (gap antar START ≈ 12 RPM saat sehat, di bawah
 * 15). Non-model (400/405/anon) tidak di-pace. Flood 7x ≈ 6x5 detik +
 * latensi ≈ 51 detik: muat di window 60 detik asal reset counter persis
 * sebelum flood (lihat bawah); bila melewati batas :00, rerun (pola
 * flake D5/S3 yang mapan).
 */
const MODEL_PACE_MS = 5000;
let lastModelCallAt = 0;
async function pace() {
  const wait = MODEL_PACE_MS - (Date.now() - lastModelCallAt);
  if (wait > 0) {
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
  lastModelCallAt = Date.now();
}

/** Raw fetch ke function: assertions presisi atas status + header + body. */
async function callParse(accessToken, payload, method = 'POST') {
  const headers = { apikey: anonKey, 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/parse-voice`, {
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
    result.body?.function === 'parse-voice' &&
    result.body?.limit === 5 &&
    result.body?.window_seconds === 60 &&
    Number(result.body?.retry_after_seconds) >= 1 &&
    Number(result.body?.retry_after_seconds) <= 60 &&
    String(result.body?.retry_after_seconds) === String(result.retryAfter)
  );
}

function isStrictPrefill(body, allowedNames) {
  if (!body || body.ok !== true) return false;
  if (
    typeof body.amount !== 'number' ||
    !Number.isInteger(body.amount) ||
    body.amount <= 0
  ) {
    return false;
  }
  if (body.kind !== 'income' && body.kind !== 'expense') return false;
  for (const key of ['walletHint', 'categoryHint']) {
    const v = body[key];
    if (v !== null && typeof v !== 'string') return false;
    if (typeof v === 'string' && !allowedNames.has(v.toLowerCase())) {
      return false;
    }
  }
  if (typeof body.note !== 'string' || body.note.length > 200) return false;
  const o = body.occurred_on;
  if (o !== null && (typeof o !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o))) {
    return false;
  }
  return true;
}

async function main() {
  // -------------------------------------------------------------------------
  section('auth + seed + konteks allow-list');
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

  const { data: wallets } = await supabase.from('wallets').select('name');
  const { data: categories } = await supabase
    .from('categories')
    .select('name')
    .is('archived_at', null);
  const allowedNames = new Set(
    [...(wallets ?? []), ...(categories ?? [])].map((r) =>
      String(r.name).toLowerCase(),
    ),
  );
  check('allow-list konteks terbaca', allowedNames.size >= 10, String(allowedNames.size));

  // -------------------------------------------------------------------------
  section('teks acak kembali JSON strict yang valid');
  const probes = [
    { text: 'soto mie 30 ribu pakai cash', label: 'sinonim + nominal digit' },
    { text: 'pakai cash 30 ribu soto mie', label: 'urutan terbalik' },
    { text: 'kopi goceng', label: 'slang goceng', amount: 5000 },
    { text: 'gajian 1,5 juta masuk bank', label: 'desimal juta + income', amount: 1500000 },
  ];
  for (const probe of probes) {
    await pace();
    const r = await callParse(token, { text: probe.text });
    if (r.status === 500 && r.body?.error === 'server_misconfigured') {
      check(
        `probe ${probe.label} (butuh GEMINI_API_KEY di hosted)`,
        false,
        'function menjawab 500 server_misconfigured: set secret GEMINI_API_KEY lalu deploy ulang',
      );
      continue;
    }
    check(
      `probe ${probe.label} 200 ok:true`,
      r.status === 200 && r.body?.ok === true,
      `${r.status} ${JSON.stringify(r.body)}`,
    );
    check(
      `probe ${probe.label} strict + hint dikenal-or-null`,
      isStrictPrefill(r.body, allowedNames),
      JSON.stringify(r.body),
    );
    if (probe.amount !== undefined) {
      check(
        `probe ${probe.label} amount ${probe.amount}`,
        r.body?.amount === probe.amount,
        JSON.stringify(r.body),
      );
    }
  }

  // -------------------------------------------------------------------------
  section('hint liar jadi null + jalur error');
  await pace();
  const wild = await callParse(token, {
    text: 'bayar kripto elon 25 ribu tunai',
  });
  check(
    'categoryHint liar null atau dikenal (tidak mengarang)',
    wild.status !== 200 ||
      wild.body?.ok !== true ||
      wild.body?.categoryHint === null ||
      allowedNames.has(String(wild.body?.categoryHint ?? '').toLowerCase()),
    JSON.stringify(wild.body),
  );

  // Bucket OUR sudah penuh oleh 5 probe di atas (enforce jalan sebelum
  // kerja): reset agar jalur error deterministik (pola flood di bawah).
  {
    const { error: errResetError } = await admin
      .from('function_rate_limits')
      .delete()
      .eq('function_name', 'parse-voice')
      .eq('bucket_key', userId);
    check('counter di-reset sebelum jalur error', !errResetError, errResetError?.message);
  }

  const empty = await callParse(token, {});
  check('body kosong jadi 400', empty.status === 400, `got ${empty.status}`);
  const blank = await callParse(token, { text: '   ' });
  check('teks kosong jadi 400', blank.status === 400, `got ${blank.status}`);
  const getMethod = await callParse(token, { text: 'kopi 12rb' }, 'GET');
  check('GET jadi 405', getMethod.status === 405, `got ${getMethod.status}`);

  const anon = await callParse(null, { text: 'kopi 12rb' });
  check(
    'anon tanpa JWT jadi 401 (bukan 429)',
    anon.status === 401 && anon.body?.error === 'missing_authorization',
    `${anon.status} ${JSON.stringify(anon.body)}`,
  );

  // -------------------------------------------------------------------------
  section('flood: 5 lolos + 2 ditolak 429 ber-body');
  await awaitFreshRateWindow();
  // Parkir hanya menjamin ruang, bukan counter nol: probe di atas sudah
  // mengonsumsi jatah (enforce jalan setelah getUser, sebelum kerja).
  // Reset eksplisit via service-role membuat 5+2 deterministik di window
  // mana pun (pola S3 run 36480651898).
  //
  // Rp 0 (AI1): flood memakai payload `{}` (400 bad_request), BUKAN teks
  // model. Rate check berjalan SETELAH auth tapi SEBELUM validasi body,
  // jadi counter OUR terbukti tanpa membakar kuota Google: 5x400 + 2x429
  // ber-body rate_limited. Keberhasilan model sudah dibuktikan 6x oleh
  // probe + isolasi (ok:true) — mencampur keduanya membuat gate OUR
  // bergantung pada mood kuota Google (pelajaran 2026-10-02: retry
  // malah memperkuat spiral 429).
  const { error: floodResetError } = await admin
    .from('function_rate_limits')
    .delete()
    .eq('function_name', 'parse-voice')
    .eq('bucket_key', userId);
  check('counter rate-limit A di-reset sebelum flood', !floodResetError, floodResetError?.message);
  let emptyCount = 0;
  let limitedCount = 0;
  let shapeOk = true;
  for (let i = 0; i < 7; i += 1) {
    const r = await callParse(token, {});
    if (r.status === 400) emptyCount += 1;
    else if (isRateLimited(r)) limitedCount += 1;
    else {
      shapeOk = false;
      console.log(`    unexpected parse #${i + 1}:`, r.status, JSON.stringify(r.body));
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
  await pace();
  const bParse = await callParse(otherToken, { text: 'kopi 12rb' });
  check(
    'user B parse lolos walau bucket A penuh',
    bParse.status === 200 && bParse.body?.ok === true,
    `${bParse.status} ${JSON.stringify(bParse.body)}`,
  );

  // JWT mati jadi 401 invalid_token (auth dicek sebelum rate check).
  const { error: signOutError } = await supabase.auth.signOut();
  check('sign-out A mematikan JWT', !signOutError, signOutError?.message);
  const deadCall = await callParse(token, { text: 'kopi 12rb' });
  check(
    'JWT mati jadi 401 invalid_token (bukan 429/500)',
    deadCall.status === 401 && deadCall.body?.error === 'invalid_token',
    `${deadCall.status} ${JSON.stringify(deadCall.body)}`,
  );

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
