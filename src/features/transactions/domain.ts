/**
 * Transaction domain — pure functions only (no bridge, no network).
 *
 * This is the Jest seam from `specs/cashtrix-mvp.md` §Testing: `id-ID` amount
 * formatting, amount validation (12 digits / 2 decimals / no NaN or Infinity),
 * note trimming, the expense/income preference and the grouping rules that
 * make the history list scannable. All of it is testable without Supabase.
 *
 * Money direction rule (PRD §6.1 R4): `amount` is always stored positive and
 * `type` carries the sign. Nothing here ever adds raw amounts together — the
 * signed string is a *display* concern only.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const TRANSACTION_TYPES = ['expense', 'income', 'transfer'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

/**
 * Category kinds stay `expense | income` (V2): transfer never takes a
 * category (DB check enforces `category_id is null`), so no `kind = transfer`
 * exists anywhere — the grid, budgets and analytics keep their narrow type.
 */
export const CATEGORY_KINDS = ['expense', 'income'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export function isTransactionType(value: unknown): value is TransactionType {
  return (
    typeof value === 'string' &&
    (TRANSACTION_TYPES as readonly string[]).includes(value)
  );
}

/** A history row as returned by `v_transactions_feed`. */
export type Transaction = {
  id: string;
  type: TransactionType;
  amount: number;
  currencyCode: string;
  /** ISO timestamp of when the money moved (not when it was typed). */
  occurredAt: string;
  note: string | null;
  /**
   * Null for `transfer` (ADR-0004: transfer ↔ category null ↔ counterparty
   * not null). `categoryName`/`categoryIcon` fall back to the transfer label
   * and icon so rows never render blank.
   */
  categoryId: string | null;
  categoryName: string;
  categoryIcon: string;
  walletId: string;
  walletName: string;
  /** Destination wallet — set only for `transfer`, null otherwise. */
  counterpartyWalletId: string | null;
  counterpartyWalletName: string | null;
};

/** A category option in the picker grid. */
export type Category = {
  id: string;
  name: string;
  icon: string;
  kind: CategoryKind;
};

export type WalletOption = {
  id: string;
  name: string;
};

// ---------------------------------------------------------------------------
// Constants (AC #14–#23)
// ---------------------------------------------------------------------------

/** Page size for the history list — PRD §2.3 Epic C: 20/halaman. */
export const PAGE_SIZE = 20;

export const NOTE_MAX_LENGTH = 200;

/** Same bound as wallets (`AMOUNT_MAX`): 12 integer digits. */
export const AMOUNT_MAX = 999_999_999_999;

/** Default when nothing has been persisted yet. */
export const DEFAULT_TRANSACTION_TYPE: TransactionType = 'expense';

// ---------------------------------------------------------------------------
// Idempotency key
// ---------------------------------------------------------------------------

/**
 * UUID v4 generated **when the form opens** (AC #22), so a network retry of
 * the same submission reuses the key and `unique(user_id, idempotency_key)`
 * makes the second insert a no-op instead of a duplicate.
 *
 * `crypto.randomUUID` exists in Hermes/Expo (via `expo-crypto`'s polyfill in
 * the runtime) — the manual fallback keeps the pure function dependency-free
 * and deterministic to test.
 */
export function newIdempotencyKey(): string {
  const cryptoApi = (globalThis as { crypto?: { randomUUID?: () => string } })
    .crypto;

  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }

  // RFC 4122 v4 shape from Math.random: not cryptographic, but the key only
  // needs to be unique per user, not unguessable.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

// ---------------------------------------------------------------------------
// Amount entry
// ---------------------------------------------------------------------------

/**
 * Formats a *typing* value with id-ID grouping while preserving a trailing
 * decimal separator, so the caret never jumps as the user types
 * (`"1250"` → `"1.250"`, `"1250,"` → `"1.250,"`).
 *
 * Returns `''` for anything that is not a plain digit/decimal string — the
 * caller keeps the raw keystrokes out of the field.
 */
export function formatAmountInput(raw: string): string {
  const cleaned = raw.replace(/[^0-9,]/g, '');
  if (cleaned === '') return '';

  const [whole = '', ...rest] = cleaned.split(',');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');

  if (rest.length === 0) return grouped;

  // Keep only the first decimal separator and at most its two digits; the
  // user can still type a third and see it rejected by validation.
  const decimals = rest.join('').slice(0, 2);
  return `${grouped},${decimals}`;
}

/** Counts integer digits in a formatted amount (leading zeros ignored). */
function integerDigitCount(formatted: string): number {
  const whole = formatted.split(',')[0] ?? '';
  const digits = whole.replace(/\./g, '').replace(/^0+(?=\d)/, '');
  return digits.length;
}

export type AmountValidation =
  | { ok: true; value: number }
  | { ok: false; error: string };

export const amountMessages = {
  required: 'Nominal wajib diisi',
  invalid: 'Nominal tidak valid',
  tooLarge: `Nominal maksimal ${AMOUNT_MAX}`,
  tooManyDecimals: 'Maksimal 2 angka desimal',
  zero: 'Nominal harus lebih dari 0',
} as const;

/**
 * Validates a formatted amount field. Accepts `1.250.000`, `1.250.000,50`
 * and `0,5`; rejects empty, non-numeric, zero, >12 integer digits, >2 decimals
 * and non-finite values (AC #17).
 */
export function validateAmount(raw: string): AmountValidation {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, error: amountMessages.required };

  // Shape check first (grouping must be well-formed), then the specific
  // decimal/digit rules so the user gets the precise message rather than a
  // generic "invalid".
  if (!/^\d{1,3}(\.\d{3})*(,\d*)?$|^\d+(,\d*)?$/.test(trimmed)) {
    return { ok: false, error: amountMessages.invalid };
  }

  const [wholePart, decimalPart] = trimmed.split(',');
  if (decimalPart !== undefined && decimalPart.length > 2) {
    return { ok: false, error: amountMessages.tooManyDecimals };
  }
  if (integerDigitCount(trimmed) > 12) {
    return { ok: false, error: amountMessages.tooLarge };
  }

  const value = Number(`${wholePart.replace(/\./g, '')}.${decimalPart ?? '0'}`);
  if (!Number.isFinite(value)) return { ok: false, error: amountMessages.invalid };
  if (value <= 0) return { ok: false, error: amountMessages.zero };
  if (value > AMOUNT_MAX) return { ok: false, error: amountMessages.tooLarge };

  return { ok: true, value };
}

