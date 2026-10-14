/**
 * Edge Function `insight-summary` (L1, Analytics Overhaul).
 *
 * Pipeline (pola D5/S3/AI1): JWT dulu -> `enforceRateLimit` (5/mnt/user,
 * 429 ber-body + `Retry-After`) -> seam kuota (pass-through, bentuk beku
 * 402 `{ error: 'quota_exceeded' }` untuk paywall kelak) -> Gemini exact +
 * 1 fallback -> validasi strict (figure-preservation) -> baris parafrasa.
 *
 * Rephrase-only by construction: the client sends the ALREADY-COMPUTED
 * deterministic lines (`toInsightSummary`); the server reads NO tables, so
 * the model only ever sees aggregates plus sentences, never raw
 * transactions. Gagal model/validasi = `200 { ok: false }` — klien
 * diam-diam memakai deterministik (fail-open untuk UX, bukan untuk auth:
 * tanpa JWT tetap 401 sebelum rate check).
 *
 * Transport = `{ lines: string[1..3], lang: 'id' | 'en' }`.
 * `console.error` di sini hanya mencatat kode (PRD 4.4).
 */
import { createClient } from '@supabase/supabase-js';

import { enforceRateLimit } from '../_shared/rate-limit.ts';
import {
  fetchGeminiText,
  GEMINI_FALLBACK_MODEL,
  GEMINI_PRIMARY_MODEL,
} from './gemini.ts';
import {
  buildInsightPrompt,
  INSIGHT_MAX_INPUT_CHARS,
  INSIGHT_MAX_INPUT_LINES,
} from './prompt.ts';
import { parseModelJson, validateInsightPayload } from './validate.ts';

/** Quota seam (roadmap paywall): pass-through sampai trek penagihan tiba. */
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

function validBody(value: unknown): { lines: string[]; lang: 'id' | 'en' } | null {
  if (typeof value !== 'object' || value === null) return null;
  const { lines, lang } = value as { lines?: unknown; lang?: unknown };
  if (!Array.isArray(lines)) return null;
  if (lines.length === 0 || lines.length > INSIGHT_MAX_INPUT_LINES) {
    return null;
  }
  const clean: string[] = [];
  for (const line of lines) {
    if (typeof line !== 'string') return null;
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.length > INSIGHT_MAX_INPUT_CHARS) {
      return null;
    }
    clean.push(trimmed);
  }
  return { lines: clean, lang: lang === 'en' ? 'en' : 'id' };
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
  const limited = await enforceRateLimit(admin, 'insight-summary', userId);
  if (limited) return limited;

  const quota = await checkAiQuota(userId);
  if (!quota.allowed) {
    return json({ error: 'quota_exceeded' }, 402);
  }

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    return json({ error: 'bad_request' }, 400);
  }
  const input = validBody(body);
  if (!input) {
    return json({ error: 'bad_request' }, 400);
  }

  const prompt = buildInsightPrompt(input);
  const fallbackModel =
    Deno.env.get('GEMINI_FALLBACK_MODEL') ?? GEMINI_FALLBACK_MODEL;

  let raw: string | null = (
    await callModelOnce(geminiKey, GEMINI_PRIMARY_MODEL, prompt)
  ).text;
  if (raw === null && fallbackModel !== GEMINI_PRIMARY_MODEL) {
    raw = (await callModelOnce(geminiKey, fallbackModel, prompt)).text;
  }
  if (raw === null) {
    console.error('insight-summary model failed');
    return json({ ok: false }, 200);
  }

  const lines = validateInsightPayload(parseModelJson(raw), input.lines);
  if (!lines) {
    return json({ ok: false, stage: 'invalid' }, 200);
  }

  return json({ ok: true, lines }, 200);
});
