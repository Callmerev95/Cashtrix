/**
 * Voice capture parser (VC1, issue #63 — spec `specs/cashtrix-voice-capture.md`
 * §VC3, ADR-0010). Pure (no bridge) Jest seam: OS speech-to-text hands the
 * app plain text, this module reads ONE digit amount out of it. Everything
 * else — wallet, category — is a preselect hint, never a locked value.
 *
 * Amount semantics reuse the S3 pattern (`supabase/functions/scan-receipt/
 * parse.ts`, Opsi A′ — copied, not imported: `tsconfig` excludes
 * `supabase/functions` and no `src/` module has ever depended on it). The
 * `juta`/`jt` suffix is the one voice-only extension (STT hears "gajian
 * 5 juta", receipts never say it). A parity test pins both implementations
 * to the same vectors, so S3 drift turns the suite red instead of silent.
 *
 * Copy lives in the central dictionary (ADR-0008): statuses double as
 * `voice` keys, resolved via `dictionaryFor(lang)` — the same pattern as
 * `transferMessages` in transactions.
 */

import { dictionaryFor } from '@/i18n/dictionaries';
import { id } from '@/i18n/id';
import type { Language } from '@/i18n/locale';

/** One utterance yields one transaction (ADR-0010): anything else refuses. */
export type VoiceParseStatus =
  | 'ok'
  | 'needAmount'
  | 'multiAmount'
  | 'wordsOnly'
  | 'transferRefused';

export type VoiceTransactionKind = 'expense' | 'income';

/** Minimal wallet shape the parser matches against (active wallets only —
 * the caller filters, the parser never knows about archiving). */
export type VoiceWallet = {
  id: string;
  name: string;
};

export type VoiceParseResult =
  | ({ status: 'ok' } & VoicePrefill)
  | { status: 'needAmount' | 'multiAmount' | 'wordsOnly' | 'transferRefused' };

/**
 * The prefill a successful parse hands to the form (VC2): nominal + kind +
 * hints + the utterance itself. The form gap-fills its fields from this in
 * an event handler (never an effect) — the same discipline as the S3
 * prefill, so a post-save refetch can never stomp it.
 */
export type VoicePrefill = {
  amount: number;
  kind: VoiceTransactionKind;
  /** Wallet id whose name was heard, or null (picker stays manual). */
  walletId: string | null;
  /** Category *name hint* (S3 contract) — the form resolves it against
   * visible categories; a miss simply means no suggestion. */
  categoryHint: string | null;
  /** Trimmed utterance, for the sheet echo (VC2) and the note field. */
  note: string;
};

/**
 * Normalises one Indonesian amount token to integer rupiah. S3 semantics,
 * verbatim: `30.000`/`30,000` → 30000 (thousand grouping), `Rp30rb`/`30rb`/
 * `30 ribu` → 30000, `30.000,50` → 30000 (minor units dropped — the form
 * only takes whole rupiah). Returns null when the token is not an amount.
 */
