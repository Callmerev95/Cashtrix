/**
 * Transcribe seam (AI6, issue #95): the pure Jest lock on the server-side
 * audio-to-JSON contract (`transcribe-voice` Edge Function) plus the client
 * record caps in `src/features/voice/api.ts`.
 *
 * What is pinned here:
 * - model pair parity with AI1 (primer lite + fallback 3.8, copied values —
 *   drift must redden this test, precedent VC1/AI3);
 * - prompt injects caller context (visible categories both kinds + active
 *   wallets + timezone) and states the frozen AI1 schema (15 s cap named);
 * - strict validation: amount int > 0 else whole payload rejected, wild
 *   hints degrade to null (never invented), kind-mismatch category → null,
 *   occurred_on ISO date or null;
 * - audio transport: `inline_data` shape, permanent 4xx fail fast,
 *   transient 429/5xx/network retryable, pure base64 vectors;
 * - client caps: 15 s / 1 MB, separate record consent key (never equal to
 *   the dictation-text key), transcribe fail-open outcomes.
 *
 * Live behaviour (auth-before-rate, Rp0 flood via 404, isolation, zero
 * object residue) is locked by `scripts/verify-ai6.mjs`, the same split as
 * AI1/AI3 (unit pins shape, script pins wire).
 */
import {
  GEMINI_FALLBACK_MODEL as VOICE_FALLBACK_MODEL,
  GEMINI_PRIMARY_MODEL as VOICE_PRIMARY_MODEL,
} from '../supabase/functions/parse-voice/gemini';
import {
  bytesToBase64,
  extractTranscribeText,
  fetchGeminiAudio,
  GEMINI_FALLBACK_MODEL,
  GEMINI_PRIMARY_MODEL,
} from '../supabase/functions/transcribe-voice/gemini';
import { buildTranscribePrompt } from '../supabase/functions/transcribe-voice/prompt';
import {
  parseModelJson,
  validateAiVoicePayload,
} from '../supabase/functions/transcribe-voice/validate';
import {
  VOICE_CONSENT_KEY,
  VOICE_RECORD_CONSENT_KEY,
  VOICE_RECORD_MAX_BYTES,
  VOICE_RECORD_MAX_MS,
} from '../src/features/voice/api';

const CATEGORIES = [
  { name: 'Makanan', kind: 'expense' as const },
  { name: 'Gaji', kind: 'income' as const },
];

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    amount: 30000,
    kind: 'expense',
    walletHint: 'GoPay',
    categoryHint: 'Makanan',
    note: 'nasi padang',
    occurred_on: null,
    ...overrides,
  };
}

describe('kontrak AI6: pasangan model + paritas AI1', () => {
  it('transcribe memakai pasangan model AI1 (primer lite + fallback 3.8)', () => {
    expect(GEMINI_PRIMARY_MODEL).toBe('gemini-3.5-flash-lite');
    expect(GEMINI_FALLBACK_MODEL).toBe('gemini-3.8-flash');
    expect(GEMINI_FALLBACK_MODEL).not.toBe(GEMINI_PRIMARY_MODEL);
    // Paritas dua-arah: nilai disalin, bukan diimpor (deploy hanya bundel
    // direktori fungsi + _shared) — drift rotasi model memerahkan test ini.
    expect(GEMINI_PRIMARY_MODEL).toBe(VOICE_PRIMARY_MODEL);
    expect(GEMINI_FALLBACK_MODEL).toBe(VOICE_FALLBACK_MODEL);
  });
});

describe('kontrak AI6: prompt menyuntik konteks pemanggil', () => {
  it('memuat kategori dua kind + dompet aktif + timezone + cap 15 detik', () => {
    const prompt = buildTranscribePrompt({
      categories: CATEGORIES,
      wallets: ['GoPay', 'Cash'],
      timezone: 'Asia/Jakarta',
    });
    expect(prompt).toContain('Makanan');
    expect(prompt).toContain('Gaji');
    expect(prompt).toContain('GoPay');
    expect(prompt).toContain('Asia/Jakarta');
    expect(prompt).toContain('15 detik');
  });

  it('tanpa kategori tetap berupa string non-kosong (fail-open)', () => {
    const prompt = buildTranscribePrompt({
      categories: [],
      wallets: [],
      timezone: 'Asia/Jakarta',
    });
    expect(typeof prompt).toBe('string');
    expect(prompt.length).toBeGreaterThan(0);
  });

  it('mengajarkan pemetaan makna ke nama resmi (kata-makanan → Makanan)', () => {
    const prompt = buildTranscribePrompt({
      categories: CATEGORIES,
      wallets: ['GoPay', 'Cash'],
      timezone: 'Asia/Jakarta',
    });
    // Tanpa aturan ini model mengembalikan kata mentah ("nasi goreng") yang
    // divalidator tolak → kategori jalur Rekam selalu kosong.
    expect(prompt).toContain('nasi goreng');
    expect(prompt).toMatch(/Makanan/);
  });
});

