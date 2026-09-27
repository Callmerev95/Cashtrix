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

import { dictionaryFor, fill } from '@/i18n/dictionaries';
import { id } from '@/i18n/id';
import type { Language } from '@/i18n/locale';

/** One utterance yields one transaction (ADR-0010): anything else refuses. */
export type VoiceParseStatus =
  | 'ok'
  | 'needAmount'
  | 'multiAmount'
  | 'wordsOnly'
  | 'transferRefused';

/**
 * Split statuses (WG1, issue #70 — spec `specs/cashtrix-v2.0-widget.md` §WG1,
 * ADR-0011): the VC1 refusals plus the two whole-utterance split refusals.
 * `VoiceParseStatus` above stays frozen — `parseVoiceText` never returns the
 * split-only literals.
 */
export type VoiceSplitStatus =
  | VoiceParseStatus
  | 'tooManyClauses'
  | 'mixedKind';

/** At most three transactions per utterance (ADR-0011, owner-approved). */
export const MAX_SPLIT_CLAUSES = 3;

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
 * Copy for the widget-save local notification (WG2, ADR-0011): "N
 * transaksi, Total RpX" through the central dictionary. `total` arrives
 * preformatted (same pattern as the budget `alertCopy`) — the caller
 * renders digits with `formatGrouped`, this only composes words.
 */
export function widgetSaveCopy(
  input: { count: number; total: string },
  lang: Language = 'id',
): { title: string; body: string } {
  const copy = dictionaryFor(lang).voice;
  return {
    title: fill(copy.splitSavedTitle, { count: input.count }),
    body: fill(copy.splitSavedBody, { total: input.total }),
  };
}
/**
 * Whole-split refusal copy (WG1): the VC1 keys delegate to
 * `voiceRefusalMessage` (so a failed row's `reason` resolves through the
 * same path), the two split-only keys read the new dictionary entries.
 * `mixedKind` is composed from the `transactions.type.*` kind labels —
 * never hardcoded kind words.
 */
