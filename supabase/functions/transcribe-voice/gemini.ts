/**
 * Gemini audio caller (AI6, issue #95).
 *
 * Thin transport only: posts the prompt plus the voice recording to one
 * exact model and returns the raw model text. Never throws (network or shape
 * failures resolve to null so the function can fail open to `{ ok: false }`).
 * Never logs audio, prompt, or response (PRD 4.4: voice bytes stay out of
 * logs; `console.error` here records codes only).
 *
 * Model values are COPIED from `parse-voice/gemini.ts`, not imported
 * (precedent AI3): the deploy uploader only ships the function dir plus
 * `_shared/`, so a `../parse-voice/*` import boots to 503 (proven live
 * 2026-10-03). Drift is locked by the parity test in
 * `__tests__/ai-voice-transcribe.test.ts`.
 */

export const GEMINI_PRIMARY_MODEL = 'gemini-3.5-flash-lite';

/**
 * Fallback: model pintar berbayar-kuota-ketat (ember per-model terpisah =
 * cadangan kuota juga). Nilai disalin dari `parse-voice/gemini.ts`.
 */
export const GEMINI_FALLBACK_MODEL = 'gemini-3.8-flash';

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: unknown }[] } }[];
};

/** Extracts the first text part, or null when the shape is foreign. */
export function extractTranscribeText(data: unknown): string | null {
  const res = data as GeminiResponse;
  const parts = res?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return null;
  for (const part of parts) {
    if (typeof part?.text === 'string' && part.text.trim() !== '') {
      return part.text;
    }
  }
  return null;
}

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Pure base64 encoder (no `btoa` global, so Deno and Jest share one path).
 * Copied from `scan-receipt/gemini.ts` (same no-cross-import rule).
 */
export function bytesToBase64(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    out += BASE64_ALPHABET[(triple >> 18) & 63];
    out += BASE64_ALPHABET[(triple >> 12) & 63];
    out += i + 1 < bytes.length ? BASE64_ALPHABET[(triple >> 6) & 63] : '=';
    out += i + 2 < bytes.length ? BASE64_ALPHABET[triple & 63] : '=';
  }
  return out;
}

/**
 * Calls one Gemini model with prompt + audio via REST (`inline_data`, so no
 * temp file and no base64 on the client — the client only ever sends
 * `storage_path`). Never throws. Permanent failures (400/401/403/404) are
 * NOT retryable; transient ones (429/5xx/network) are.
 */
export async function fetchGeminiAudio(
  apiKey: string,
  model: string,
  prompt: string,
  audio: Uint8Array,
  mime: string,
): Promise<{ text: string | null; retryable: boolean; status: number }> {
  let res: Response;
  try {
    res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                { inline_data: { mime_type: mime, data: bytesToBase64(audio) } },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            // Skema statis saja (Separation of Concerns, AI1): bentuk di sini,
            // makna (allow-list per user) tetap di `validate.ts`. Subset
            // OpenAPI 3.0: `nullable: true`, bukan array `type`.
            responseSchema: {
              type: 'object',
              properties: {
                amount: { type: 'integer' },
                kind: { type: 'string', enum: ['income', 'expense'] },
                walletHint: { type: 'string', nullable: true },
                categoryHint: { type: 'string', nullable: true },
                note: { type: 'string' },
                occurred_on: { type: 'string', nullable: true },
              },
              required: [
                'amount',
                'kind',
                'walletHint',
                'categoryHint',
                'note',
                'occurred_on',
              ],
            },
          },
        }),
      },
    );
    if (!res.ok) {
      // Badan error Google tidak dibaca/di-log: hanya status yang dipakai
      // (PRD 4.4). 429/5xx = retryable, sisanya fail-fast.
      const retryable = res.status === 429 || res.status >= 500;
      return { text: null, retryable, status: res.status };
    }
    const data: unknown = await res.json();
    return { text: extractTranscribeText(data), retryable: false, status: 200 };
  } catch {
    return { text: null, retryable: true, status: 0 };
  }
}
