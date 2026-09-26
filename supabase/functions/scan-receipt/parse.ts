/**
 * Receipt text parser (S3, spec `specs/cashtrix-v1.2.md` §S3 story 11–14).
 *
 * Pure (no Deno globals) so Jest can import it as a seam, the same pattern
 * as `supabase/functions/_shared/rate-limit.ts`. The Edge Function runs this
 * over OCR text server-side; the client never sees raw OCR output.
 *
 * MVP scope (frozen): ONE total + date + merchant only. Discount/PPN/
 * multi-item lines collapse to a single total; per-item splits are explicit
 * out of scope.
 */

/** Prefill extracted from one receipt. Amounts are integer rupiah. */
export type ReceiptPrefill = {
  amount: number;
  /** ISO date `YYYY-MM-DD`, or null when the text carries no parseable date. */
  occurredOn: string | null;
  merchant: string | null;
  /** Category *name hint* (e.g. `Makanan`) — the client resolves it against
   * visible categories; a miss simply means no suggestion. */
  categoryHint: string | null;
};

/** Lines that carry money but are never the total (tender, change, tax...). */
const TENDER_LINE = /tunai|cash|kembal|change|debet|debit|kredit|credit|kartu|qr-?is|e-?money|ovo|gopay|dana|voucher|diskon|discount|ppn|pajak|service|subtotal/i;

/** Lines that usually hold the payable total. */
const TOTAL_LINE = /total|grand|jumlah|tagihan|amount/i;

const MONTHS: Record<string, number> = {
  jan: 1, january: 1, januari: 1,
  feb: 2, february: 2, februari: 2,
  mar: 3, march: 3, maret: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, june: 6, juni: 6,
  jul: 7, july: 7, juli: 7,
  agu: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oct: 10, october: 10, oktober: 10,
  nov: 11, november: 11, nop: 11, nopember: 11,
  des: 12, dec: 12, december: 12, desember: 12,
};

/**
 * `kopi → Makanan` etc. — hints only, always optional (CONTEXT.md
 * "Saran kategori": accept or replace, never locked).
 */
const HINT_TABLE: { hint: string; match: RegExp }[] = [
  { hint: 'Makanan', match: /kopi|coffee|starbucks|americano|latte|espresso|kafe|cafe|makan|resto|restoran|warung|ayam|bakso|soto|mie|noodle|burger|pizza|sushi|padang|kuliner|minum|jus|boba|teh/ },
  { hint: 'Belanja', match: /mart|market|toko|store|shop|mall|swalayan|belanja|retail|grosir/ },
  { hint: 'Transportasi', match: /bensin|shell|pertamina|parkir|tol|gojek|grab|taksi|taxi|kereta|bus\b|tiket|pesawat|lion|garuda|mrt|lrt/ },
  { hint: 'Kesehatan', match: /apotek|klinik|dokter|sehat|rs\b|puskesmas|lab\b/ },
  { hint: 'Hiburan', match: /bioskop|xxi|cgv|cinema|karaoke|game|netflix|spotify|konser/ },
  { hint: 'Tagihan', match: /pln|pdam|telkom|indihome|listrik|air|internet|pulsa|pascabayar/ },
];

/**
 * Normalises one Indonesian amount token to integer rupiah.
 * `30.000`/`30,000` → 30000 (thousand grouping), `Rp30rb`/`30rb` → 30000,
 * `30000` → 30000, `30.000,50` → 30000 (minor units dropped — the form only
 * takes whole rupiah). Returns null when the token is not an amount.
 */