// ---------------------------------------------------------------------------
// Note
// ---------------------------------------------------------------------------

export function normalizeNote(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

// ---------------------------------------------------------------------------
// Date
// ---------------------------------------------------------------------------

/** Midnight of the given instant in local time — the grouping key. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * A transaction may not be dated in the future (AC #19). Compared by *day*,
 * not by instant, so "today at 23:00" picked at 08:00 is still allowed.
 */
export function isFutureDate(date: Date, now: Date = new Date()): boolean {
  return startOfDay(date).getTime() > startOfDay(now).getTime();
}

/** `2026-09-18` in the device's local calendar (for the date field). */
export function toDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * The day divider label. `Hari ini` / `Kemarin` for the two freshest days,
 * otherwise a grouped `id-ID` date (`18 Sep 2026`) rendered uppercase by the
 * `label-uppercase` token.
 */
export function formatDateDivider(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const today = startOfDay(now).getTime();
  const day = startOfDay(date).getTime();
  const daysApart = Math.round((today - day) / 86_400_000);

  if (daysApart === 0) return 'Hari ini';
  if (daysApart === 1) return 'Kemarin';

  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'Mei',
    'Jun',
    'Jul',
    'Agu',
    'Sep',
    'Okt',
    'Nov',
    'Des',
  ];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/** `14:30` in local time — the row's secondary metadata. */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

// ---------------------------------------------------------------------------
// Display
// ---------------------------------------------------------------------------

/**
 * The row's amount string. Income is gold with no prefix (the colour alone
 * distinguishes it); expense stays muted white and leads with `-`
 * (DESIGN.md §1, amended in #26 — expenses are never red, but the minus
 * glyph now marks the direction instead of the income `+`). Transfer is
 * neutral white with no prefix — it is neither income nor expense, and the
 * feed label already says where the money went.
 */
export function formatSignedAmount(
  type: TransactionType,
  amount: number,
  currency = 'Rp',
): string {
  const body = `${currency} ${formatGrouped(Math.abs(amount))}`;
  return type === 'expense' ? `-${body}` : body;
}

/** id-ID grouped digits, max two decimals, trailing `,00` dropped. */
export function formatGrouped(value: number): string {
  const [whole, decimals] = Math.abs(value).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimals === '00' ? grouped : `${grouped},${decimals}`;
}

// ---------------------------------------------------------------------------
// Category selection
// ---------------------------------------------------------------------------

/**
 * Categories for the picker grid: only the given `kind`, and archived ones
 * are hidden (AC #18). Ordering is stable so the grid does not reshuffle.
 * Transfer hides the grid entirely, so it never asks for a kind here.
 */
export function categoriesForKind(
  categories: Category[],
  kind: TransactionType,
): Category[] {
  return categories.filter((category) => category.kind === kind);
}

// ---------------------------------------------------------------------------
// Transfer (V2, ADR-0004)
// ---------------------------------------------------------------------------

export const transferMessages = {
  sourceRequired: 'Pilih dompet sumber terlebih dahulu',
  destinationRequired: 'Pilih dompet tujuan terlebih dahulu',
  sameWallet: 'Dompet sumber dan tujuan harus berbeda',
} as const;

export type TransferValidation =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Validates the transfer wallet pair (V2): both ends present and different.
 * Amount/date rules are shared (`validateAmount` / `isFutureDate`); no
 * category is involved — the DB check enforces `category_id is null`.
 */
export function validateTransfer(input: {
  sourceWalletId: string | null;
  destinationWalletId: string | null;
}): TransferValidation {
  if (!input.sourceWalletId) {
    return { ok: false, error: transferMessages.sourceRequired };
  }
  if (!input.destinationWalletId) {
    return { ok: false, error: transferMessages.destinationRequired };
  }
  if (input.sourceWalletId === input.destinationWalletId) {
    return { ok: false, error: transferMessages.sameWallet };
  }
  return { ok: true };
}

/** Icon for transfer rows (MaterialIcons name). */
export const TRANSFER_ICON = 'swap-horiz';

/**
 * The single feed line for a transfer (V2 AC): `Transfer ke {nama}`.
 * Falls back to a bare `Transfer` when the destination name is missing
 * (e.g. an optimistic row before the refresh lands).
 */
export function transferFeedLabel(
  destinationName: string | null | undefined,
): string {
  return destinationName ? `Transfer ke ${destinationName}` : 'Transfer';
}

/**
 * The one-line confirmation the undo snackbar shows (V4) — the row that just
 * disappeared, named, plus its amount. `formatGrouped` is the same digits the
 * history row renders, so the snackbar cannot disagree with the list.
 */
export function deletedTransactionLabel(transaction: Transaction): string {
  const name =
    transaction.type === 'transfer'
      ? transferFeedLabel(transaction.counterpartyWalletName)
      : transaction.categoryName;
  return `${name || 'Transaksi'} · Rp ${formatGrouped(transaction.amount)} dihapus`;
}

// ---------------------------------------------------------------------------
// History grouping & pagination
// ---------------------------------------------------------------------------

export type TransactionDayGroup = {
  /** `YYYY-MM-DD` local — stable React key. */
  key: string;
  label: string;
  transactions: Transaction[];
};

/**
 * Groups consecutive history rows into day sections, preserving the incoming
 * order (the DB returns `occurred_at desc`). Rows are never re-sorted here so
 * the list and the paging cursor cannot disagree.
 */
export function groupByDay(
  transactions: Transaction[],
  now: Date = new Date(),
): TransactionDayGroup[] {
  const groups: TransactionDayGroup[] = [];

  for (const transaction of transactions) {
    const key = toDateKey(new Date(transaction.occurredAt));
    const last = groups[groups.length - 1];

    if (last?.key === key) {
      last.transactions.push(transaction);
      continue;
    }

    groups.push({
      key,
      label: formatDateDivider(transaction.occurredAt, now),
      transactions: [transaction],
    });
  }

  return groups;
}

/** Whether another page exists, given how many rows the last fetch returned. */
export function hasMoreAfter(pageSize: number, received: number): boolean {
  return received === pageSize;
}

// ---------------------------------------------------------------------------
// Calendar month grid (V5)
//
// The Add form picks its date from a full month grid built from plain `View`s
// (same reasoning as the T6 donut / T7 ring: no native date-picker module, so
// no dev-client rebuild). The grid is Monday-first (`id-ID` week) and always
// complete weeks — leading/trailing days from the adjacent months fill the
// first/last row so columns never shift.
//
// Future days are *flagged*, never offered: the grid disables them and
// `canSelectDay` mirrors that rule for tests, while the form keeps its
// `isFutureDate` submit guard as defence in depth (income/expense/transfer).
// ---------------------------------------------------------------------------

/** Short `id-ID` weekday headers, Monday-first. */
export const WEEKDAY_LABELS = [
  'Sen',
  'Sel',
  'Rab',
  'Kam',
  'Jum',
  'Sab',
  'Min',
] as const;

const MONTH_NAMES_ID = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

export type CalendarDay = {
  /** Local midnight of the cell's date — stable key via `toDateKey`. */
  date: Date;
  /** Day of month (1–31). */
  day: number;
  /** False for the leading/trailing filler from adjacent months. */
  inMonth: boolean;
  isToday: boolean;
  /** After today — the grid renders these disabled and never selects them. */
  isFuture: boolean;
  isSelected: boolean;
};

/**
 * Builds the visible month as complete Monday-first weeks. Every day of the
 * month appears exactly once with `inMonth: true`; filler cells keep the
 * 7-column alignment stable.
 */
export function buildMonthGrid(
  month: Date,
  selected: Date,
  now: Date = new Date(),
): CalendarDay[][] {
  const year = month.getFullYear();
  const monthIndex = month.getMonth();
  const todayKey = toDateKey(startOfDay(now));
  const selectedKey = toDateKey(startOfDay(selected));

  // Monday-first offset: JS `getDay()` is 0 = Sunday.
  const firstWeekday = new Date(year, monthIndex, 1).getDay();
  const leading = (firstWeekday + 6) % 7;

  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const total = leading + daysInMonth;
  const weeks: CalendarDay[][] = [];
  let week: CalendarDay[] = [];

  for (let i = 0; i < total; i += 1) {
    const date = new Date(year, monthIndex, 1 - leading + i);
    const key = toDateKey(date);
    week.push({
      date,
      day: date.getDate(),
      inMonth: date.getMonth() === monthIndex,
      isToday: key === todayKey,
      isFuture: key > todayKey,
      isSelected: key === selectedKey,
    });
    if (week.length === 7) {
      weeks.push(week);
      week = [];
    }
  }

  // Pad the last row with the next month so every week is complete.
  if (week.length > 0) {
    const last = week[week.length - 1].date;
    let cursor = new Date(last.getFullYear(), last.getMonth(), last.getDate());
    while (week.length < 7) {
      cursor = new Date(
        cursor.getFullYear(),
        cursor.getMonth(),
        cursor.getDate() + 1,
      );
      const key = toDateKey(cursor);
      week.push({
        date: cursor,
        day: cursor.getDate(),
        inMonth: false,
        isToday: key === todayKey,
        isFuture: key > todayKey,
        isSelected: key === selectedKey,
      });
    }
    weeks.push(week);
  }

  return weeks;
}

/**
 * Whether the calendar may select the given day — today or earlier only.
 * Same day-granularity rule as `isFutureDate`, exposed under a calendar name
 * so the grid and its tests share one predicate.
 */
export function canSelectDay(day: Date, now: Date = new Date()): boolean {
  return !isFutureDate(day, now);
}

/** `September 2026` — the grid's month header in `id-ID`. */
export function formatMonthLabel(month: Date): string {
  return `${MONTH_NAMES_ID[month.getMonth()]} ${month.getFullYear()}`;
}
