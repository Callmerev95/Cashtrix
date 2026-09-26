/**
 * OCR provider seam (S3, ADR-0009).
 *
 * S3 ships mock-first (owner decision 2026-09-25): the plumbing
 * auth → rate-limit → quota seam → read object → parse → prefill is real,
 * only the text recognition is a deterministic mock. Swapping in Cloud
 * Vision later (free 1.000 unit/bulan, then $1,50/1.000) means replacing
 * `MockScanProvider` with a Vision REST call — same input (bytes), same
 * output (text), no client or contract change.
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
