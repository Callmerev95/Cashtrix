/**
 * AI golden set (AI2, issue #91): benteng anti prompt-drift, 40 kasus.
 *
 * Arsitektur fail-safe (keputusan pemilik): Jest di CI berjalan
 * deterministik tanpa secret. Pipa suara (20) = pin isi prompt + replay
 * validator atas `modelJson` rekaman (output model dari run live hijau,
 * bukan karangan); pipa struk (20) = parser murni `parseReceiptText`
 * langsung atas teks OCR. Validasi live runtime terhadap drift vendor
 * tetap eksklusif di `scripts/verify-ai-voice.mjs`.
 *
 * Gate: pass = nominal tepat + kind tepat (suara) + categoryHint
 * valid-atau-null; threshold merge 36/40; kategori liar di output = FAIL
 * mutlak (toleransi nol) walau hitungan pass terpenuhi. Satu `it` agregator
 * (bukan 40 `it`) karena Jest tidak punya konsep lulus parsial.
 */
import { buildParseVoicePrompt } from '../supabase/functions/parse-voice/prompt';
import {
  parseModelJson,
  validateAiVoicePayload,
  type AllowedCategory,
} from '../supabase/functions/parse-voice/validate';
import { parseReceiptText } from '../supabase/functions/scan-receipt/parse';
import { GOLDEN_RECEIPT_CASES } from './fixtures/ai-golden-receipt';
import { GOLDEN_VOICE_CASES } from './fixtures/ai-golden-voice';

/** Konteks beku golden set: subset seed sistem + 1 custom + 2 dompet. */
const GOLDEN_CATEGORIES: AllowedCategory[] = [
  { name: 'Makanan', kind: 'expense' },
  { name: 'Transportasi', kind: 'expense' },
  { name: 'Belanja', kind: 'expense' },
  { name: 'Tagihan', kind: 'expense' },
  { name: 'Hiburan', kind: 'expense' },
  { name: 'Kesehatan', kind: 'expense' },
  { name: 'Gaji', kind: 'income' },
  { name: 'Bonus', kind: 'income' },
  { name: 'Kopi Susu Tetangga', kind: 'expense' },
];

const GOLDEN_WALLETS: string[] = ['Cash', 'Bank'];

/** Threshold merge ke main (AC #91): minimal 36/40. */
const GOLDEN_PASS_THRESHOLD = 36;

const TOTAL_GOLDEN_CASES =
  GOLDEN_VOICE_CASES.length + GOLDEN_RECEIPT_CASES.length;

function isKnownCategory(hint: string): boolean {
  return GOLDEN_CATEGORIES.some(
    (c) => c.name.toLowerCase() === hint.toLowerCase(),
  );
}

function isKnownWallet(hint: string): boolean {
  return GOLDEN_WALLETS.some((w) => w.toLowerCase() === hint.toLowerCase());
}

describe('golden prompt pin: hapus semantik = merah', () => {
  it('prompt suara menyuntik skema beku + peta slang + nama seed persis', () => {
    const prompt = buildParseVoicePrompt({
      text: 'kopi goceng',
      categories: GOLDEN_CATEGORIES,
      wallets: GOLDEN_WALLETS,
      timezone: 'Asia/Jakarta',
    });
    expect(prompt).toContain('"amount"');
    expect(prompt).toContain('goceng=5000');
    expect(prompt).toContain('"1,5 juta"=1500000');
    expect(prompt).toContain('Makanan (expense)');
    expect(prompt).toContain('Transportasi (expense)');
    expect(prompt).toContain('Gaji (income)');
    expect(prompt).toContain('Kopi Susu Tetangga (expense)');
    expect(prompt).toContain('Cash');
    expect(prompt).toContain('Asia/Jakarta');
    expect(prompt).not.toContain('Makanan & Minuman');
  });

  it('set golden genap 40 (20 suara + 20 struk)', () => {
    expect(GOLDEN_VOICE_CASES.length).toBe(20);
    expect(GOLDEN_RECEIPT_CASES.length).toBe(20);
    expect(TOTAL_GOLDEN_CASES).toBe(40);
  });
});

describe('golden gate: >=36/40, liar = FAIL', () => {
  it('nominal tepat + kind tepat + hint valid-atau-null', () => {
    const misses: string[] = [];
    const wildIds: string[] = [];
    let wild = 0;
    let pass = 0;

    for (const c of GOLDEN_VOICE_CASES) {
      const out = validateAiVoicePayload(
        parseModelJson(c.modelJson),
        { categories: GOLDEN_CATEGORIES, wallets: GOLDEN_WALLETS },
        c.text,
      );
      // Kategori liar di output = FAIL mutlak (pertahanan berlapis atas
      // degradasi-null validator: bila validator masa depan meloloskan
      // string asing, gate ini yang memerahkannya).
      if (
        out?.categoryHint !== null &&
        out?.categoryHint !== undefined &&
        !isKnownCategory(out.categoryHint)
      ) {
        wild += 1;
        wildIds.push(`${c.id} hint=${out.categoryHint}`);
      }
      const walletOk =
        out?.walletHint === null || isKnownWallet(out?.walletHint ?? '');
      const ok =
        out !== null &&
        out.amount === c.expected.amount &&
        out.kind === c.expected.kind &&
        out.categoryHint === c.expected.categoryHint &&
        walletOk;
      if (ok) {
        pass += 1;
      } else {
        misses.push(`${c.id} got=${JSON.stringify(out)}`);
      }
    }

    for (const c of GOLDEN_RECEIPT_CASES) {
      const out = parseReceiptText(c.ocrText);
      if (
        out?.categoryHint !== null &&
        out?.categoryHint !== undefined &&
        !isKnownCategory(out.categoryHint)
      ) {
        wild += 1;
        wildIds.push(`${c.id} hint=${out.categoryHint}`);
      }
      const ok =
        out !== null &&
        out.amount === c.expected.amount &&
        out.categoryHint === c.expected.categoryHint;
      if (ok) {
        pass += 1;
      } else {
        misses.push(`${c.id} got=${JSON.stringify(out)}`);
      }
    }

    if (wild !== 0) {
      throw new Error(
        `golden gate FAIL: ${wild} kategori liar (toleransi nol). ${wildIds.join('; ')}`,
      );
    }
    expect(wild).toBe(0);
    // Miss di bawah threshold tidak menggagalkan (desain 90%), tapi wajib
    // terlihat di log agar tidak diam-diam membusuk.
    if (misses.length > 0 && pass >= GOLDEN_PASS_THRESHOLD) {
      console.warn(
        `golden set: ${pass}/40 lolos, miss: ${misses.join('; ')}`,
      );
    }
    if (pass < GOLDEN_PASS_THRESHOLD) {
      throw new Error(
        `golden gate FAIL: ${pass}/40 lolos (butuh >=${GOLDEN_PASS_THRESHOLD}). Misses: ${misses.join('; ')}`,
      );
    }
    expect(pass).toBeGreaterThanOrEqual(GOLDEN_PASS_THRESHOLD);
  });
});
