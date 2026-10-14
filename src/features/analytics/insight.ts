/**
 * Insight AI client (L1, Analytics Overhaul): rephrase-only
 * `insight-summary` call. Fail-open like `voice/api.ts`: the deterministic
 * lines stay on screen no matter what; only rate-limit and quota surface
 * distinctly, the rest resolve to "keep deterministic". Requests carry the
 * ALREADY-COMPUTED lines (`{ lines, lang }`); the server reads no tables,
 * so the model only ever sees aggregates plus sentences, never raw
 * transactions. Never logs lines or figures (PRD §4.4); KPI is
 * boolean-only (`insight_ai_ok`) emitted by the caller.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/supabase';

export type InsightLang = 'id' | 'en';

export type InsightAiOutcome =
  | { status: 'ok'; lines: string[] }
  | { status: 'empty' }
  | { status: 'offline' }
  | { status: 'rate_limited' }
  | { status: 'quota_exceeded' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export const INSIGHT_MAX_LINES = 4;
export const INSIGHT_MAX_LINE_CHARS = 280;

export function parseInsightPayload(data: unknown): string[] | null {
  if (!isRecord(data) || data.ok !== true) return null;
  const { lines } = data;
  if (!Array.isArray(lines)) return null;
  if (lines.length === 0 || lines.length > INSIGHT_MAX_LINES) return null;
  const clean: string[] = [];
  for (const line of lines) {
    if (typeof line !== 'string') return null;
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.length > INSIGHT_MAX_LINE_CHARS) {
      return null;
    }
    clean.push(trimmed);
  }
  return clean;
}

function invokeStatus(error: unknown): number | null {
  const context = (error as { context?: { status?: unknown } } | null)
    ?.context;
  return typeof context?.status === 'number' ? context.status : null;
}

/**
 * Batas request (fix sunyi-abadi): 30 detik tanpa jawaban = gagal jujur.
 * Menutup kelas "guard terkunci selamanya" apa pun penyebab nyangkutnya
 * (radio, cold-start Edge, Google menahan koneksi free-tier).
 */
export const INSIGHT_REQUEST_TIMEOUT_MS = 30_000;

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('insight_timeout')), ms);
  });
  return Promise.race([work, timeout]).finally(() => {
    if (timer !== null) clearTimeout(timer);
  });
}

/**
 * Consent-once flag (L1): aggregates-to-model is a new data flow (same
 * split precedent as AI5 voice-vs-scan and AI6 record). Device-local,
 * outside sign-out purge. Only `'1'` counts.
 */
export const INSIGHT_CONSENT_KEY = 'cashtrix:insight-consent-v1';

export async function hasInsightConsent(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(INSIGHT_CONSENT_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setInsightConsent(): Promise<void> {
  try {
    await AsyncStorage.setItem(INSIGHT_CONSENT_KEY, '1');
  } catch {
    // Best-effort: a failed write just means the next refine asks again.
  }
}
/**
 * Pure auto gate (L1 auto): background fetch fires only for a consented
 * user on a fresh idle summary — never per-open (the session cache makes
 * re-opens free), never while a fetch is in flight, never after revoke.
 */
export function shouldAutoRefine(input: {
  consented: boolean;
  aiState: string;
  hasLines: boolean;
}): boolean {
  return input.consented && input.aiState === 'idle' && input.hasLines;
}

export async function requestInsight(input: {
  lines: string[];
  lang: InsightLang;
}): Promise<InsightAiOutcome> {
  const lines = input.lines
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (lines.length === 0) return { status: 'empty' };
  let data: unknown;
  let error: unknown;
  try {
    // Fix sunyi-abadi (Okt 2026): `invoke` tanpa timeout + Edge→Google
    // tanpa timeout = satu request nyangkut mengunci guard selamanya.
    // Lewat batas = offline (idle, bisa retry) — tak pernah gantung.
    const res = await withTimeout(
      supabase.functions.invoke('insight-summary', {
        method: 'POST',
        body: { lines, lang: input.lang },
      }),
      INSIGHT_REQUEST_TIMEOUT_MS,
    );
    data = res.data;
    error = res.error;
  } catch {
    return { status: 'offline' };
  }
  if (error) {
    const status = invokeStatus(error);
    if (status === 429) return { status: 'rate_limited' };
    if (status === 402) return { status: 'quota_exceeded' };
    return { status: 'offline' };
  }
  const parsed = parseInsightPayload(data);
  if (!parsed) return { status: 'empty' };
  return { status: 'ok', lines: parsed };
}
