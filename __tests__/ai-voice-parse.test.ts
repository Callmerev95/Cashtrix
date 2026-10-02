/**
 * AI voice parse seam (AI1, issue #90): the pure Jest lock on the
 * server-side text-to-JSON contract.
 *
 * What is pinned here:
 * - prompt injects caller context (system + custom categories, active
 *   wallets, timezone) and states the frozen schema plus the slang map
 *   (`goceng`, `1,5 juta`);
 * - strict validation: amount int > 0 else whole payload rejected, kind
 *   exact else rejected, wild hints degrade to null (never invented),
 *   category kind mismatch degrades to null, note capped at 200,
 *   occurred_on ISO date or null;
 * - Gemini text extraction tolerates the candidates shape and rejects
 *   foreign shapes;
 * - abuse threshold `parse-voice` 5/min (D5 pattern, documented in #90).
 *
 * Live behaviour (flood 5+2 to 429, isolation, 401 before rate check) is
 * locked by `scripts/verify-ai-voice.mjs`, the same split as S3 (unit pins
 * shape, script pins wire).
 */
import { FUNCTION_RATE_LIMITS } from '../supabase/functions/_shared/rate-limit';
import {
  extractGeminiText,
  fetchGeminiText,
  GEMINI_FALLBACK_MODEL,
  GEMINI_PRIMARY_MODEL,
} from '../supabase/functions/parse-voice/gemini';
import {
  buildParseVoicePrompt,
  PARSE_VOICE_MAX_TEXT_LENGTH,
} from '../supabase/functions/parse-voice/prompt';
import {
  AI_VOICE_MAX_AMOUNT,
  parseModelJson,
  stripCodeFence,
  validateAiVoicePayload,
  type AllowedCategory,
} from '../supabase/functions/parse-voice/validate';

const ALLOWED: { categories: AllowedCategory[]; wallets: string[] } = {
  categories: [
    { name: 'Makanan', kind: 'expense' },
    { name: 'Transportasi', kind: 'expense' },
    { name: 'Gaji', kind: 'income' },
    { name: 'Kopi Susu Tetangga', kind: 'expense' },
  ],
  wallets: ['Cash', 'Bank'],
};

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    amount: 30000,
    kind: 'expense',
    walletHint: 'Cash',
    categoryHint: 'Makanan',
    note: 'soto mie',
    occurred_on: null,
    ...overrides,
  };
}

describe('rate-limit config: parse-voice 5/mnt (D5)', () => {
  it('parse-voice 5', () => {
    expect(FUNCTION_RATE_LIMITS['parse-voice']).toBe(5);
  });

  it('model dikunci (primer lite lapang + fallback 3.8 pintar)', () => {
    expect(GEMINI_PRIMARY_MODEL).toBe('gemini-3.5-flash-lite');
    expect(GEMINI_FALLBACK_MODEL).toBe('gemini-3.8-flash');
    expect(GEMINI_FALLBACK_MODEL).not.toBe(GEMINI_PRIMARY_MODEL);
  });
});

describe('buildParseVoicePrompt: konteks + kontrak beku', () => {
  it('menyuntik kategori, dompet, timezone, dan teks', () => {
    const prompt = buildParseVoicePrompt({
      text: 'soto mie 30 ribu pakai cash',
      categories: ALLOWED.categories,
      wallets: ALLOWED.wallets,
      timezone: 'Asia/Jakarta',
    });
    expect(prompt).toContain('Makanan (expense)');
    expect(prompt).toContain('Kopi Susu Tetangga (expense)');
    expect(prompt).toContain('Gaji (income)');
    expect(prompt).toContain('Cash');
    expect(prompt).toContain('Asia/Jakarta');
    expect(prompt).toContain('soto mie 30 ribu pakai cash');
    expect(prompt).toContain('"amount"');
    expect(prompt).toContain('goceng=5000');
    expect(prompt).toContain('"1,5 juta"=1500000');
  });

  it('teks dipotong 500 char', () => {
    const prompt = buildParseVoicePrompt({
      text: 'x'.repeat(600),
      categories: [],
      wallets: [],
      timezone: 'Asia/Jakarta',
    });
    expect(prompt.length).toBeLessThan(600 + 2000);
    expect(prompt.slice(-PARSE_VOICE_MAX_TEXT_LENGTH)).toBe(
      'x'.repeat(PARSE_VOICE_MAX_TEXT_LENGTH),
    );
  });

  it('tanpa konteks tetap valid (tidak mengarang)', () => {
    const prompt = buildParseVoicePrompt({
      text: 'kopi 12rb',
      categories: [],
      wallets: [],
      timezone: 'Asia/Jakarta',
    });
    expect(prompt).toContain('tidak ada kategori');
    expect(prompt).toContain('tidak ada dompet');
  });

  it('contoh semantik memakai nama seed persis (bukan label karangan)', () => {
    const prompt = buildParseVoicePrompt({
      text: 'americano 15rb',
      categories: ALLOWED.categories,
      wallets: ALLOWED.wallets,
      timezone: 'Asia/Jakarta',
    });
    expect(prompt).toContain('[SYSTEM INSTRUCTION]');
    expect(prompt).toContain('Makanan');
    expect(prompt).toContain('Transportasi');
    expect(prompt).not.toContain('Makanan & Minuman');
  });

  it('kategori custom ikut tersuntik ke daftar resmi', () => {
    const prompt = buildParseVoicePrompt({
      text: 'kopi 12rb',
      categories: ALLOWED.categories,
      wallets: ALLOWED.wallets,
      timezone: 'Asia/Jakarta',
    });
    expect(prompt).toContain('Kopi Susu Tetangga (expense)');
  });
});

