/**
 * Strict response validator (AI3, issue #92).
 *
 * Pure (no Deno globals) so Jest can import it as a seam, the same pattern
 * as `parse-voice/validate.ts`. The model output is never trusted: `amount`
 * must be exact or the whole payload is rejected (caller maps to
 * `{ ok: false }`, form continues manually), while a wild category hint
 * degrades to null instead of inventing a category.
 *
 * JSON helpers are copied, not imported (precedent VC1 `parseVoiceAmountToken`:
 * `tsconfig` excludes `supabase/functions`, so a cross-dir import would pull
 * sibling dirs into `tsc` and fail TS5097 — while Deno needs the `.ts`
 * suffix. Dependency-free seam files keep both toolchains green).
 */

/** Frozen AI3 prefill contract (issue #92): expense-only, no kind field. */
export type AiScanPrefill = {
  amount: number;
  occurred_on: string | null;
  merchant: string | null;
  categoryHint: string | null;
};

/** Same bound as the Add form (`validateAmount`, T5): whole rupiah only. */
export const AI_SCAN_MAX_AMOUNT = 999_999_999_999;

export const AI_SCAN_MERCHANT_MAX_LENGTH = 200;

/** Strips one markdown fence the model sometimes wraps around JSON. */
export function stripScanFence(text: string): string {
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] : text).trim();
}

/** Parses raw model text to an unknown JSON value, or null when unparseable. */
export function parseModelJson(text: string): unknown {
  try {
    return JSON.parse(stripScanFence(text));
  } catch {
    return null;
  }
}

function canonicalName(hint: unknown, allowed: string[]): string | null {
  if (hint === null || hint === undefined) return null;
  if (typeof hint !== 'string') return null;
  const trimmed = hint.trim();
  if (trimmed === '') return null;
  const found = allowed.find(
    (name) => name.toLowerCase() === trimmed.toLowerCase(),
  );
  return found ?? null;
}

function validIsoDate(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (
    dt.getUTCFullYear() !== y ||
    dt.getUTCMonth() !== m - 1 ||
    dt.getUTCDate() !== d
  ) {
    return null;
  }
  return value;
}

function validMerchant(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (trimmed === '') return null;
  return trimmed.slice(0, AI_SCAN_MERCHANT_MAX_LENGTH);
}

/**
 * Validates one decoded model object against the frozen contract.
 * Returns the prefill, or null when `amount` is not exact (a wild hint
 * degrades to null inside a valid prefill, never rejects it).
 */
export function validateAiScanPayload(
  data: unknown,
  allowed: { categories: string[] },
): AiScanPrefill | null {
  if (typeof data !== 'object' || data === null) return null;
  const record = data as Record<string, unknown>;
  const { amount } = record;
  if (
    typeof amount !== 'number' ||
    !Number.isInteger(amount) ||
    amount <= 0 ||
    amount > AI_SCAN_MAX_AMOUNT
  ) {
    return null;
  }
  return {
    amount,
    occurred_on: validIsoDate(record.occurred_on),
    merchant: validMerchant(record.merchant),
    categoryHint: canonicalName(record.categoryHint, allowed.categories),
  };
}
