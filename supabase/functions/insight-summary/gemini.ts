/**
 * Gemini REST caller (L1, Analytics Overhaul).
 *
 * Copied, not imported, from `parse-voice/gemini.ts` (AI3 lesson: the
 * deploy uploader ships only the function dir + `_shared/`, so a
 * `../parse-voice/*` import boots 503). Only the frozen responseSchema
 * differs. Thin transport only, never throws, never logs prompt/response
 * (PRD 4.4).
 */

export const GEMINI_PRIMARY_MODEL = 'gemini-3.5-flash-lite';

/**
 * Fallback: model pintar berbayar-kuota-ketat (catatan kuota per-model
 * Okt 2026: primer lite 15 RPM/500 RPD, 3.8-flash 5 RPM/20 RPD — ember
 * terpisah, jadi fallback lintas-model = cadangan kuota juga).
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
 * (400/401/403/404) are NOT retryable — retrying them only burns quota.
 * Transient ones (429/5xx/network) are.
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
            // thinkingLevel DITANGGUHKAN (empiris 2026-10-02, warisan AI1).
            // Skema statis subset OpenAPI 3.0 (`nullable` tak dipakai di
            // sini — semua field required; makna tetap di `validate.ts`).
            responseSchema: {
              type: 'object',
              properties: {
                lines: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
              required: ['lines'],
            },
          },
        }),
      },
    );
    if (!res.ok) {
      // Badan error Google tidak dibaca/di-log (PRD 4.4).
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
