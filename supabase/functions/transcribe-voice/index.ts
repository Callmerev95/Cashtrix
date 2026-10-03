/**
 * Edge Function `transcribe-voice` (AI6, issue #95 — audio Fase 2).
 *
 * Pipeline (pola D5/AI1/AI3): JWT dulu → `enforceRateLimit`
 * (`transcribe-voice`, ~5/mnt/user, 429 ber-body + `Retry-After`) → seam
 * kuota (pass-through, roadmap §6.7) → baca objek via service role →
 * konteks server (kategori visible + dompet aktif + timezone) → Gemini audio
 * primer + 1 fallback (audio → JSON, satu panggilan) → validasi strict →
 * HAPUS objek via service role SEBELUM return → respons prefill. Tanpa
 * menyimpan transaksi, tanpa tabel, tanpa cron.
 *
 * Retensi nol (ADR-0015): satu-satunya hapus yang benar = Storage API via
 * service role di fungsi ini. Hapus dijalankan untuk SETIAP request yang
 * objeknya berhasil diunduh — sukses transkrip maupun gagal — supaya tidak
 * ada audio biometrik yang tertinggal. Kegagalan hapus dicatat berkode dan
 * tidak menggagalkan respons (best-effort penghapusan, bukan best-effort
 * privasi: path uuid tak-tertebak + bucket privat + RLS prefix userId).
 *
 * Transport = referensi `storage_path` (keputusan S3/AI6): tanpa base64 di
 * body, tanpa file sementara. Kepemilikan via prefix `{userId}/`; path
 * asing → 404 tanpa oracle. Gagal model/validasi = `200 { ok: false }`
 * (fail-open untuk UX, bukan untuk auth: tanpa JWT tetap 401 sebelum rate
 * check).
 *
 * `console.error` di sini hanya mencatat kode (tidak pernah teks/nominal/
 * audio — PRD §4.4).
 */
import { createClient } from '@supabase/supabase-js';

import { enforceRateLimit } from '../_shared/rate-limit.ts';
import {
  fetchGeminiAudio,
  GEMINI_FALLBACK_MODEL,
  GEMINI_PRIMARY_MODEL,
} from './gemini.ts';
import { buildTranscribePrompt } from './prompt.ts';
import { parseModelJson, validateAiVoicePayload } from './validate.ts';

/** Quota seam (roadmap §6.7): pass-through sampai trek penagihan tiba.
 * Bentuk beku — kuota habis kelak = 402 `{ error: 'quota_exceeded' }`
 * agar klien menampilkan paywall, bukan fallback diam-diam. */
async function checkTranscribeQuota(
  _userId: string,
): Promise<{ allowed: boolean }> {
  return { allowed: true };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** One transient retry (RPM/5xx smoothing): permanent 4xx fails fast. */
async function callAudioOnce(
  apiKey: string,
  model: string,
  prompt: string,
  audio: Uint8Array,
  mime: string,
): Promise<{ text: string | null; status: number }> {
  const first = await fetchGeminiAudio(apiKey, model, prompt, audio, mime);
  if (first.text !== null) {
    return { text: first.text, status: first.status };
  }
  if (!first.retryable) {
    return { text: null, status: first.status };
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const second = await fetchGeminiAudio(apiKey, model, prompt, audio, mime);
  return { text: second.text, status: second.status };
}

function audioMime(storagePath: string): string {
  if (storagePath.endsWith('.wav')) return 'audio/wav';
  if (storagePath.endsWith('.mp3')) return 'audio/mpeg';
  if (storagePath.endsWith('.webm')) return 'audio/webm';
  return 'audio/mp4';
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
  const limited = await enforceRateLimit(admin, 'transcribe-voice', userId);
  if (limited) return limited;

  // Seam kuota monetisasi (roadmap §6.7) — kini selalu lolos.
  const quota = await checkTranscribeQuota(userId);
  if (!quota.allowed) {
    return json({ error: 'quota_exceeded' }, 402);
  }

  let storagePath: unknown = null;
  try {
    storagePath = (await req.json() as { storage_path?: unknown }).storage_path ?? null;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (typeof storagePath !== 'string' || storagePath === '') {
    return json({ error: 'bad_request' }, 400);
  }
  if (!storagePath.startsWith(`${userId}/`)) {
    return json({ error: 'recording_not_found' }, 404);
  }

  const { data: blob, error: downloadError } = await admin.storage
    .from('voice_drafts')
    .download(storagePath);
  if (downloadError || !blob) {
    console.error('transcribe-voice download failed', downloadError?.message ?? 'empty');
    return json({ ok: false }, 200);
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());

  // Retensi nol: hapus SEKARANG, sebelum kerja model — hasil apapun
  // (sukses/gagal/timeout) tidak pernah meninggalkan audio. Hapus duluan
  // juga menutup jendela crash-antara-transkrip-dan-hapus.
  const { error: removeError } = await admin.storage
    .from('voice_drafts')
    .remove([storagePath]);
  if (removeError) {
    console.error('transcribe-voice remove failed');
  }

  // Konteks milik pemanggil (pola scan-receipt AI3): kategori visible
  // (sistem + custom, minus arsip, minus mute) + dompet aktif + timezone.
  // Gagal baca bukan 500: lanjut konteks minimal, fail-open ke
  // `{ ok: false }` bila model ikut gagal.
  let timezone = 'Asia/Jakarta';
  let categories: { name: string; kind: 'income' | 'expense' }[] = [];
  let wallets: string[] = [];
  try {
    const [profileRes, catsRes, mutesRes, walletsRes] = await Promise.all([
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
      admin
        .from('wallets')
        .select('name')
        .eq('user_id', userId)
        .is('archived_at', null),
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
      .filter((c) => c.kind === 'income' || c.kind === 'expense')
      .map((c) => ({ name: c.name, kind: c.kind as 'income' | 'expense' }));
    wallets = ((walletsRes.data ?? []) as { name: string }[]).map(
      (w) => w.name,
    );
  } catch {
    console.error('transcribe-voice context failed');
  }

  // AI6: satu panggilan audio→JSON, primer + 1 fallback.
  const prompt = buildTranscribePrompt({ categories, wallets, timezone });
  const fallbackModel =
    Deno.env.get('GEMINI_FALLBACK_MODEL') ?? GEMINI_FALLBACK_MODEL;
  const mime = audioMime(storagePath);

  let raw: string | null = (
    await callAudioOnce(geminiKey, GEMINI_PRIMARY_MODEL, prompt, bytes, mime)
  ).text;
  if (raw === null && fallbackModel !== GEMINI_PRIMARY_MODEL) {
    raw = (
      await callAudioOnce(geminiKey, fallbackModel, prompt, bytes, mime)
    ).text;
  }
  if (raw === null) {
    console.error('transcribe-voice model failed');
    return json({ ok: false }, 200);
  }

  const prefill = validateAiVoicePayload(parseModelJson(raw), {
    categories,
    wallets,
  }, 'Catatan suara');
  if (!prefill) {
    return json({ ok: false }, 200);
  }

  return json(
    {
      ok: true,
      amount: prefill.amount,
      kind: prefill.kind,
      walletHint: prefill.walletHint,
      categoryHint: prefill.categoryHint,
      note: prefill.note,
      occurred_on: prefill.occurred_on,
    },
    200,
  );
});
