/**
 * Strict response validator (AI6, issue #95).
 *
 * COPIED from `parse-voice/validate.ts`, not imported (precedent AI3: the
 * deploy uploader only ships the function dir plus `_shared/`). Pure (no
 * Deno globals) so Jest can import it as a seam. The model hears audio, but
 * the contract is identical to AI1: `amount`/`kind` must be exact or the
 * whole payload is rejected, wild hints degrade to null.
 */

export type AiVoiceKind = 'income' | 'expense';

/** Category allow-list entry (name plus kind for the kind-match rule). */
export type AllowedCategory = {
  name: string;
  kind: AiVoiceKind;
};

/** Frozen AI1 prefill contract (issue #90), reused by AI6 audio 1-call. */
export type AiVoicePrefill = {
  amount: number;
  kind: AiVoiceKind;
  walletHint: string | null;
  categoryHint: string | null;
  note: string;
  occurred_on: string | null;
};

/** Same bound as the Add form (`validateAmount`, T5): whole rupiah only. */
export const AI_VOICE_MAX_AMOUNT = 999_999_999_999;

export const AI_VOICE_NOTE_MAX_LENGTH = 200;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Strips one markdown fence the model sometimes wraps around JSON. */
export function stripCodeFence(text: string): string {
  const fenced = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return (fenced ? fenced[1] : text).trim();
}

/** Parses raw model text to an unknown JSON value, or null when unparseable. */
export function parseModelJson(text: string): unknown {
  try {
    return JSON.parse(stripCodeFence(text));
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

/**
 * Validates one decoded model object against the frozen contract.
 * Returns the prefill, or null when `amount`/`kind` are not exact
 * (wild hints degrade to null inside a valid prefill, never reject it).
 */
export function validateAiVoicePayload(
  data: unknown,
  allowed: { categories: AllowedCategory[]; wallets: string[] },
  fallbackNote: string,
): AiVoicePrefill | null {
  if (!isRecord(data)) return null;
  const { amount, kind } = data;
  if (
    typeof amount !== 'number' ||
    !Number.isInteger(amount) ||
    amount <= 0 ||
    amount > AI_VOICE_MAX_AMOUNT
  ) {
    return null;
  }
  if (kind !== 'income' && kind !== 'expense') return null;

  const walletHint = canonicalName(data.walletHint, allowed.wallets);
  let categoryHint = canonicalName(
    data.categoryHint,
    allowed.categories.map((c) => c.name),
  );
  if (categoryHint !== null) {
    const entry = allowed.categories.find(
      (c) => c.name.toLowerCase() === categoryHint!.toLowerCase(),
    );
    if (!entry || entry.kind !== kind) categoryHint = null;
  }

  const rawNote =
    typeof data.note === 'string' && data.note.trim() !== ''
      ? data.note.trim()
      : fallbackNote.trim();
  const note = rawNote.slice(0, AI_VOICE_NOTE_MAX_LENGTH);

  return {
    amount,
    kind,
    walletHint,
    categoryHint,
    note,
    occurred_on: validIsoDate(data.occurred_on),
  };
}
