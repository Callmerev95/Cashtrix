/**
 * Strict insight validator (L1, Analytics Overhaul).
 *
 * Pure (no Deno globals) so Jest can import it as a seam, the same pattern
 * as `parse-voice/validate.ts`. The model output is never trusted: the
 * reply must carry the SAME line count and EVERY figure token from the
 * input verbatim (figure-preservation gate) — a number-inventing reply is
 * rejected whole and the caller maps it to `{ ok: false }`, so the client
 * falls back to the deterministic lines. Category-name swaps are accepted
 * at L1 (documented scope: short lines, golden-watched, name allow-list
 * deferred to L2); invented NUMBERS are never accepted.
 */

export const INSIGHT_MAX_LINES = 4;
export const INSIGHT_MAX_LINE_CHARS = 280;

/** Number-tokens: digit-led runs with grouping/decimal separators + % . */
const FIGURE_TOKEN = /[\d][\d.,]*%?/g;

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

/** Distinct figure tokens across the input lines (order-stable). */
export function extractFigures(lines: string[]): string[] {
  const seen = new Set<string>();
  for (const line of lines) {
    for (const raw of line.match(FIGURE_TOKEN) ?? []) {
      // Jangan telan titik/koma akhir kalimat ("Rp 250.000." -> "250.000").
      const token = raw.replace(/[.,]+$/, '');
      if (token !== '' && /\d/.test(token)) seen.add(token);
    }
  }
  return [...seen];
}

/**
 * Validates one decoded model object against the frozen contract.
 * Returns the rephrased lines, or null when the shape is off, a figure
 * went missing, or a line is empty/too long.
 */
export function validateInsightPayload(
  data: unknown,
  inputLines: string[],
): string[] | null {
  if (!isRecord(data)) return null;
  const { lines } = data;
  if (!Array.isArray(lines)) return null;
  if (lines.length === 0 || lines.length > INSIGHT_MAX_LINES) return null;
  if (lines.length !== inputLines.length) return null;
  const clean: string[] = [];
  for (const line of lines) {
    if (typeof line !== 'string') return null;
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.length > INSIGHT_MAX_LINE_CHARS) {
      return null;
    }
    clean.push(trimmed);
  }
  const joined = clean.join('\n');
  for (const figure of extractFigures(inputLines)) {
    if (!joined.includes(figure)) return null;
  }
  return clean;
}
