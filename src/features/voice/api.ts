/**
 * Voice AI client (AI4, issue #93): prefill-only `parse-voice` call.
 * Fail-open like `receipts/scan.ts`: only rate-limit and quota surface
 * distinctly, the rest resolve to the local rule parser. Requests carry
 * `{ text }` only (max 500 char); context is injected server-side from
 * `user_id`. Never logs text or amounts (PRD §4.4); KPI is boolean-only
 * (`ai_prefill_ok`) emitted by the caller.
 *
 * AI6 (issue #95): audio Fase 2. Same contract, different door — the device
 * records (max 15 s, <1 MB), uploads the object to `voice_drafts/{userId}/`,
 * and `transcribe-voice` returns the SAME prefill shape before deleting the
 * object (zero-day retention). No new table, no cron.
 */
import { File } from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

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

/**
 * Debounce penjadwalan AI (rate-limit guard, Okt 2026): `handleText`
 * menembak sekali per keystroke/commit, dan dikte Gboard mengirim kata per
 * kata — tanpa jeda, satu ucapan 6 kata = 6 panggilan `parse-voice` dalam
 * detik dan limit 5/mnt langsung jebol. AI baru jalan setelah teks hening
 * selama ini. Hasil lokal (parser murni saat render) tetap instan karena
 * tidak lewat timer ini.
 */
export const AI_VOICE_DEBOUNCE_MS = 1000;

/** Timeout izin mic OS (catat suara): janji yang tak pernah kembali = sunyi. */
export const VOICE_PERMISSION_TIMEOUT_MS = 5_000;

/**
 * Consent-once flag (AI5, issue #94): separate from scan consent because
 * voice and receipt scan use different device sensors (microphone vs
 * camera). Same device-local pattern as `SCAN_CONSENT_KEY`: sticks to the
 * device, not the session, so re-login never re-asks. Only `'1'` counts.
 */
export const VOICE_CONSENT_KEY = 'cashtrix:voice-consent-v1';

export async function hasVoiceConsent(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(VOICE_CONSENT_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setVoiceConsent(): Promise<void> {
  try {
    await AsyncStorage.setItem(VOICE_CONSENT_KEY, '1');
  } catch {
    // Best-effort: a failed write just means the next voice use asks again.
  }
}

export function aiVoiceDisplayDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, AI_VOICE_MIN_DISPLAY_MS));
}

/**
 * Record consent, separate key (AI6, issue #95): the microphone is a
 * different sensor with a different risk (biometric audio upload) than the
 * keyboard-dictation text of `VOICE_CONSENT_KEY` — same split precedent as
 * AI5 (voice vs scan). Device-local, outside sign-out purge. Only `'1'`
 * counts.
 */
export const VOICE_RECORD_CONSENT_KEY = 'cashtrix:voice-record-consent-v1';

/** Client recording cap (ADR-0015): 15 seconds, mirrors the prompt. */
export const VOICE_RECORD_MAX_MS = 15_000;

/** Bucket-side twin of the cap: objects must stay under 1 MB. */
export const VOICE_RECORD_MAX_BYTES = 1_048_576;

export async function hasRecordConsent(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(VOICE_RECORD_CONSENT_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setRecordConsent(): Promise<void> {
  try {
    await AsyncStorage.setItem(VOICE_RECORD_CONSENT_KEY, '1');
  } catch {
    // Best-effort: a failed write just means the next record asks again.
  }
}

function newRecordingId(): string {
  const cryptoApi = (
    globalThis as { crypto?: { randomUUID?: () => string } }
  ).crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * Uploads a finished recording to the private drafts bucket (object-only,
 * no DB row — ADR-0015). Throws when the file still exceeds the 1 MB cap.
 * Returns the `storage_path` the Edge Function expects.
 */
export async function uploadVoiceRecording(input: {
  userId: string;
  sourceUri: string;
}): Promise<string> {
  // Native file read, never `fetch(file://)` (pelajaran avatar T8).
  const buffer = await new File(input.sourceUri).arrayBuffer();
  if (buffer.byteLength > VOICE_RECORD_MAX_BYTES) {
    throw new Error('voice_too_large');
  }
  const path = `${input.userId}/${newRecordingId()}.m4a`;
  const { error: uploadError } = await supabase.storage
    .from('voice_drafts')
    .upload(path, buffer, { contentType: 'audio/mp4' });
  if (uploadError) throw uploadError;
  return path;
}

export async function requestAiTranscribe(input: {
  storagePath: string;
}): Promise<AiVoiceOutcome> {
  if (input.storagePath.trim() === '') return { status: 'empty' };
  let data: unknown;
  let error: unknown;
  try {
    const res = await supabase.functions.invoke('transcribe-voice', {
      method: 'POST',
      body: { storage_path: input.storagePath },
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
