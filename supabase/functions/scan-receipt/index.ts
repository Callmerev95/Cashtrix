/**
 * Edge Function `scan-receipt` (S3, issue #57 — OCR server eksperimen).
 *
 * Pipeline (pola D5): JWT dulu → `enforceRateLimit` (~5/mnt/user, 429
 * ber-body + `Retry-After`) → seam kuota (kini pass-through, roadmap §6.7)
 * → baca objek via service role → OCR → respons prefill. Tanpa menyimpan
 * transaksi. Gagal OCR / objek hilang = `200 { ok: false }` — form lanjut
 * manual (fail-open untuk UX, bukan untuk auth: tanpa JWT tetap 401 sebelum
 * rate check, tanpa jejak IP).
 *
 * Transport = referensi `storage_path` (keputusan S3): tanpa base64 di body,
 * tanpa file sementara — "hapus temp" story 15 vacuously terpenuhi karena
 * satu-satunya file adalah lampiran 30 hari milik user (retensi S2).
 * Kepemilikan ditegakkan via prefix path `{userId}/` (pola avatar T8);
 * path asing → 404 tanpa oracle.
 *
 * S3 = mock-first: `MockScanProvider` (lihat `ocr.ts`). `console.error` di
 * sini hanya mencatat kode (tidak pernah amount/merchant/teks — PRD §4.4;
 * `scrubValue` tidak mengenal base64 sehingga larangan ini manual).
 */
import { createClient } from '@supabase/supabase-js';

import { enforceRateLimit } from '../_shared/rate-limit.ts';
import { MOCK_CONFIDENCE, MockScanProvider } from './ocr.ts';
import { parseReceiptText } from './parse.ts';

/** Quota seam (roadmap §6.7): pass-through sampai trek penagihan tiba.
 * Bentuk beku — kuota habis kelak = 402 `{ error: 'quota_exceeded' }`
 * (beda dari `{ ok: false }` gagal OCR) agar klien menampilkan paywall,
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
  if (!supabaseUrl || !serviceRoleKey) {
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
  const ocr = await new MockScanProvider().recognize(bytes, mime);
  if (!ocr.ok) {
    return json({ ok: false }, 200);
  }

  const prefill = parseReceiptText(ocr.text);
  if (!prefill) {
    return json({ ok: false }, 200);
  }

  return json(
    {
      ok: true,
      amount: prefill.amount,
      occurred_on: prefill.occurredOn,
      merchant: prefill.merchant,
      category_suggestion: prefill.categoryHint,
      confidence: MOCK_CONFIDENCE,
    },
    200,
  );
});
