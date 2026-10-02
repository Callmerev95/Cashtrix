/**
 * S3/AI3 live verification — `scan-receipt` Edge Function
 * (issue #57 mock-first, issue #92 Gemini 1-call).
 *
 * Flow: provision A (Admin API, pola V0) → seed-user → upload struk
 * sintetis (PNG tulisan 5x7 skala besar, dirender murni tanpa dep agar
 * deterministik di CI) + baris yatim (Opsi A, pola S2) → prefill happy
 * LONGGAR (`ok:true`, amount int >0, merchant string tak-kosong,
 * category_suggestion null-atau-dikenal, occurred_on null-atau-ISO,
 * confidence tepat 0.42) → prefix asing 404 + objek hilang `{ok:false}` +
 * anon 401 + JWT-mati 401 (auth sebelum rate) → parkir window + reset
 * counter eksplisit (pola S3/D5) → flood 7x TANPA model (payload `{}` →
 * 404 receipt_not_found: 5 lolos + 2 ditolak 429 ber-body — counter OUR
 * dibuktikan tanpa kuota Google) → user B (isolasi, 1 scan model) →
 * objek yatim Storage disapu dulu (pola S2: cascade DB tidak menghapus
 * objek) → cleanup + 0 residu + baris rate-limit uji dibersihkan.
 *
 * Pacing Rp 0: hanya happy + isolasi-B yang menyentuh model (2 call),
 * dipisahkan `pace()` 5 detik ala AI1. Flood memakai payload 404 karena
 * rate check berjalan SETELAH auth tapi SEBELUM validasi body/download/
 * model — lihat `index.ts`.
 *
 * Run from the repo root:
 *   SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/verify-s3.mjs
 * (key needed for provisioning + cleanup; fetch it via the Management API
 * api-keys endpoint — never commit it. Unset sesudahnya. Hosted juga butuh
 * secret GEMINI_API_KEY pada function, kalau belum ada happy path menjawab
 * 500 server_misconfigured dan script gagal dengan pesan yang jelas.)
 *
 * Cleanup: user A+B dihapus via admin di akhir (cascade); otherwise manually:
 *   delete from auth.users where email like 's3-verify-%' or email like 's3-other-%';
 */
import { createClient } from '@supabase/supabase-js';
import { Buffer } from 'node:buffer';
import { deflateSync } from 'node:zlib';

import { provisionTestUser, requireAdminClient } from './lib/admin-confirm.mjs';
import { readAnonKey } from './lib/keys.mjs';

const SUPABASE_URL = 'https://bklriyyuglwiqczgbqgq.supabase.co';

const anonKey = readAnonKey();

const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const stamp = Date.now();
const email = `s3-verify-${stamp}@cashtrix.test`;
const otherEmail = `s3-other-${stamp}@cashtrix.test`;
const password = 'Cashtrix123';

// ---------------------------------------------------------------------------
// Struk sintetis: PNG grayscale tulisan blok 5x7 skala besar, dirender murni
// (tanpa dep font/canvas — deterministik di CI ubuntu maupun darwin).
// Empat baris menguji aturan total: baris TOTAL menang atas TUNAI yang lebih
// besar, tanggal format ID, merchant di kop.
// ---------------------------------------------------------------------------
const GLYPHS = {
  ' ': ['.....', '.....', '.....', '.....', '.....', '.....', '.....'],
  '/': ['....#', '....#', '...#.', '...#.', '..#..', '.#...', '#....'],
  0: ['.###.', '#...#', '#..##', '#.#.#', '##..#', '#...#', '.###.'],
  1: ['..#..', '.##..', '..#..', '..#..', '..#..', '..#..', '.###.'],
  2: ['.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'],
  5: ['#####', '#....', '####.', '....#', '....#', '#...#', '.###.'],
  6: ['.###.', '#....', '#....', '####.', '#...#', '#...#', '.###.'],
  9: ['.###.', '#...#', '#...#', '.####', '....#', '....#', '.###.'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
  I: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '#####'],
  J: ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
  K: ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
  L: ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
  M: ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
  N: ['#...#', '##..#', '##..#', '#.#.#', '#..##', '#..##', '#...#'],
  O: ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  U: ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
};

const RECEIPT_LINES = ['TOKO MAJU', 'TOTAL 55000', 'TUNAI 100000', '12/09/26'];