export function parseAmountToken(token: string): number | null {
  const cleaned = token.replace(/rp\.?/i, '').trim();
  const rb = cleaned.match(/^([\d.,]+)\s*(rb|ribu)$/i);
  if (rb) {
    const digits = rb[1].replace(/[.,]/g, '');
    if (!/^\d+$/.test(digits)) return null;
    const value = Number(digits) * 1000;
    return Number.isSafeInteger(value) && value > 0 ? value : null;
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
  // Satu separator + 1–2 digit pecahan = desimal (`45.5` → 46). Jarang di
  // struk, tapi deterministik alih-alih salah baca ribuan. Bentuk lain
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

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

function toIsoDate(day: number, month: number, year: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 2000 || year > 2100) return null;
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

/**
 * Indonesian receipt dates: `12/09/26`, `12-09-2026`, `12.09.2026`,
 * `12 Sep 2026` (ID + EN month names). Two-digit years → 20xx. First match
 * wins. Returns an ISO date or null.
 */
export function parseReceiptDate(text: string): string | null {
  const numeric = text.match(/(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})/);
  if (numeric) {
    const day = Number(numeric[1]);
    const month = Number(numeric[2]);
    const year =
      numeric[3].length === 2 ? 2000 + Number(numeric[3]) : Number(numeric[3]);
    return toIsoDate(day, month, year);
  }
  const named = text.match(/(\d{1,2})\s+([a-z]+)\s+(\d{4})/i);
  if (named) {
    const month = MONTHS[named[2].toLowerCase()];
    if (month === undefined) return null;
    return toIsoDate(Number(named[1]), month, Number(named[3]));
  }
  return null;
}

/** First content line (≤40 chars) — the merchant letterhead on most struks. */
export function extractMerchant(text: string): string | null {
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^[^a-zA-Z0-9]+|[^a-zA-Z0-9]+$/g, '').trim();
    if (line.replace(/[^a-zA-Z0-9]/g, '').length >= 2 && line.length <= 40) {
      return line;
    }
  }
  return null;
}

/** Category name hint for a merchant string, or null (no suggestion). */
export function hintCategoryForMerchant(merchant: string | null): string | null {
  if (!merchant) return null;
  const lowered = merchant.toLowerCase();
  for (const entry of HINT_TABLE) {
    if (entry.match.test(lowered)) return entry.hint;
  }
  return null;
}

/**
 * One total from full OCR text. Tender/change/tax lines are excluded first
 * (two-pass: without them, then with — a sparse receipt with only a tender
 * line still yields something rather than nothing). Total-keyword lines win
 * (last one); otherwise the largest trailing-token candidate. Returns null
 * when no amount token exists at all.
 */
export function parseReceiptTotal(text: string): number | null {
  const lines = text.split(/\r?\n/);
  for (const pass of [true, false]) {
    const pool = pass ? lines.filter((line) => !TENDER_LINE.test(line)) : lines;
    const keyworded: number[] = [];
    const trailing: number[] = [];
    for (const line of pool) {
      const noRp = line.replace(/rp\.?/gi, ' ');
      if (TOTAL_LINE.test(line)) {
        for (const m of noRp.matchAll(/(\d[\d.,]*)\s*(rb|ribu)?/gi)) {
          const value = parseAmountToken(m[0]);
          if (value !== null) keyworded.push(value);
        }
      }
      const tail = noRp.match(/(\d[\d.,]*)\s*(rb|ribu)?\s*$/i);
      if (tail) {
        const value = parseAmountToken(tail[0]);
        if (value !== null) trailing.push(value);
      }
    }
    if (keyworded.length > 0) return keyworded[keyworded.length - 1];
    if (trailing.length > 0) {
      let best = trailing[0];
      for (const value of trailing) {
        if (value > best) best = value;
      }
      return best;
    }
  }
  return null;
}

/** Full MVP extraction: total + date + merchant + optional category hint. */
export function parseReceiptText(text: string): ReceiptPrefill | null {
  const amount = parseReceiptTotal(text);
  if (amount === null) return null;
  const merchant = extractMerchant(text);
  return {
    amount,
    occurredOn: parseReceiptDate(text),
    merchant,
    categoryHint: hintCategoryForMerchant(merchant),
  };
}