export function parseVoiceAmountToken(token: string): number | null {
  const cleaned = token.replace(/rp\.?/i, '').trim();
  const rb = cleaned.match(/^([\d.,]+)\s*(rb|ribu)$/i);
  if (rb) {
    const digits = rb[1].replace(/[.,]/g, '');
    if (!/^\d+$/.test(digits)) return null;
    const value = Number(digits) * 1000;
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  const juta = cleaned.match(/^([\d.,]+)\s*(juta|jt)$/i);
  if (juta) {
    return parseJutaAmount(juta[1]);
  }
  if (!/^[\d.,]+$/.test(cleaned)) return null;
  const hasDot = cleaned.includes('.');
  const hasComma = cleaned.includes(',');
  if (hasDot && hasComma) {
    // Format Indonesia penuh: titik = ribuan, koma = desimal —
    // minor units dibuang (form hanya menerima rupiah utuh).
    const intDigits = cleaned.split(',')[0].replace(/\D/g, '');
    if (!/^\d+$/.test(intDigits)) return null;
    const value = Number(intDigits);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  const sep = hasDot ? '.' : hasComma ? ',' : null;
  if (sep === null) {
    const value = Number(cleaned);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  const groups = cleaned.split(sep);
  const trailing = groups.slice(1);
  // `30.000` / `30,000`: tiap grup belakang tepat 3 digit = ribuan.
  if (
    trailing.length >= 1 &&
    /^\d{1,3}$/.test(groups[0]) &&
    trailing.every((group) => /^\d{3}$/.test(group))
  ) {
    const value = Number(groups.join(''));
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  // Satu separator + 1–2 digit pecahan = desimal (`45.5` → 46). Bentuk lain
  // (`30.00.00`) ditolak — bukan tebakan.
  if (
    groups.length === 2 &&
    /^\d+$/.test(groups[0]) &&
    /^\d{1,2}$/.test(groups[1])
  ) {
    const value = Math.round(Number(`${groups[0]}.${groups[1]}`));
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  return null;
}

/**
 * Voice-only extension: `5 juta` / `2,5 juta` / `25jt` → integer rupiah.
 * The separator before `juta` is always read as a DECIMAL (`2,5` → 2.5,
 * never 25) — STT emits digits for spoken decimals, thousand-grouped
 * millions ("1.000.000 juta") never occur in an utterance and are refused
 * rather than guessed. Non-integer rupiah results are refused.
 */
function parseJutaAmount(numPart: string): number | null {
  const hasDot = numPart.includes('.');
  const hasComma = numPart.includes(',');
  let intPart = numPart;
  let fracPart = '';
  if (hasDot && hasComma) {
    const head = numPart.split(',')[0].replace(/\D/g, '');
    const tail = numPart.split(',').slice(1).join('');
    intPart = head;
    fracPart = tail;
  } else if (hasDot || hasComma) {
    const groups = numPart.split(hasDot ? '.' : ',');
    if (groups.length !== 2) return null;
    intPart = groups[0];
    fracPart = groups[1];
  }
  if (!/^\d+$/.test(intPart)) return null;
  if (fracPart !== '' && !/^\d{1,3}$/.test(fracPart)) return null;
  const value =
    Number(fracPart !== '' ? `${intPart}.${fracPart}` : intPart) * 1000000;
  return Number.isSafeInteger(value) && value > 0 ? value : null;
}

/** One amount-shaped span: `30.000`, `30 ribu`, `25rb`, `Rp30.000`, `5 juta`. */
const AMOUNT_SPAN = /(rp\.?\s*)?\d[\d.,]*\s*(rb|ribu|juta|jt)?/gi;
/** Transfer is refused over voice and directed to the form (ADR-0010). */
const TRANSFER_WORDS = /transfer|\btf\b|kirim\s+(ke|uang)|pindah\s+dana/i;

/** Small ID keyword list: expense is the default, these flip to income. */
const INCOME_WORDS = /\bgaji\w*|\bdapat\b|\bmasuk\b|\bterima\w*/i;

/**
 * Full number words with no digit anywhere ("tiga puluh ribu",
 * "setengah juta") — honestly refused in v1, never guessed.
 */
const NUMBER_WORDS =
  /\b(satu|dua|tiga|empat|lima|enam|tujuh|delapan|sembilan|sepuluh|sebelas|belas|puluh|ratus|ribu|juta|miliar|setengah|seperempat|seribu|sejuta|seratus)\b/i;

/**
 * Category *name hints* — the S3 `HINT_TABLE` pattern (CONTEXT.md
 * "Saran kategori (suara)": accept or replace, never locked). Names match
 * the system categories, so the form resolves them the same way it
 * resolves OCR hints.
 */
const HINT_TABLE: { hint: string; match: RegExp }[] = [
  { hint: 'Makanan', match: /kopi|coffee|starbucks|americano|latte|espresso|kafe|cafe|makan|resto|restoran|warung|ayam|bakso|soto|mie|noodle|burger|pizza|sushi|padang|kuliner|minum|jus|boba|teh/ },
  { hint: 'Belanja', match: /mart|market|toko|store|shop|mall|swalayan|belanja|retail|grosir/ },
  { hint: 'Transportasi', match: /bensin|shell|pertamina|parkir|tol|gojek|grab|taksi|taxi|kereta|bus\b|tiket|pesawat|lion|garuda|mrt|lrt/ },
  { hint: 'Kesehatan', match: /apotek|klinik|dokter|sehat|rs\b|puskesmas|lab\b/ },
  { hint: 'Hiburan', match: /bioskop|xxi|cgv|cinema|karaoke|game|netflix|spotify|konser/ },
  { hint: 'Tagihan', match: /pln|pdam|telkom|indihome|listrik|air|internet|pulsa|pascabayar/ },
];

/** Category name hint for an utterance, or null (no suggestion). */
export function hintVoiceCategory(text: string): string | null {
  const lowered = text.toLowerCase();
  for (const entry of HINT_TABLE) {
    if (entry.match.test(lowered)) return entry.hint;
  }
  return null;
}

/**
 * Wallet preselect ("Saran dompet", CONTEXT.md): the first wallet whose
 * name appears as a substring of the utterance wins. Names shorter than 3
 * characters are skipped — a 1–2 letter "match" is noise, not a mention.
 * Returns the wallet id, or null when nothing was heard.
 */
export function suggestVoiceWallet(
  text: string,
  wallets: VoiceWallet[],
): string | null {
  const lowered = text.toLowerCase();
  for (const wallet of wallets) {
    const name = wallet.name.trim().toLowerCase();
    if (name.length < 3) continue;
    if (lowered.includes(name)) return wallet.id;
  }
  return null;
}

/**
 * Parses `?voice=` from the voice alias (`cashtrix://voice` → `voice=1`,
 * VC3 following the S1 `parseScanFlag` pattern). Only the exact `voice=1`
 * the alias emits arms voice-first mode (panel auto-open); anything else —
 * missing, `0`, free text — is a plain create.
 */
export function parseVoiceFlag(value: unknown): boolean {
  return value === '1';
}

export const voiceMessages = {  needAmount: id.voice.needAmount,
  multiAmount: id.voice.multiAmount,
  wordsOnly: id.voice.wordsOnly,
  transferRefused: id.voice.transferRefused,
} as const;

/**
 * Refusal copy in the active language (C6); the default keeps the locked
 * id-ID behaviour. Statuses double as `voice` dictionary keys by design.
 */
export function voiceRefusalMessage(
  status: Exclude<VoiceParseStatus, 'ok'>,
  lang: Language = 'id',
): string {
  return dictionaryFor(lang).voice[status];
}

/**
 * One utterance → one parse result (spec §VC3). Order is deliberate:
 * transfer refuses before amounts are even counted (no two-wallet guessing),
 * then the amount census (0 → need, ≥2 → multi), then the honest
 * number-words refusal. Only a single digit amount reaches type/wallet/
 * category detection.
 *
 * Known v1 limit, documented not fixed: a bare date ("tanggal 12") reads
 * as a second amount and trips `multiAmount` — the manual fallback covers
 * it, and teaching dates is future work, not a silent rule.
 */
export function parseVoiceText(
  text: string,
  wallets: VoiceWallet[] = [],
): VoiceParseResult {
  const note = text.trim();
  if (TRANSFER_WORDS.test(note)) return { status: 'transferRefused' };
  const amounts: number[] = [];
  for (const span of note.matchAll(AMOUNT_SPAN)) {
    const value = parseVoiceAmountToken(span[0]);
    if (value !== null) amounts.push(value);
  }
  if (amounts.length === 0) {
    return { status: NUMBER_WORDS.test(note) ? 'wordsOnly' : 'needAmount' };
  }
  if (amounts.length > 1) return { status: 'multiAmount' };
  return {
    status: 'ok',
    amount: amounts[0],
    kind: INCOME_WORDS.test(note) ? 'income' : 'expense',
    walletId: suggestVoiceWallet(note, wallets),
    categoryHint: hintVoiceCategory(note),
    note,
  };
}