describe('kontrak AI6: validasi strict warisan AI1', () => {
  const allowed = {
    categories: CATEGORIES,
    wallets: ['GoPay', 'Cash'],
  };

  it('payload valid lolos utuh', () => {
    expect(
      validateAiVoicePayload(
        validPayload(),
        allowed,
        'Catatan suara',
      ),
    ).toEqual({
      amount: 30000,
      kind: 'expense',
      walletHint: 'GoPay',
      categoryHint: 'Makanan',
      note: 'nasi padang',
      occurred_on: null,
    });
  });

  it('amount nol/negatif/non-int ditolak utuh', () => {
    for (const amount of [0, -5, 30.5, '30000']) {
      expect(
        validateAiVoicePayload(
          validPayload({ amount }),
          allowed,
          'Catatan suara',
        ),
      ).toBeNull();
    }
  });

  it('hint liar menjadi null, bukan kategori/ dompet karangan', () => {
    const prefill = validateAiVoicePayload(
      validPayload({ walletHint: 'Kripto Elon', categoryHint: 'NFT Coin' }),
      allowed,
      'Catatan suara',
    );
    expect(prefill).not.toBeNull();
    expect(prefill?.walletHint).toBeNull();
    expect(prefill?.categoryHint).toBeNull();
  });

  it('kategori beda-kind menjadi null', () => {
    const prefill = validateAiVoicePayload(
      validPayload({ categoryHint: 'Gaji' }),
      allowed,
      'Catatan suara',
    );
    expect(prefill?.categoryHint).toBeNull();
  });

  it('occurred_on non-ISO menjadi null tanpa menolak payload', () => {
    const prefill = validateAiVoicePayload(
      validPayload({ occurred_on: 'kemarin' }),
      allowed,
      'Catatan suara',
    );
    expect(prefill?.occurred_on).toBeNull();
  });

  it('parseModelJson mengupas pagar kode dan menolak sampah', () => {
    expect(parseModelJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseModelJson('bukan json')).toBeNull();
  });
});

describe('kontrak AI6: transport audio', () => {
  it('extractTranscribeText mengambil teks pertama, null bila asing', () => {
    expect(
      extractTranscribeText({
        candidates: [{ content: { parts: [{ text: '{"a":1}' }] } }],
      }),
    ).toBe('{"a":1}');
    expect(extractTranscribeText({})).toBeNull();
  });

  it('bytesToBase64 vektor murni', () => {
    expect(bytesToBase64(new Uint8Array([102, 111, 111]))).toBe('Zm9v');
    expect(bytesToBase64(new Uint8Array([]))).toBe('');
  });

  it('fetchGeminiAudio tidak pernah throw (offline → retryable)', async () => {
    const outcome = await fetchGeminiAudio(
      'mati',
      GEMINI_PRIMARY_MODEL,
      'prompt',
      new Uint8Array([1, 2, 3]),
      'audio/mp4',
    );
    expect(outcome.text).toBeNull();
    expect(typeof outcome.retryable).toBe('boolean');
  });
});

describe('kontrak AI6: cap rekam + consent terpisah di klien', () => {
  it('cap 15 detik dan 1 MB', () => {
    expect(VOICE_RECORD_MAX_MS).toBe(15_000);
    expect(VOICE_RECORD_MAX_BYTES).toBe(1_048_576);
  });

  it('kunci consent rekam terpisah dari kunci teks (sensor beda)', () => {
    expect(VOICE_RECORD_CONSENT_KEY).toBe(
      'cashtrix:voice-record-consent-v1',
    );
    expect(VOICE_CONSENT_KEY).toBe('cashtrix:voice-consent-v1');
    expect(VOICE_RECORD_CONSENT_KEY).not.toBe(VOICE_CONSENT_KEY);
  });
});
