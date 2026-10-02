/**
 * Scan Gemini seam (AI3, issue #92): the pure Jest lock on the server-side
 * image-to-JSON contract that replaced the S3 mock provider.
 *
 * What is pinned here:
 * - prompt injects caller context (visible expense categories + timezone)
 *   and states the frozen schema (amount/occurred_on/merchant/categoryHint,
 *   no kind — scan is expense-only);
 * - strict validation: amount int > 0 else whole payload rejected, wild
 *   category hint degrades to null (never invented), merchant trimmed and
 *   capped, occurred_on ISO date or null;
 * - vision transport: `inline_data` payload shape, permanent 4xx fail fast,
 *   transient 429/5xx/network retryable, pure base64 encoder vectors;
 * - fixed honest confidence 0.42 (Gemini returns no score; the client
 *   contract requires a number) and the AI1 model pair reuse.
 *
 * Live behaviour (loose happy shape, Rp0 flood via 404, isolation, 401
 * before rate check) is locked by `scripts/verify-s3.mjs`, the same split
 * as AI1 (unit pins shape, script pins wire). The legacy rule parser
 * (`parse.ts`) and its golden pipe stay untouched — see `scan-parser.test.ts`
 * and `ai-golden.test.ts`.
 */
import {
  GEMINI_FALLBACK_MODEL as VOICE_FALLBACK_MODEL,
  GEMINI_PRIMARY_MODEL as VOICE_PRIMARY_MODEL,
} from '../supabase/functions/parse-voice/gemini';
import {
  bytesToBase64,
  extractScanText,
  fetchGeminiVision,
  GEMINI_FALLBACK_MODEL,
  GEMINI_PRIMARY_MODEL,
} from '../supabase/functions/scan-receipt/gemini';
import { SCAN_CONFIDENCE } from '../supabase/functions/scan-receipt/ocr';
import { buildScanPrompt } from '../supabase/functions/scan-receipt/prompt';
import {
  AI_SCAN_MAX_AMOUNT,
  parseModelJson,
  validateAiScanPayload,
} from '../supabase/functions/scan-receipt/validate';

const ALLOWED = ['Makanan', 'Transportasi', 'Belanja', 'Kopi Susu Tetangga'];

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    amount: 55000,
    occurred_on: '2026-09-12',
    merchant: 'STARBUCKS',
    categoryHint: 'Makanan',
    ...overrides,
  };
}

describe('kontrak AI3: model reuse + confidence jujur', () => {
  it('index scan memakai pasangan model AI1 (primer lite + fallback 3.8)', () => {
    expect(GEMINI_PRIMARY_MODEL).toBe('gemini-3.5-flash-lite');
    expect(GEMINI_FALLBACK_MODEL).toBe('gemini-3.8-flash');
    expect(GEMINI_FALLBACK_MODEL).not.toBe(GEMINI_PRIMARY_MODEL);
    // Paritas dua-arah (preseden VC1): nilai disalin, bukan diimpor —
    // drift rotasi model harus memerahkan test ini.
    expect(GEMINI_PRIMARY_MODEL).toBe(VOICE_PRIMARY_MODEL);
    expect(GEMINI_FALLBACK_MODEL).toBe(VOICE_FALLBACK_MODEL);
  });

  it('confidence fixed 0.42 (jujur, <0.5)', () => {
    expect(SCAN_CONFIDENCE).toBe(0.42);
    expect(SCAN_CONFIDENCE).toBeGreaterThan(0);
    expect(SCAN_CONFIDENCE).toBeLessThan(0.5);
  });
});

describe('buildScanPrompt: konteks + kontrak beku', () => {
  it('menyuntik kategori expense, timezone, dan skema', () => {
    const prompt = buildScanPrompt({
      categories: ALLOWED.map((name) => ({ name })),
      timezone: 'Asia/Jakarta',
    });
    expect(prompt).toContain('"amount"');
    expect(prompt).toContain('"occurred_on"');
    expect(prompt).toContain('"categoryHint"');
    expect(prompt).toContain('- Makanan');
    expect(prompt).toContain('- Kopi Susu Tetangga');
    expect(prompt).toContain('Asia/Jakarta');
    expect(prompt).toContain('TOTAL');
    expect(prompt).not.toContain('Makanan & Minuman');
  });

  it('tanpa kategori tetap valid (model disuruh null, bukan mengarang)', () => {
    const prompt = buildScanPrompt({ categories: [], timezone: 'Asia/Jakarta' });
    expect(prompt).toContain('tidak ada kategori');
  });

  it('tanpa field kind (scan expense-only)', () => {
    const prompt = buildScanPrompt({
      categories: [{ name: 'Makanan' }],
      timezone: 'Asia/Jakarta',
    });
    expect(prompt).not.toContain('"kind"');
  });
});

describe('bytesToBase64: vektor murni', () => {
  it.each([
    ['', ''],
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['Man', 'TWFu'],
    ['hello', 'aGVsbG8='],
  ])('%s → %s', (text, expected) => {
    expect(bytesToBase64(new TextEncoder().encode(text))).toBe(expected);
  });

  it('byte biner penuh (0..255) panjang tepat + padding', () => {
    const bytes = new Uint8Array(256).map((_, i) => i);
    const encoded = bytesToBase64(bytes);
    expect(encoded.length).toBe(344);
    expect(encoded.endsWith('==')).toBe(true);
  });
});

