/**
 * Insight prompt builder (L1, Analytics Overhaul).
 *
 * Pure (no Deno globals) so Jest can import it as a seam, the same pattern
 * as `parse-voice/prompt.ts`. The client sends the ALREADY-COMPUTED
 * deterministic lines (`toInsightSummary`) — the server reads no tables,
 * so the model only ever sees aggregates plus sentences, never raw
 * transactions. Rephrase-only: every figure must survive verbatim;
 * `validate.ts` enforces that (figure-preservation gate), so a
 * number-inventing reply is rejected whole and the client falls back to
 * the deterministic lines.
 */

export type InsightLang = 'id' | 'en';

export const INSIGHT_MAX_INPUT_LINES = 5;
export const INSIGHT_MAX_INPUT_CHARS = 500;

export type InsightPromptInput = {
  lines: string[];
  lang: InsightLang;
};

export function buildInsightPrompt(input: InsightPromptInput): string {
  const lines = input.lines
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .slice(0, INSIGHT_MAX_INPUT_LINES)
    .map((line) => `- ${line.slice(0, INSIGHT_MAX_INPUT_CHARS)}`);
  const langName = input.lang === 'en' ? 'English' : 'Indonesian';
  return [
    '[SYSTEM INSTRUCTION]',
    `You are a rephrasing engine for Cashtrix, a personal finance app. Answer ONLY with one JSON object, no markdown, no explanation. Write in ${langName}.`,
    '',
    'Frozen schema:',
    '{"lines": [string, string?, string?]}',
    '',
    'Rules:',
    '1. Rewrite the input lines below in warm, natural language a friend would use. Keep the same line count and the same meaning.',
    '2. EVERY figure (amounts, percentages, month names, category names) must appear VERBATIM — character for character. Never invent, round, convert, or drop a figure.',
    '3. No financial advice, no new claims, no extra lines. Do not mention that you are an AI.',
    '',
    'Input lines to rephrase:',
    ...lines,
  ].join('\n');
}
