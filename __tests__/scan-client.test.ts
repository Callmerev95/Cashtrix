/**
 * Scan client seam (S3, issue #57) — the Jest lock on the fail-open client:
 * wire shape validation, ISO-date handling, and category-hint resolution.
 * `scanReceipt()` itself is a thin `functions.invoke` wrapper (covered live
 * by `scripts/verify-s3.mjs`); everything branchable lives here, offline.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  hasScanConsent,
  parseScanPayload,
  resolveCategorySuggestion,
  SCAN_CONSENT_KEY,
  SCAN_MIN_DISPLAY_MS,
  scanDateToLocal,
  setScanConsent,
} from '../src/features/receipts/scan';

const CATEGORIES = [
  { id: 'c-food', name: 'Makanan', kind: 'expense' },
  { id: 'c-salary', name: 'Gaji', kind: 'income' },
];

describe('parseScanPayload — validasi kawat defensif', () => {
  const valid = {
    ok: true,
    amount: 55000,
    occurred_on: '2026-09-12',
    merchant: 'STARBUCKS',
    category_suggestion: 'Makanan',
    confidence: 0.42,
  };

  it('payload valid → prefill', () => {
    expect(parseScanPayload(valid)).toEqual({
      amount: 55000,
      occurredOn: '2026-09-12',
      merchant: 'STARBUCKS',
      categorySuggestion: 'Makanan',
      confidence: 0.42,
    });
  });

  it('{ ok: false } → null (lanjut manual)', () => {
    expect(parseScanPayload({ ok: false })).toBeNull();
  });

  const invalidCases: [unknown, string][] = [
    [{ ...valid, amount: 0 }, 'nol'],
    [{ ...valid, amount: -5 }, 'negatif'],
    [{ ...valid, amount: 12.5 }, 'desimal'],
    [{ ...valid, amount: '55000' }, 'string'],
    [{ ...valid, occurred_on: '12/09/26' }, 'tanggal non-ISO'],
    [{ ...valid, merchant: 42 }, 'merchant non-string'],
    [{ ...valid, confidence: 'high' }, 'confidence non-angka'],
    [null, 'null'],
    ['ok', 'string'],
  ];
  it.each(invalidCases)('%s → null', (data) => {
    expect(parseScanPayload(data)).toBeNull();
  });

  it('field opsional null tetap valid', () => {
    expect(
      parseScanPayload({ ...valid, occurred_on: null, merchant: null }),
    ).toMatchObject({ amount: 55000, occurredOn: null, merchant: null });
  });
});

describe('scanDateToLocal — tanpa geser tz', () => {
  it('2026-09-12 → siang lokal tanggal yang sama', () => {
    const date = scanDateToLocal('2026-09-12');
    expect(date).not.toBeNull();
    expect([
      date?.getFullYear(),
      date?.getMonth(),
      date?.getDate(),
    ]).toEqual([2026, 8, 12]);
  });

  it.each([[null], [''], ['12/09/26'], ['2026-13-01']])('%s → null', (iso) => {
    expect(scanDateToLocal(iso)).toBeNull();
  });
});

describe('resolveCategorySuggestion — opsional, tak pernah error', () => {  it('Makanan → id kategori expense', () => {
    expect(resolveCategorySuggestion('Makanan', CATEGORIES)).toBe('c-food');
  });

  it('case-insensitive', () => {
    expect(resolveCategorySuggestion('makanan', CATEGORIES)).toBe('c-food');
  });

  it('hint tak dikenal / null → null (bukan error)', () => {
    expect(resolveCategorySuggestion('XYZ', CATEGORIES)).toBeNull();
    expect(resolveCategorySuggestion(null, CATEGORIES)).toBeNull();
  });

  it('hint income tidak resolve ke expense', () => {
    expect(resolveCategorySuggestion('Gaji', CATEGORIES)).toBeNull();
  });
});

describe('consent-once (S3 UX: menetap di perangkat)', () => {
  beforeEach(async () => {
    await AsyncStorage.removeItem(SCAN_CONSENT_KEY);
  });

  it('baru → belum setuju (tanya sekali)', async () => {
    await expect(hasScanConsent()).resolves.toBe(false);
  });

  it('setuju → menetap', async () => {
    await setScanConsent();
    await expect(hasScanConsent()).resolves.toBe(true);
    expect(await AsyncStorage.getItem(SCAN_CONSENT_KEY)).toBe('1');
  });
});

describe('honesty floor (S3 UX)', () => {
  it('indikator scanning minimal ±1 detik (tanpa persen palsu)', () => {
    expect(SCAN_MIN_DISPLAY_MS).toBe(900);
  });
});
