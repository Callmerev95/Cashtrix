/**
 * L1 live verification: `insight-summary` Edge Function (Analytics Overhaul).
 *
 * Flow: provision A (Admin API, pola V0) -> seed-user -> 2 model probes
 * (ID + EN deterministic lines return ok:true, same line count, every
 * figure verbatim) -> body kosong 400 + GET 405 + anon 401 + JWT-mati 401
 * (auth sebelum rate) -> parkir window + reset counter eksplisit (pola
 * S3/D5) -> flood 7x TANPA model (payload 400: 5 lolos + 2 ditolak 429
 * ber-body) -> user B isolasi -> cleanup + 0 residu + baris rate-limit uji
 * dibersihkan.
 *
 * Pacing Rp 0 (AI1): key AI Studio free-tier dibatasi 15 RPM — request
 * pemakai-model sekuensial berjarak 5 detik (`pace()`), tanpa paralel.
 * Satu full run ≈ 4 panggilan model; jangan bakar probe manual di hari
 * yang sama.
 *
 * Run from the repo root:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/verify-insight.mjs
 * (key needed for provisioning + cleanup; fetch it via the Management API
 * api-keys endpoint, never commit it. Unset sesudahnya. Hosted juga butuh
 * secret GEMINI_API_KEY pada function, kalau belum ada happy path menjawab
 * 500 server_misconfigured dan script gagal dengan pesan yang jelas.
 * Deploy dulu: npx supabase functions deploy insight-summary --use-api.)
 *
 * Cleanup: user A+B dihapus via admin di akhir (cascade); otherwise manually:
 *   delete from auth.users where email like 'in-verify-%' or email like 'in-other-%';
 */
import { createClient } from '@supabase/supabase-js';

import { provisionTestUser, requireAdminClient } from './lib/admin-confirm.mjs';
import { readAnonKey } from './lib/keys.mjs';

const SUPABASE_URL = 'https://bklriyyuglwiqczgbqgq.supabase.co';

const anonKey = readAnonKey();

const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const stamp = Date.now();
const email = `in-verify-${stamp}@cashtrix.test`;
const otherEmail = `in-other-${stamp}@cashtrix.test`;
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
async function callInsight(accessToken, payload, method = 'POST') {
  const headers = { apikey: anonKey, 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  const res = await fetch(`${SUPABASE_URL}/functions/v1/insight-summary`, {
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
    result.body?.function === 'insight-summary' &&
    result.body?.limit === 5 &&
    result.body?.window_seconds === 60 &&
    Number(result.body?.retry_after_seconds) >= 1 &&
    Number(result.body?.retry_after_seconds) <= 60 &&
    String(result.body?.retry_after_seconds) === String(result.retryAfter)
  );
}

function figuresOf(lines) {
  const seen = new Set();
  for (const line of lines) {
    for (const token of String(line).match(/[\d][\d.,]*%?/g) ?? []) {
      const clean = token.replace(/[.,]+$/, '');
      if (clean !== '' && /\d/.test(clean)) seen.add(clean);
    }
  }
  return [...seen];
}

/** ok:true + jumlah baris sama + setiap angka input kembali verbatim. */
function isStrictRephrase(body, inputLines) {
  if (!body || body.ok !== true) return false;
  if (!Array.isArray(body.lines) || body.lines.length !== inputLines.length) {
    return false;
  }
  const joined = body.lines.join('\n');
  if (typeof joined !== 'string') return false;
  for (const line of body.lines) {
    if (typeof line !== 'string' || line.trim() === '' || line.length > 280) {
      return false;
    }
  }
  return figuresOf(inputLines).every((figure) => joined.includes(figure));
}

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

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token ?? '';
  check('sesi A tersedia untuk raw fetch', Boolean(token));

  // -------------------------------------------------------------------------
  section('probes: parafrasa valid, angka verbatim');
  const probes = [
    {
      lines: [
        'Pengeluaran Oktober naik 12,5% vs September.',
        'Makanan mendominasi: 55% dari pengeluaran.',
        'Pemasukan menutup pengeluaran, sisa Rp 250.000.',
      ],
      lang: 'id',
      label: 'ID 3 baris',
    },
    {
      lines: ['Spending in October is up 10% vs September.'],
      lang: 'en',
      label: 'EN 1 baris',
    },
  ];
  for (const probe of probes) {
    await pace();
    const r = await callInsight(token, {
      lines: probe.lines,
      lang: probe.lang,
    });
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
      `probe ${probe.label} baris sama + angka verbatim`,
      isStrictRephrase(r.body, probe.lines),
      JSON.stringify(r.body),
    );
  }

  // -------------------------------------------------------------------------
  section('jalur error');
  {
    const { error: errResetError } = await admin
      .from('function_rate_limits')
      .delete()
      .eq('function_name', 'insight-summary')
      .eq('bucket_key', userId);
    check('counter di-reset sebelum jalur error', !errResetError, errResetError?.message);
  }

  const empty = await callInsight(token, {});
  check('body kosong jadi 400', empty.status === 400, `got ${empty.status}`);
  const blank = await callInsight(token, { lines: ['   '], lang: 'id' });
  check('baris kosong jadi 400', blank.status === 400, `got ${blank.status}`);
  const tooMany = await callInsight(token, {
    lines: ['a', 'b', 'c', 'd'],
    lang: 'id',
  });
  check('4 baris jadi 400', tooMany.status === 400, `got ${tooMany.status}`);
  const getMethod = await callInsight(token, { lines: ['a'] }, 'GET');
  check('GET jadi 405', getMethod.status === 405, `got ${getMethod.status}`);

  const anon = await callInsight(null, { lines: ['a'] });
  check(
    'anon tanpa JWT jadi 401 (bukan 429)',
    anon.status === 401 && anon.body?.error === 'missing_authorization',
    `${anon.status} ${JSON.stringify(anon.body)}`,
  );

  // -------------------------------------------------------------------------
  section('flood: 5 lolos + 2 ditolak 429 ber-body');
  await awaitFreshRateWindow();
  // Rp 0 (AI1): flood memakai payload `{}` (400 bad_request), BUKAN
  // baris model. Rate check berjalan SETELAH auth tapi SEBELUM validasi
  // body, jadi counter OUR terbukti tanpa membakar kuota Google.
  const { error: floodResetError } = await admin
    .from('function_rate_limits')
    .delete()
    .eq('function_name', 'insight-summary')
    .eq('bucket_key', userId);
  check('counter rate-limit A di-reset sebelum flood', !floodResetError, floodResetError?.message);
  let emptyCount = 0;
  let limitedCount = 0;
  let shapeOk = true;
  for (let i = 0; i < 7; i += 1) {
    const r = await callInsight(token, {});
    if (r.status === 400) emptyCount += 1;
    else if (isRateLimited(r)) limitedCount += 1;
    else {
      shapeOk = false;
      console.log(`    unexpected insight #${i + 1}:`, r.status, JSON.stringify(r.body));
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
  // Tanpa pace + tanpa model: payload 400 membuktikan B lolos rate check
  // (isolasi bucket) tanpa membakar kuota Google.
  const bCall = await callInsight(otherToken, {});
  check(
    'user B lolos walau bucket A penuh (400 bentuk valid, bukan 429)',
    bCall.status === 400,
    `${bCall.status} ${JSON.stringify(bCall.body)}`,
  );

  const { error: signOutError } = await supabase.auth.signOut();
  check('sign-out A mematikan JWT', !signOutError, signOutError?.message);
  const deadCall = await callInsight(token, { lines: ['a'] });
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
