/**
 * Edge Function `scan-receipt` (S3, issue #57 — OCR server; AI3, issue #92 —
 * Gemini 1-call menggantikan MockScanProvider).
 *
 * Pipeline (pola D5/AI1): JWT dulu → `enforceRateLimit` (~5/mnt/user, 429
 * ber-body + `Retry-After`) → seam kuota (kini pass-through, roadmap §6.7)
 * → baca objek via service role → konteks server (kategori expense visible +
 * timezone) → Gemini primer + 1 fallback (gambar → JSON, satu panggilan,
 * tanpa OCR teks perantara) → validasi strict → respons prefill. Tanpa
 * menyimpan transaksi. Gagal model/validasi = `200 { ok: false }` — form
 * lanjut manual (fail-open untuk UX, bukan untuk auth: tanpa JWT tetap 401
 * sebelum rate check, tanpa jejak IP).
 *
 * Transport = referensi `storage_path` (keputusan S3): tanpa base64 di body,
 * tanpa file sementara — "hapus temp" story 15 vacuously terpenuhi karena
 * satu-satunya file adalah lampiran 30 hari milik user (retensi S2).
 * Kepemilikan ditegakkan via prefix path `{userId}/` (pola avatar T8);
 * path asing → 404 tanpa oracle.
 *
 * `console.error` di sini hanya mencatat kode (tidak pernah amount/merchant/
 * gambar — PRD §4.4).
 */
import { createClient } from '@supabase/supabase-js';

import { enforceRateLimit } from '../_shared/rate-limit.ts';
import {
  fetchGeminiVision,
  GEMINI_FALLBACK_MODEL,
  GEMINI_PRIMARY_MODEL,
} from './gemini.ts';
import { SCAN_CONFIDENCE } from './ocr.ts';
import { buildScanPrompt } from './prompt.ts';
import { parseModelJson, validateAiScanPayload } from './validate.ts';

/** Quota seam (roadmap §6.7): pass-through sampai trek penagihan tiba.
 * Bentuk beku — kuota habis kelak = 402 `{ error: 'quota_exceeded' }`
 * (beda dari `{ ok: false }` gagal baca) agar klien menampilkan paywall,
 * bukan fallback diam-diam. */
async function checkScanQuota(_userId: string): Promise<{ allowed: boolean }> {
  return { allowed: true };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** One transient retry (RPM/5xx smoothing): permanent 4xx fails fast. */
async function callVisionOnce(
  apiKey: string,
  model: string,
  prompt: string,
  image: Uint8Array,
  mime: string,
): Promise<{ text: string | null; status: number }> {
  const first = await fetchGeminiVision(apiKey, model, prompt, image, mime);
  if (first.text !== null) {
    return { text: first.text, status: first.status };
  }
  if (!first.retryable) {
    return { text: null, status: first.status };
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const second = await fetchGeminiVision(apiKey, model, prompt, image, mime);
  return { text: second.text, status: second.status };
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'missing_authorization' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const geminiKey = Deno.env.get('GEMINI_API_KEY');
  if (!supabaseUrl || !serviceRoleKey || !geminiKey) {
    return json({ error: 'server_misconfigured' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(
    authHeader.slice('Bearer '.length),
  );
  if (userError || !userData.user) {
    return json({ error: 'invalid_token' }, 401);
  }
  const userId = userData.user.id;

  // D5 (#54): abuse guard — setelah auth valid, sebelum kerja apa pun.
  const limited = await enforceRateLimit(admin, 'scan-receipt', userId);
  if (limited) return limited;

  // Seam kuota monetisasi (roadmap §6.7) — kini selalu lolos.
  const quota = await checkScanQuota(userId);
  if (!quota.allowed) {
    return json({ error: 'quota_exceeded' }, 402);
  }

  let storagePath: unknown = null;
  try {
    storagePath = (await req.json() as { storage_path?: unknown }).storage_path ?? null;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (typeof storagePath !== 'string' || !storagePath.startsWith(`${userId}/`)) {
    return json({ error: 'receipt_not_found' }, 404);
  }

  const { data: blob, error: downloadError } = await admin.storage
    .from('receipts')
    .download(storagePath);
  if (downloadError || !blob) {
    console.error('scan-receipt download failed', downloadError?.message ?? 'empty');
    return json({ ok: false }, 200);
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const mime = storagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

  // Konteks milik pemanggil (filter eksplisit user_id, pola export-csv):
  // scan expense-only, jadi hanya kategori expense visible (sistem + custom,
  // minus arsip, minus mute) yang boleh keluar sebagai saran. Gagal baca
  // bukan 500: lanjut dengan konteks minimal agar request tetap fail-open
  // ke `{ ok: false }` bila model ikut gagal.
  let timezone = 'Asia/Jakarta';
  let categories: string[] = [];
  try {
    const [profileRes, catsRes, mutesRes] = await Promise.all([
      admin
        .from('profiles')
        .select('timezone')
        .eq('id', userId)
        .maybeSingle(),
      admin
        .from('categories')
        .select('id,name,kind')
        .or(`user_id.eq.${userId},user_id.is.null`)
        .is('archived_at', null),
      admin.from('category_mutes').select('category_id').eq('user_id', userId),
    ]);
    if (
      profileRes.data &&
      typeof (profileRes.data as { timezone?: unknown }).timezone ===
        'string' &&
      ((profileRes.data as { timezone: string }).timezone !== '')
    ) {
      timezone = (profileRes.data as { timezone: string }).timezone;
    }
    const muted = new Set(
      ((mutesRes.data ?? []) as { category_id: string }[]).map(
        (m) => m.category_id,
      ),
    );
    categories = (
      (catsRes.data ?? []) as {
        id: string;
        name: string;
        kind: string;
      }[]
    )
      .filter((c) => !muted.has(c.id))
      .filter((c) => c.kind === 'expense')
      .map((c) => c.name);
  } catch {
    console.error('scan-receipt context failed');
  }

  // AI3: satu panggilan multimodal (gambar → JSON), primer + 1 fallback.
  const prompt = buildScanPrompt({
    categories: categories.map((name) => ({ name })),
    timezone,
  });
  const fallbackModel =
    Deno.env.get('GEMINI_FALLBACK_MODEL') ?? GEMINI_FALLBACK_MODEL;

  let raw: string | null = (
    await callVisionOnce(geminiKey, GEMINI_PRIMARY_MODEL, prompt, bytes, mime)
  ).text;
  if (raw === null && fallbackModel !== GEMINI_PRIMARY_MODEL) {
    raw = (
      await callVisionOnce(geminiKey, fallbackModel, prompt, bytes, mime)
    ).text;
  }
  if (raw === null) {
    console.error('scan-receipt model failed');
    return json({ ok: false }, 200);
  }

  const prefill = validateAiScanPayload(parseModelJson(raw), { categories });
  if (!prefill) {
    return json({ ok: false }, 200);
  }

  return json(
    {
      ok: true,
      amount: prefill.amount,
      occurred_on: prefill.occurred_on,
      merchant: prefill.merchant,
      category_suggestion: prefill.categoryHint,
      confidence: SCAN_CONFIDENCE,
    },
    200,
  );
});
