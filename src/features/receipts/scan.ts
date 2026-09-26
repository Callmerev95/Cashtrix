/**
 * Receipt scan client (S3, ADR-0009) — prefill-only OCR over the `scan-receipt`
 * Edge Function.
 *
 * Fail-open by contract (spec story 16): every failure mode EXCEPT quota and
 * rate-limit resolves to "lanjut manual" (`empty`/`offline`) and must never
 * block Save. Only `rate_limited` (slow down) and `quota_exceeded` (paywall
 * prompt, roadmap §6.7) surface as distinct states.
 *
 * Privacy (PRD §4.4): the request carries only the storage path — never bytes
 * or base64 — and the response carries no image data. Amount/merchant travel
 * here because they ARE the prefill; they stay in form state and are never
 * passed to `trackEvent`/`captureError` (those carry kind + booleans only).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/supabase';

export type ScanPrefill = {
  amount: number;
  occurredOn: string | null;
  merchant: string | null;
  categorySuggestion: string | null;
  confidence: number;
};

export type ScanOutcome =
  | { status: 'ok'; prefill: ScanPrefill }
  /** `{ ok: false }` or a foreign shape — the form continues manually. */
  | { status: 'empty' }
  /** Transport/5xx failure — the form continues manually. */
  | { status: 'offline' }
  | { status: 'rate_limited' }
  | { status: 'quota_exceeded' };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Validates the function payload (defensive: the client never trusts the
 * wire). `{ ok: false }` and anything malformed → null (→ lanjut manual).
 */
export function parseScanPayload(data: unknown): ScanPrefill | null {
  if (!isRecord(data) || data.ok !== true) return null;
  if (
    typeof data.amount !== 'number' ||
    !Number.isInteger(data.amount) ||
    data.amount <= 0
  ) {
    return null;
  }
  if (
    data.occurred_on !== null &&
    (typeof data.occurred_on !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data.occurred_on))
  ) {
    return null;
  }
  for (const key of ['merchant', 'category_suggestion'] as const) {
    const value: unknown = data[key];
    if (value !== null && (typeof value !== 'string' || value.length > 200)) {
      return null;
    }
  }
  if (typeof data.confidence !== 'number') return null;
  const occurredOn: unknown = data.occurred_on;
  const merchant: unknown = data.merchant;
  const categorySuggestion: unknown = data.category_suggestion;
  if (
    (occurredOn !== null && typeof occurredOn !== 'string') ||
    (merchant !== null && typeof merchant !== 'string') ||
    (categorySuggestion !== null && typeof categorySuggestion !== 'string')
  ) {
    return null;
  }
  return {
    amount: data.amount,
    occurredOn,
    merchant,
    categorySuggestion,
    confidence: data.confidence,
  };
}

function invokeStatus(error: unknown): number | null {
  const context = (error as { context?: { status?: unknown } } | null)
    ?.context;
  return typeof context?.status === 'number' ? context.status : null;
}

/** Calls `scan-receipt` for one stored attachment. Never throws. */
export async function scanReceipt(input: {
  storagePath: string;
}): Promise<ScanOutcome> {
  let data: unknown;
  let error: unknown;
  try {
    const res = await supabase.functions.invoke('scan-receipt', {
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
  const prefill = parseScanPayload(data);
  if (!prefill) return { status: 'empty' };
  return { status: 'ok', prefill };
}

/** ISO `YYYY-MM-DD` → local noon Date (no tz shift); null when unparseable. */
export function scanDateToLocal(iso: string | null): Date | null {
  if (!iso) return null;
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return new Date(year, month - 1, day, 12, 0, 0);
}

export type SuggestableCategory = {
  id: string;
  name: string;
  kind: string;
};

/**
 * Consent-once flag (S3 UX, disetujui pemilik): written the first time the
 * user agrees to auto-reading, read before every auto-scan. Deliberately
 * NOT registered in `LOCAL_STORAGE_KEYS` — the consent sticks to the device,
 * not the session, so re-login never re-asks. Only `'1'` counts as granted
 * (same strictness as the lock flag: corrupt values degrade to asking).
 */
export const SCAN_CONSENT_KEY = 'cashtrix:scan-consent-v1';

export async function hasScanConsent(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(SCAN_CONSENT_KEY)) === '1';
  } catch {
    return false;
  }
}

export async function setScanConsent(): Promise<void> {
  try {
    await AsyncStorage.setItem(SCAN_CONSENT_KEY, '1');
  } catch {
    // Best-effort: a failed write just means the next scan asks again.
  }
}

/**
 * Minimum time the scanning indicator stays visible (S3 UX, disetujui
 * pemilik). Not a fake progress bar — an honesty floor so the "working"
 * state is perceivable even when the network answers instantly, and so the
 * timing matches the future real-OCR latency. The note still gates
 * deterministically on completion (Maestro-safe).
 */
export const SCAN_MIN_DISPLAY_MS = 900;

/** Resolves after the minimum display time (see above). */
export function scanDisplayDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, SCAN_MIN_DISPLAY_MS));
}

/**
 * Resolves the server's category *name hint* to a visible expense category
 * id (substring, case-insensitive). A miss → null (suggestion is optional,
 * never an error).
 */
export function resolveCategorySuggestion(
  hint: string | null,
  categories: SuggestableCategory[],
): string | null {
  if (!hint) return null;
  const lowered = hint.toLowerCase();
  const found = categories.find(
    (category) =>
      category.kind === 'expense' &&
      category.name.toLowerCase().includes(lowered),
  );
  return found?.id ?? null;
}
