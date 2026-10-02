/**
 * Edge Function `parse-voice` (AI1, issue #90: fondasi AI server).
 *
 * Pipeline (pola D5/S3): JWT dulu -> `enforceRateLimit` (5/mnt/user, 429
 * ber-body + `Retry-After`) -> seam kuota (kini pass-through, bentuk beku
 * 402 `{ error: 'quota_exceeded' }` untuk paywall kelak) -> baca konteks
 * milik pemanggil via service role (12 kategori sistem + custom + dompet
 * aktif + timezone) -> Gemini exact + 1 fallback -> validasi strict ->
 * prefill. Tanpa menyimpan transaksi. Gagal model/validasi = `200
 * { ok: false }`, form lanjut manual (fail-open untuk UX, bukan untuk
 * auth: tanpa JWT tetap 401 sebelum rate check, tanpa jejak IP).
 *
 * Transport = teks dikte (`{ text }`, max 500 char). Konteks disuntik
 * server dari `user_id` hasil `auth.getUser()`, tidak pernah dari body.
 * `console.error` di sini hanya mencatat kode (tidak pernah teks, nominal,
 * atau nama): PRD 4.4.
 */
import { createClient } from '@supabase/supabase-js';

import { enforceRateLimit } from '../_shared/rate-limit.ts';
import {
  fetchGeminiText,
  GEMINI_FALLBACK_MODEL,
  GEMINI_PRIMARY_MODEL,
} from './gemini.ts';
import {
  buildParseVoicePrompt,
  PARSE_VOICE_MAX_TEXT_LENGTH,
  type PromptCategory,
} from './prompt.ts';
import {
  parseModelJson,
  validateAiVoicePayload,
  type AllowedCategory,
} from './validate.ts';

/** Quota seam (roadmap paywall): pass-through sampai trek penagihan tiba.
 * Bentuk beku, sama seperti `scan-receipt`: kuota habis kelak = 402
 * `{ error: 'quota_exceeded' }` (beda dari `{ ok: false }` gagal model)
 * agar klien menampilkan paywall, bukan fallback diam-diam. */
async function checkAiQuota(_userId: string): Promise<{ allowed: boolean }> {
  return { allowed: true };
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** One transient retry (RPM/5xx smoothing): permanent 4xx fails fast. */
async function callModelOnce(
  apiKey: string,
  model: string,
  prompt: string,
): Promise<{ text: string | null; status: number }> {
  const first = await fetchGeminiText(apiKey, model, prompt);
  if (first.text !== null) {
    return { text: first.text, status: first.status };
  }
  if (!first.retryable) {
    return { text: null, status: first.status };
  }
  await new Promise((resolve) => setTimeout(resolve, 2000));
  const second = await fetchGeminiText(apiKey, model, prompt);
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

  // D5 (#54): abuse guard, setelah auth valid, sebelum kerja apa pun.
  const limited = await enforceRateLimit(admin, 'parse-voice', userId);
  if (limited) return limited;

  const quota = await checkAiQuota(userId);
  if (!quota.allowed) {
    return json({ error: 'quota_exceeded' }, 402);
  }

  let text: unknown = null;
  try {
    text = (await req.json() as { text?: unknown }).text ?? null;
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  if (typeof text !== 'string' || text.trim() === '') {
    return json({ error: 'bad_request' }, 400);
  }
  const utterance = text.trim().slice(0, PARSE_VOICE_MAX_TEXT_LENGTH);

  // Konteks milik pemanggil (filter eksplisit user_id, pola export-csv).
  // Gagal baca bukan 500: lanjut dengan konteks minimal agar request
  // tetap fail-open ke `{ ok: false }` bila model ikut gagal.
  let timezone = 'Asia/Jakarta';
  let categories: PromptCategory[] = [];
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
        .is('archived_at', null)
        .order('created_at'),
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
      .filter((c) => c.kind === 'expense' || c.kind === 'income')
      .map((c) => ({ name: c.name, kind: c.kind as 'expense' | 'income' }));
    wallets = ((walletsRes.data ?? []) as { name: string }[]).map(
      (w) => w.name,
    );
  } catch {
    console.error('parse-voice context failed');
  }

  const prompt = buildParseVoicePrompt({
    text: utterance,
    categories,
    wallets,
    timezone,
  });
  const fallbackModel =
    Deno.env.get('GEMINI_FALLBACK_MODEL') ?? GEMINI_FALLBACK_MODEL;

  let raw: string | null = (
    await callModelOnce(geminiKey, GEMINI_PRIMARY_MODEL, prompt)
  ).text;
  if (raw === null && fallbackModel !== GEMINI_PRIMARY_MODEL) {
    raw = (await callModelOnce(geminiKey, fallbackModel, prompt)).text;
  }
  if (raw === null) {
    console.error('parse-voice model failed');
    return json({ ok: false }, 200);
  }

  const allowed: { categories: AllowedCategory[]; wallets: string[] } = {
    categories,
    wallets,
  };
  const prefill = validateAiVoicePayload(parseModelJson(raw), allowed, utterance);
  if (!prefill) {
    return json({ ok: false, stage: 'invalid' }, 200);
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