function crc32(bytes) {
  let table = crc32.table;
  if (!table) {
    table = crc32.table = new Int32Array(256);
    for (let n = 0; n < 256; n += 1) {
      let c = n;
      for (let k = 0; k < 8; k += 1) {
        c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      }
      table[n] = c;
    }
  }
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Render baris teks ke PNG grayscale (putih bg, hitam fg). */
function renderReceiptPng(lines, scale = 6) {
  const cols = Math.max(...lines.map((l) => l.length));
  const width = cols * 6 * scale;
  const height = lines.length * 8 * scale + 2 * scale;
  const row = Buffer.alloc(1 + width, 255);
  row[0] = 0;
  const raw = [];
  for (let y = 0; y < height; y += 1) {
    raw.push(Buffer.from(row));
  }
  lines.forEach((line, li) => {
    const y0 = scale + li * 8 * scale;
    for (let ci = 0; ci < line.length; ci += 1) {
      const glyph = GLYPHS[line[ci]];
      if (!glyph) continue;
      for (let gy = 0; gy < 7; gy += 1) {
        for (let gx = 0; gx < 5; gx += 1) {
          if (glyph[gy][gx] !== '#') continue;
          for (let sy = 0; sy < scale; sy += 1) {
            for (let sx = 0; sx < scale; sx += 1) {
              raw[y0 + gy * scale + sy][1 + (ci * 6 + gx) * scale + sx] = 0;
            }
          }
        }
      }
    }
  });
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(Buffer.concat(raw))),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const RECEIPT_PNG = renderReceiptPng(RECEIPT_LINES);

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

/**
 * Pacing Rp 0 (AI1/AI3): hanya happy + isolasi-B yang menyentuh model;
 * keduanya dipisahkan minimal 5 detik (gap antar START ≈ 12 RPM saat sehat,
 * di bawah 15 free-tier). Non-model (404/405/anon/flood) tidak di-pace.
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

/** 404 pra-model: auth + rate check lolos, validasi body menolak. */
function isPassThrough(result) {
  return (
    result.status === 404 && result.body?.error === 'receipt_not_found'
  );
}

/** Kontrak longgar AI3: bentuk strict, nilai toleran terhadap varians model. */
function isLoosePrefill(body, allowedNames) {
  if (!body || body.ok !== true) return false;
  if (
    typeof body.amount !== 'number' ||
    !Number.isInteger(body.amount) ||
    body.amount <= 0 ||
    body.amount > 999999999999
  ) {
    return false;
  }
  if (
    typeof body.merchant !== 'string' ||
    body.merchant.length === 0 ||
    body.merchant.length > 200
  ) {
    return false;
  }
  const hint = body.category_suggestion;
  if (hint !== null && typeof hint !== 'string') return false;
  if (typeof hint === 'string' && !allowedNames.has(hint.toLowerCase())) {
    return false;
  }
  const o = body.occurred_on;
  if (o !== null && (typeof o !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o))) {
    return false;
  }
  return true;
}

/** Upload Opsi A: objek via Storage API + baris yatim via RLS klien. */
async function uploadReceiptAs(client, userId, tag) {
  const path = `${userId}/s3-${tag}-${stamp}.png`;
  const { error: uploadError } = await client.storage
    .from('receipts')
    .upload(path, new Blob([RECEIPT_PNG], { type: 'image/png' }), {
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

  const { data: categories } = await supabase
    .from('categories')
    .select('name')
    .is('archived_at', null);
  const allowedNames = new Set(
    (categories ?? []).map((r) => String(r.name).toLowerCase()),
  );
  check('allow-list kategori terbaca', allowedNames.size >= 10, String(allowedNames.size));

  const path = await uploadReceiptAs(supabase, userId, 'a');

  // -------------------------------------------------------------------------
  section('prefill happy (Gemini 1-call, asersi longgar)');
  await pace();
  const happy = await callScan(token, { storage_path: path });
  if (happy.status === 500 && happy.body?.error === 'server_misconfigured') {
    check(
      'scan live (butuh GEMINI_API_KEY di hosted)',
      false,
      'function menjawab 500 server_misconfigured: set secret GEMINI_API_KEY lalu deploy ulang',
    );
  } else {
    check('scan 200 ok:true', happy.status === 200 && happy.body?.ok === true,
      `${happy.status} ${JSON.stringify(happy.body)}`);
    check(
      'prefill longgar: amount int >0 + merchant + hint dikenal-or-null',
      isLoosePrefill(happy.body, allowedNames),
      JSON.stringify(happy.body),
    );
    check(
      'confidence fixed 0.42 (jujur, tanpa skor karangan)',
      happy.body?.confidence === 0.42,
      JSON.stringify(happy.body),
    );
  }

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
  section('flood Rp0: 5 lolos 404 + 2 ditolak 429 ber-body');
  await awaitFreshRateWindow();
  // Parkir hanya menjamin RUANG (±45 detik), bukan counter NOL: happy +
  // error-path terautentikasi di atas sudah mengonsumsi jatah (enforce jalan
  // setelah getUser, sebelum kerja). Reset eksplisit via service-role membuat
  // 5+2 deterministik di window mana pun (pola S3 run 36480651898).
  //
  // Rp 0 (AI3): flood memakai payload `{}` (404 receipt_not_found), BUKAN
  // storage_path model. Rate check berjalan SETELAH auth tapi SEBELUM
  // validasi body/download/model, jadi counter OUR terbukti tanpa membakar
  // kuota Google: 5x404 + 2x429 ber-body rate_limited. Keberhasilan model
  // sudah dibuktikan happy + isolasi (ok:true) — mencampur keduanya membuat
  // gate OUR bergantung pada mood kuota Google (pelajaran 2026-10-02).
  const { error: floodResetError } = await admin
    .from('function_rate_limits')
    .delete()
    .eq('function_name', 'scan-receipt')
    .eq('bucket_key', userId);
  check('counter rate-limit A di-reset sebelum flood', !floodResetError, floodResetError?.message);
  let okCount = 0;
  let limitedCount = 0;
  let shapeOk = true;
  for (let i = 0; i < 7; i += 1) {
    const r = await callScan(token, {});
    if (isPassThrough(r)) okCount += 1;
    else if (isRateLimited(r)) limitedCount += 1;
    else {
      shapeOk = false;
      console.log(`    unexpected scan #${i + 1}:`, r.status, JSON.stringify(r.body));
    }
  }
  check('5 request lolos rate (404 pra-model)', okCount === 5, `got ${okCount}`);
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
  const otherPath = await uploadReceiptAs(other, otherUserId, 'b');
  await pace();
  const bScan = await callScan(otherToken, { storage_path: otherPath });
  check(
    'user B scan lolos walau bucket A penuh',
    bScan.status === 200 && bScan.body?.ok === true,
    `${bScan.status} ${JSON.stringify(bScan.body)}`,
  );
  check(
    'prefill B longgar + confidence 0.42',
    isLoosePrefill(bScan.body, allowedNames) && bScan.body?.confidence === 0.42,
    JSON.stringify(bScan.body),
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
