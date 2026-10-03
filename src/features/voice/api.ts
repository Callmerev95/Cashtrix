/**
 * Voice AI client (AI4, issue #93): prefill-only `parse-voice` call.
 * Fail-open like `receipts/scan.ts`: only rate-limit and quota surface
 * distinctly, the rest resolve to the local rule parser. Requests carry
 * `{ text }` only (max 500 char); context is injected server-side from
 * `user_id`. Never logs text or amounts (PRD §4.4); KPI is boolean-only
 * (`ai_prefill_ok`) emitted by the caller.
 */
import { supabase } from '@/supabase';

import type { VoiceTransactionKind } from './domain';

export type AiVoicePrefillPayload = {
  amount: number;
  kind: VoiceTransactionKind;
  walletHint: string | null;
  categoryHint: string | null;
  note: string;
};

export type AiVoiceOutcome =
  | { status: 'ok'; prefill: AiVoicePrefillPayload }
  | { status: 'empty' }
  | { status: 'offline' }
  | { status: 'rate_limited' }
  | { status: 'quota_exceeded' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function parseAiVoicePayload(data: unknown): AiVoicePrefillPayload | null {
  if (!isRecord(data) || data.ok !== true) return null;
  if (
    typeof data.amount !== 'number' ||
    !Number.isInteger(data.amount) ||
    data.amount <= 0 ||
    data.amount > 999_999_999_999
  ) {
    return null;
  }
  if (data.kind !== 'income' && data.kind !== 'expense') return null;
  for (const key of ['walletHint', 'categoryHint'] as const) {
    const value: unknown = data[key];
    if (
      value !== null &&
      value !== undefined &&
      (typeof value !== 'string' || value.length > 200)
    ) {
      return null;
    }
  }
  const rawNote: unknown = data.note;
  if (typeof rawNote !== 'string' || rawNote.trim() === '') return null;
  const walletHint: unknown = data.walletHint ?? null;
  const categoryHint: unknown = data.categoryHint ?? null;
  return {
    amount: data.amount,
    kind: data.kind,
    walletHint:
      typeof walletHint === 'string' && walletHint.trim() !== ''
        ? walletHint.trim()
        : null,
    categoryHint:
      typeof categoryHint === 'string' && categoryHint.trim() !== ''
        ? categoryHint.trim()
        : null,
    note: rawNote.trim().slice(0, 200),
  };
}

function invokeStatus(error: unknown): number | null {
  const context = (error as { context?: { status?: unknown } } | null)
    ?.context;
  return typeof context?.status === 'number' ? context.status : null;
}

export const AI_VOICE_MAX_TEXT_LENGTH = 500;

export const AI_VOICE_MIN_DISPLAY_MS = 900;

export function aiVoiceDisplayDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, AI_VOICE_MIN_DISPLAY_MS));
}

export async function requestAiVoice(input: {
  text: string;
}): Promise<AiVoiceOutcome> {
  const text = input.text.trim().slice(0, AI_VOICE_MAX_TEXT_LENGTH);
  if (text === '') return { status: 'empty' };
  let data: unknown;
  let error: unknown;
  try {
    const res = await supabase.functions.invoke('parse-voice', {
      method: 'POST',
      body: { text },
    });
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
  const prefill = parseAiVoicePayload(data);
  if (!prefill) return { status: 'empty' };
  return { status: 'ok', prefill };
}