describe('stripCodeFence + parseModelJson', () => {
  it('fence json dikupas', () => {
    expect(stripCodeFence('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('teks polos lolos apa adanya', () => {
    expect(parseModelJson('{"amount":1}')).toEqual({ amount: 1 });
  });

  it('bukan JSON jadi null', () => {
    expect(parseModelJson('maaf tidak bisa')).toBeNull();
  });
});

describe('validateAiVoicePayload: kontrak strict', () => {
  it('payload valid lolos utuh', () => {
    expect(validateAiVoicePayload(validPayload(), ALLOWED, 'fallback')).toEqual({
      amount: 30000,
      kind: 'expense',
      walletHint: 'Cash',
      categoryHint: 'Makanan',
      note: 'soto mie',
      occurred_on: null,
    });
  });

  it.each([[0], [-5], [12.5], ['55000'], [AI_VOICE_MAX_AMOUNT + 1]])(
    'amount %s menolak seluruh payload',
    (amount) => {
      expect(
        validateAiVoicePayload(validPayload({ amount }), ALLOWED, 'fb'),
      ).toBeNull();
    },
  );

  it.each([['transfer'], ['EXPENSE'], [null], [42]])(
    'kind %s menolak seluruh payload',
    (kind) => {
      expect(
        validateAiVoicePayload(validPayload({ kind }), ALLOWED, 'fb'),
      ).toBeNull();
    },
  );

  it('categoryHint liar jadi null, bukan kategori baru', () => {
    expect(
      validateAiVoicePayload(
        validPayload({ categoryHint: 'Kripto Elon' }),
        ALLOWED,
        'fb',
      ),
    ).toMatchObject({ categoryHint: null, amount: 30000 });
  });

  it('walletHint liar jadi null', () => {
    expect(
      validateAiVoicePayload(
        validPayload({ walletHint: 'Dompet Mars' }),
        ALLOWED,
        'fb',
      ),
    ).toMatchObject({ walletHint: null });
  });

  it('pencocokan hint tak peduli kapital', () => {
    expect(
      validateAiVoicePayload(
        validPayload({ walletHint: 'cash', categoryHint: 'makanan' }),
        ALLOWED,
        'fb',
      ),
    ).toMatchObject({ walletHint: 'Cash', categoryHint: 'Makanan' });
  });

  it('kategori beda kind jadi null (expense vs Gaji)', () => {
    expect(
      validateAiVoicePayload(
        validPayload({ categoryHint: 'Gaji' }),
        ALLOWED,
        'fb',
      ),
    ).toMatchObject({ categoryHint: null });
  });

  it('note dipotong 200, kosong pakai fallback', () => {
    const long = validateAiVoicePayload(
      validPayload({ note: 'n'.repeat(300) }),
      ALLOWED,
      'fb',
    );
    expect(long?.note.length).toBe(200);
    const empty = validateAiVoicePayload(
      validPayload({ note: '' }),
      ALLOWED,
      'ucapan asli',
    );
    expect(empty?.note).toBe('ucapan asli');
  });

  it('occurred_on valid lolos, asing jadi null', () => {
    expect(
      validateAiVoicePayload(
        validPayload({ occurred_on: '2026-09-12' }),
        ALLOWED,
        'fb',
      ),
    ).toMatchObject({ occurred_on: '2026-09-12' });
    expect(
      validateAiVoicePayload(
        validPayload({ occurred_on: '12/09/26' }),
        ALLOWED,
        'fb',
      ),
    ).toMatchObject({ occurred_on: null });
    expect(
      validateAiVoicePayload(
        validPayload({ occurred_on: '2026-02-30' }),
        ALLOWED,
        'fb',
      ),
    ).toMatchObject({ occurred_on: null });
  });

  it('bukan objek jadi null', () => {
    expect(validateAiVoicePayload(null, ALLOWED, 'fb')).toBeNull();
    expect(validateAiVoicePayload('ok', ALLOWED, 'fb')).toBeNull();
  });
});

describe('extractGeminiText: bentuk candidates', () => {
  it('teks pertama diambil', () => {
    expect(
      extractGeminiText({
        candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }],
      }),
    ).toBe('{"a":1}');
  });

  it.each([[null], [{}], [{ candidates: [] }], [{ candidates: [{}] }]])(
    'bentuk asing jadi null (%s)',
    (data) => {
      expect(extractGeminiText(data)).toBeNull();
    },
  );
});

describe('fetchGeminiText: retryable vs permanen', () => {
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

  it('200 + teks kandidat → tidak retry', async () => {
    stubFetch(200, {
      candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }],
    });
    await expect(fetchGeminiText('k', 'm', 'p')).resolves.toEqual({
      text: '{"a":1}',
      retryable: false,
      status: 200,
    });
  });

  it.each([[400], [401], [403], [404]])(
    '%s permanen → tidak retry',
    async (status) => {
      stubFetch(status, { error: { message: 'nope' } });
      await expect(fetchGeminiText('k', 'm', 'p')).resolves.toEqual({
        text: null,
        retryable: false,
        status,
      });
    },
  );

  it.each([[429], [500], [503]])('%s transien → retry', async (status) => {
    stubFetch(status, { error: { message: 'busy' } });
    await expect(fetchGeminiText('k', 'm', 'p')).resolves.toMatchObject({
      text: null,
      retryable: true,
      status,
    });
  });

  it('jaringan putus → retry (status 0)', async () => {
    global.fetch = (async () => {
      throw new Error('down');
    }) as typeof fetch;
    await expect(fetchGeminiText('k', 'm', 'p')).resolves.toMatchObject({
      text: null,
      retryable: true,
      status: 0,
    });
  });
});