export function voiceSplitRefusalMessage(
  status: Exclude<VoiceSplitStatus, 'ok'>,
  lang: Language = 'id',
): string {
  const dictionary = dictionaryFor(lang);
  if (status === 'tooManyClauses') return dictionary.voice.tooManyClauses;
  if (status === 'mixedKind') {
    return fill(dictionary.voice.mixedKind, {
      expense: dictionary.transactions.type.expense,
      income: dictionary.transactions.type.income,
    });
  }
  return voiceRefusalMessage(status, lang);
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

/**
 * Clause separators (WG1, owner-approved): comma/semicolon plus the small
 * locked word list `dan/terus/lalu/plus/kemudian`. `dengan`/`sama` are
 * deliberately NOT separators — they break phrases like "kopi dengan gula
 * 12rb" into a phantom clause. Word boundaries keep "kemudian" from firing
 * inside other words; empty segments (leading/trailing/doubled separators)
 * are dropped.
 */
const CLAUSE_SPLIT = /\s*[,;]\s*|\s+(?:dan|terus|lalu|plus|kemudian)\s+/gi;

/** Non-empty trimmed clauses of an utterance, in spoken order. */
export function splitVoiceClauses(text: string): string[] {
  return text
    .split(CLAUSE_SPLIT)
    .map((clause) => clause.trim())
    .filter((clause) => clause.length > 0);
}

/** A successfully parsed split row: the VC1 prefill of one clause. */
export type VoiceSplitOkRow = { ok: true } & VoicePrefill;

/**
 * A failed split row (F1a): the raw clause text plus the VC1 status key
 * explaining why (`needAmount` | `multiAmount` | `wordsOnly`) — the WG2
 * sheet resolves `reason` through `voiceRefusalMessage` and hands `text`
 * back for manual typing, so nothing intelligible is ever thrown away.
 */
export type VoiceSplitFailedRow = {
  ok: false;
  text: string;
  reason: 'needAmount' | 'multiAmount' | 'wordsOnly';
};

export type VoiceSplitRow = VoiceSplitOkRow | VoiceSplitFailedRow;

export type VoiceSplitResult =
  | {
      status: 'ok';
      /** All rows share one kind — mixed kinds refuse, never split. */
      kind: VoiceTransactionKind;
      rows: VoiceSplitRow[];
    }
  | { status: Exclude<VoiceSplitStatus, 'ok'> };

/**
 * Parses one clause with the VC1 rules (digit-ID amounts, honest
 * number-words refusal, per-clause income keywords, substring wallet,
 * category hint). A clause with zero amounts is a `needAmount`/`wordsOnly`
 * failure; a clause with two or more is a `multiAmount` failure
 * (owner-approved: never a whole-utterance refusal, never a guess).
 */
function parseVoiceClause(
  clause: string,
  wallets: VoiceWallet[],
): VoiceSplitRow {
  const amounts: number[] = [];
  for (const span of clause.matchAll(AMOUNT_SPAN)) {
    const value = parseVoiceAmountToken(span[0]);
    if (value !== null) amounts.push(value);
  }
  if (amounts.length === 0) {
    return {
      ok: false,
      text: clause,
      reason: NUMBER_WORDS.test(clause) ? 'wordsOnly' : 'needAmount',
    };
  }
  if (amounts.length > 1) {
    return { ok: false, text: clause, reason: 'multiAmount' };
  }
  return {
    ok: true,
    amount: amounts[0],
    kind: INCOME_WORDS.test(clause) ? 'income' : 'expense',
    walletId: suggestVoiceWallet(clause, wallets),
    categoryHint: hintVoiceCategory(clause),
    note: clause,
  };
}

/**
 * One utterance → up to three same-kind rows (WG1). Order is deliberate:
 * transfer refuses before clauses are even counted (no two-wallet
 * guessing); one clause delegates to `parseVoiceText` so VC1 behaviour is
 * bit-identical; more than three clauses refuses whole; mixed expense +
 * income refuses whole (no kind guessing); otherwise each clause parses
 * under the VC1 rules and amount-less/multi-amount clauses come back as
 * failed rows carrying their raw text (F1a).
 */
export function parseVoiceSplit(
  text: string,
  wallets: VoiceWallet[] = [],
): VoiceSplitResult {
  const note = text.trim();
  if (TRANSFER_WORDS.test(note)) return { status: 'transferRefused' };
  const clauses = splitVoiceClauses(note);
  // Only separators/whitespace in, nothing out: no digits are possible here
  // (separator words are not number words), so this is plain `needAmount`
  // — matching `parseVoiceText('')`.
  if (clauses.length === 0) return { status: 'needAmount' };
  if (clauses.length === 1) {
    const single = parseVoiceText(note, wallets);
    if (single.status !== 'ok') return { status: single.status };
    return {
      status: 'ok',
      kind: single.kind,
      rows: [
        {
          ok: true,
          amount: single.amount,
          kind: single.kind,
          walletId: single.walletId,
          categoryHint: single.categoryHint,
          note: single.note,
        },
      ],
    };
  }
  if (clauses.length > MAX_SPLIT_CLAUSES) return { status: 'tooManyClauses' };
  const rows = clauses.map((clause) => parseVoiceClause(clause, wallets));
  // Nothing savable: collapse to the VC1 whole-utterance refusal (F1a only
  // covers partial failure — an all-failed "ok" would offer Catat with
  // zero savable rows).
  if (!rows.some((row) => row.ok)) {
    return { status: NUMBER_WORDS.test(note) ? 'wordsOnly' : 'needAmount' };
  }
  const kinds = new Set(
    rows.filter((row) => row.ok).map((row) => row.kind),
  );
  if (kinds.size > 1) return { status: 'mixedKind' };
  return {
    status: 'ok',
    kind: [...kinds][0],
    rows,
  };
}
