/**
 * Gemini REST caller (AI1, issue #90).
 *
 * Thin transport only: posts the prompt to one exact model and returns the
 * raw model text. Never throws (network or shape failures resolve to null
 * so the function can fail open to `{ ok: false }`). Never logs the prompt
 * or the response (PRD 4.4: user text stays out of logs).
 */

export const GEMINI_PRIMARY_MODEL = 'gemini-3.5-flash-lite';

/**
 * Fallback: model pintar berbayar-kuota-ketat. Catatan kuota per-model
 * (Okt 2026): primer lite 15 RPM/500 RPD, 3.8-flash hanya 5 RPM/20 RPD —
 * ember terpisah, jadi fallback lintas-model = cadangan kuota juga.
 */
export const GEMINI_FALLBACK_MODEL = 'gemini-3.8-flash';

type GeminiResponse = {
  candidates?: { content?: { parts?: { text?: unknown }[] } }[];
};

/** Extracts the first text part, or null when the shape is foreign. */
export function extractGeminiText(data: unknown): string | null {
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

/**
 * Calls one Gemini model via REST. Never throws. Permanent failures
 * (400/401/403/404: bad key, dead model, bad shape) are NOT retryable —
 * retrying them only burns quota. Transient ones (429/5xx/network) are.
 */
export async function fetchGeminiText(
  apiKey: string,
  model: string,
  prompt: string,
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
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            responseMimeType: 'application/json',
            // thinkingLevel DITANGGUHKAN (empiris 2026-10-02: dengan 'low'
            // seluruh panggilan gagal → stage:model; diuji ulang terpisah).
            // Rollback satu baris sesuai rencana fail-safe AI1.
            // Skema statis saja (Separation of Concerns, AI1): bentuk di sini,
            // makna (allow-list per user) tetap di `validate.ts` agar tidak
            // ada kompilasi skema dinamis per request. Bentuk mengikuti subset
            // OpenAPI 3.0 milik API Gemini: `nullable: true`, bukan array
            // `type` (itu 3.1 — ditolak 400).
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
      // (PRD 4.4 — respons error tak pernah menyentuh log).
      return {
        text: null,
        retryable: res.status === 429 || res.status >= 500,
        status: res.status,
      };
    }
    let data: unknown;
    try {
      data = await res.json();
    } catch {
      return { text: null, retryable: true, status: res.status };
    }
    const text = extractGeminiText(data);
    return { text, retryable: text === null, status: res.status };
  } catch {
    return { text: null, retryable: true, status: 0 };
  }
}
