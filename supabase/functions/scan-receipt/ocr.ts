/**
 * OCR provider seam (S3, ADR-0009; AI3, issue #92).
 *
 * S3 shipped mock-first (owner decision 2026-09-25). AI3 replaced the
 * production path with one Gemini multimodal call (image → JSON, see
 * `gemini.ts` + `prompt.ts` + `validate.ts`); the mock below is retained
 * ONLY as a deterministic Jest seam (`scan-parser.test.ts` pins the legacy
 * rule-parser against `MOCK_RECEIPT_TEXT`). Production `index.ts` no longer
 * calls it.
 *
 * Pure (no Deno globals) so the mock text stays importable from tests.
 */

/** Canned OCR text: a Starbucks-style struk covering the parser's ID
 * formats — grouped thousands, a `dd/mm/yy` date, and tender/change lines
 * the total picker must ignore. */
export const MOCK_RECEIPT_TEXT = [
  'STARBUCKS',
  'Jl. Jend Sudirman Kav 52-53',
  '12/09/26  10:23   No: 0042',
  'AMERICANO GRANDE        30.000',
  'CROISSANT BUTTER        25.000',
  'TOTAL                   55.000',
  'TUNAI                   60.000',
  'KEMBALI                  5.000',
].join('\n');

/** Honest-by-design: a mock must never report high confidence (catatan S3:
 * kepercayaan palsu lebih mahal daripada skeptisisme sehat). */
export const MOCK_CONFIDENCE = 0.42;

/**
 * Fixed honest confidence for live Gemini scans (AI3, owner decision):
 * Gemini returns no score, and the client contract requires a number, so the
 * server reports the same static 0.42 — never a high or self-assessed value.
 * Pinned by `scan-gemini.test.ts` (exact value + <0.5).
 */
export const SCAN_CONFIDENCE = MOCK_CONFIDENCE;

export type OcrResult = { ok: true; text: string } | { ok: false };

export interface ScanOcrProvider {
  recognize(image: Uint8Array, mime: string): Promise<OcrResult>;
}

/** Deterministic mock — ignores the image so Maestro/verify runs are stable. */
export class MockScanProvider implements ScanOcrProvider {
  async recognize(_image: Uint8Array, _mime: string): Promise<OcrResult> {
    return { ok: true, text: MOCK_RECEIPT_TEXT };
  }
}
