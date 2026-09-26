/**
 * Scan parser seam (S3, issue #57) — the pure Jest lock on the Indonesian
 * receipt parser the `scan-receipt` Edge Function runs server-side.
 *
 * What is pinned here:
 * - total ID formats (`30.000`, `30,000`, `Rp30rb`, bare digits) → integer
 *   rupiah; tender/change/tax lines never win; a TOTAL-keyword line beats a
 *   larger tendered amount;
 * - date formats (`12/09/26`, `12-09-2026`, `12 Sep 2026` ID/EN months);
 * - merchant = first content line; category hint optional (a miss is legal —
 *   CONTEXT.md "Saran kategori" is never locked);
 * - `scan-receipt` abuse threshold 5/min (D5 pattern, documented in #57);
 * - the mock provider's confidence stays <0.5 (honest-by-design: a mock must
 *   never report high confidence).
 */
import { FUNCTION_RATE_LIMITS } from '../supabase/functions/_shared/rate-limit';
import { MOCK_CONFIDENCE, MOCK_RECEIPT_TEXT } from '../supabase/functions/scan-receipt/ocr';
import {
  extractMerchant,
  hintCategoryForMerchant,
  parseAmountToken,
  parseReceiptDate,
  parseReceiptText,
  parseReceiptTotal,
} from '../supabase/functions/scan-receipt/parse';

describe('parseAmountToken — format ID', () => {
  it.each([
    ['30.000', 30000],
    ['30,000', 30000],
    ['Rp30.000', 30000],
    ['Rp 30.000', 30000],
    ['30000', 30000],
    ['Rp30rb', 30000],
    ['30rb', 30000],
    ['30 ribu', 30000],
    ['45.500', 45500],
    ['30.000,50', 30000],
  ])('%s → %s', (token, expected) => {
    expect(parseAmountToken(token)).toBe(expected);
  });

  it.each([[''], ['Rp'], ['0'], ['-5000'], ['abc'], ['30.00.00']])(
    '%s → null',
    (token) => {
      expect(parseAmountToken(token)).toBeNull();
    },
  );
});

describe('parseReceiptDate — format struk ID', () => {
  it.each([
    ['12/09/26 10:23', '2026-09-12'],
    ['12-09-2026', '2026-09-12'],
    ['12.09.2026', '2026-09-12'],
    ['12 Sep 2026', '2026-09-12'],
    ['5 Okt 2025', '2025-10-05'],
    ['1 January 2026', '2026-01-01'],
  ])('%s → %s', (text, expected) => {
    expect(parseReceiptDate(text)).toBe(expected);
  });

  it('tanpa tanggal → null', () => {
    expect(parseReceiptDate('STARBUCKS AMERICANO 30.000')).toBeNull();
  });

  it('bulan/tanggal invalid → null', () => {
    expect(parseReceiptDate('99/99/2026')).toBeNull();
  });
});

describe('parseReceiptTotal — satu total', () => {
  it('baris TOTAL menang atas nominal tunai yang lebih besar', () => {
    expect(
      parseReceiptTotal(
        ['TOTAL 55.000', 'TUNAI 60.000', 'KEMBALI 5.000'].join('\n'),
      ),
    ).toBe(55000);
  });

  it('tanpa baris TOTAL → kandidat trailing terbesar non-tender', () => {
    expect(
      parseReceiptTotal(['AMERICANO GRANDE 30.000', 'CROISSANT 25.000'].join('\n')),
    ).toBe(30000);
  });

  it('struk mock penuh → 55.000', () => {
    expect(parseReceiptTotal(MOCK_RECEIPT_TEXT)).toBe(55000);
  });

  it('tanpa angka → null (→ { ok: false } di function)', () => {
    expect(parseReceiptTotal('TERIMA KASIH\nDATANG KEMBALI')).toBeNull();
  });
});

describe('merchant + hint kategori', () => {
  it('baris isi pertama = merchant', () => {
    expect(extractMerchant(MOCK_RECEIPT_TEXT)).toBe('STARBUCKS');
  });

  it('Starbucks → Makanan (sistem punya Makanan, bukan Minuman)', () => {
    expect(hintCategoryForMerchant('STARBUCKS')).toBe('Makanan');
  });

  it('merchant tak dikenal → null (saran opsional, bukan error)', () => {
    expect(hintCategoryForMerchant('PT XYZ ABADI')).toBeNull();
  });
});

describe('parseReceiptText — ekstraksi penuh', () => {
  it('mock text → prefill lengkap', () => {
    expect(parseReceiptText(MOCK_RECEIPT_TEXT)).toEqual({
      amount: 55000,
      occurredOn: '2026-09-12',
      merchant: 'STARBUCKS',
      categoryHint: 'Makanan',
    });
  });

  it('tanpa total → null', () => {
    expect(parseReceiptText('TERIMA KASIH')).toBeNull();
  });
});

describe('kontrak S3', () => {
  it('scan-receipt 5/mnt/user', () => {
    expect(FUNCTION_RATE_LIMITS['scan-receipt']).toBe(5);
  });

  it('confidence mock jujur (<0.5)', () => {
    expect(MOCK_CONFIDENCE).toBeGreaterThan(0);
    expect(MOCK_CONFIDENCE).toBeLessThan(0.5);
  });
});