describe('validateAiScanPayload: kontrak strict', () => {
  it('payload valid lolos utuh', () => {
    expect(
      validateAiScanPayload(validPayload(), { categories: ALLOWED }),
    ).toEqual({
      amount: 55000,
      occurred_on: '2026-09-12',
      merchant: 'STARBUCKS',
      categoryHint: 'Makanan',
    });
  });

  it.each([[0], [-5], [12.5], ['55000'], [AI_SCAN_MAX_AMOUNT + 1]])(
    'amount %s menolak seluruh payload',
    (amount) => {
      expect(
        validateAiScanPayload(validPayload({ amount }), {
          categories: ALLOWED,
        }),
      ).toBeNull();
    },
  );

  it('categoryHint liar jadi null, bukan kategori baru', () => {
    expect(
      validateAiScanPayload(validPayload({ categoryHint: 'Kripto Elon' }), {
        categories: ALLOWED,
      }),
    ).toMatchObject({ categoryHint: null, amount: 55000 });
  });

  it('pencocokan hint tak peduli kapital', () => {
    expect(
      validateAiScanPayload(validPayload({ categoryHint: 'makanan' }), {
        categories: ALLOWED,
      }),
    ).toMatchObject({ categoryHint: 'Makanan' });
  });

  it('merchant dirapikan + dipotong 200, kosong jadi null', () => {
    expect(
      validateAiScanPayload(validPayload({ merchant: '  TOKO MAJU  ' }), {
        categories: ALLOWED,
      }),
    ).toMatchObject({ merchant: 'TOKO MAJU' });
    const long = validateAiScanPayload(
      validPayload({ merchant: 'm'.repeat(300) }),
      { categories: ALLOWED },
    );
    expect(long?.merchant?.length).toBe(200);
    expect(
      validateAiScanPayload(validPayload({ merchant: '' }), {
        categories: ALLOWED,
      }),
    ).toMatchObject({ merchant: null });
  });

  it('occurred_on valid lolos, asing jadi null', () => {
    expect(
      validateAiScanPayload(validPayload({ occurred_on: '12/09/26' }), {
        categories: ALLOWED,
      }),
    ).toMatchObject({ occurred_on: null });
    expect(
      validateAiScanPayload(validPayload({ occurred_on: '2026-02-30' }), {
        categories: ALLOWED,
      }),
    ).toMatchObject({ occurred_on: null });
  });

  it('bukan objek jadi null', () => {
    expect(validateAiScanPayload(null, { categories: ALLOWED })).toBeNull();
    expect(validateAiScanPayload('ok', { categories: ALLOWED })).toBeNull();
  });
});

describe('extractScanText + parseModelJson: bentuk candidates', () => {
  it('teks pertama diambil', () => {
    expect(
      extractScanText({
        candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }],
      }),
    ).toBe('{"a":1}');
  });

  it.each([[null], [{}], [{ candidates: [] }], [{ candidates: [{}] }]])(
    'bentuk asing jadi null (%s)',
    (data) => {
      expect(extractScanText(data)).toBeNull();
    },
  );

  it('fence json dikupas, bukan JSON jadi null', () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseModelJson('maaf tidak bisa')).toBeNull();
  });
});

describe('fetchGeminiVision: inline_data + retryable vs permanen', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
  });

  function stubFetch(status: number, body: unknown): void {
    global.fetch = (async () =>
      new Response(
        typeof body === 'string' ? body : JSON.stringify(body),
        { status },
      )) as typeof fetch;
  }

  function image(): Uint8Array {
    return new Uint8Array([0xff, 0xd8, 0xff]);
  }

  it('200 + teks kandidat → tidak retry', async () => {
    stubFetch(200, {
      candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }],
    });
    await expect(
      fetchGeminiVision('k', 'm', 'p', image(), 'image/jpeg'),
    ).resolves.toEqual({ text: '{"a":1}', retryable: false, status: 200 });
  });

  it('body membawa inline_data base64 (tanpa file temp)', async () => {
    let seen: unknown = null;
    global.fetch = (async (_url: unknown, init: unknown) => {
      seen = JSON.parse(String((init as { body: unknown }).body));
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{}' }] } }],
        }),
        { status: 200 },
      );
    }) as typeof fetch;
    await fetchGeminiVision('k', 'm', 'baca struk', image(), 'image/jpeg');
    const parts = (
      seen as {
        contents: { parts: { text?: string; inline_data?: unknown }[] }[];
      }
    ).contents[0].parts;
    expect(parts[0]).toMatchObject({ text: 'baca struk' });
    expect(parts[1]).toMatchObject({
      inline_data: { mime_type: 'image/jpeg', data: '/9j/' },
    });
  });

  it.each([[400], [401], [403], [404]])(
    '%s permanen → tidak retry',
    async (status) => {
      stubFetch(status, { error: { message: 'nope' } });
      await expect(
        fetchGeminiVision('k', 'm', 'p', image(), 'image/jpeg'),
      ).resolves.toEqual({ text: null, retryable: false, status });
    },
  );

  it.each([[429], [500], [503]])('%s transien → retry', async (status) => {
    stubFetch(status, { error: { message: 'busy' } });
    await expect(
      fetchGeminiVision('k', 'm', 'p', image(), 'image/jpeg'),
    ).resolves.toMatchObject({ text: null, retryable: true, status });
  });

  it('jaringan putus → retry (status 0)', async () => {
    global.fetch = (async () => {
      throw new Error('down');
    }) as typeof fetch;
    await expect(
      fetchGeminiVision('k', 'm', 'p', image(), 'image/jpeg'),
    ).resolves.toMatchObject({ text: null, retryable: true, status: 0 });
  });
});
