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

import { dictionaryFor, fill, localeTagFor } from '@/i18n/dictionaries';
import { id } from '@/i18n/id';
import type { Language } from '@/i18n/locale';

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

// ---------------------------------------------------------------------------
// Shortcut deep-link params (S1, ADR-0009)
// ---------------------------------------------------------------------------

/**
 * Types a shortcut may preselect. `transfer` is excluded on purpose (spec
 * story 1): shortcuts cover expense/income/scan only.
 */
export const SHORTCUT_TYPES = ['expense', 'income'] as const;
export type ShortcutType = (typeof SHORTCUT_TYPES)[number];

/**
 * Parses `?type=` from a shortcut deep link (`cashtrix://add-transaction`).
 * Anything else — `transfer`, unknown, missing — is `null` so the form falls
 * back to the remembered preference instead of a smuggled segment.
 */
export function parseShortcutType(value: unknown): ShortcutType | null {
  return value === 'expense' || value === 'income' ? value : null;
}

/**
 * Parses `?scan=` from the scan alias (`cashtrix://scan` → `scan=1`).
 * Only the exact `scan=1` the alias emits arms scan mode; the photo UI
 * itself lands in S2, which reads this same flag.
 */
export function parseScanFlag(value: unknown): boolean {
  return value === '1';
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
  required: id.transactions.validation.required,
  invalid: id.transactions.validation.invalid,
  tooLarge: fill(id.transactions.validation.tooLarge, { max: AMOUNT_MAX }),
  tooManyDecimals: id.transactions.validation.tooManyDecimals,
  zero: id.transactions.validation.zero,
} as const;

/**
 * Validates a formatted amount field. Accepts `1.250.000`, `1.250.000,50`
 * and `0,5`; rejects empty, non-numeric, zero, >12 integer digits, >2 decimals
 * and non-finite values (AC #17). Pass the active language for localised
 * copy (C6); the default keeps the locked id-ID behaviour.
 */
export function validateAmount(
  raw: string,
  lang: Language = 'id',
): AmountValidation {
  const messages = dictionaryFor(lang).transactions.validation;
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: false, error: messages.required };

  // Shape check first (grouping must be well-formed), then the specific
  // decimal/digit rules so the user gets the precise message rather than a
  // generic "invalid".
  if (!/^\d{1,3}(\.\d{3})*(,\d*)?$|^\d+(,\d*)?$/.test(trimmed)) {
    return { ok: false, error: messages.invalid };
  }

  const [wholePart, decimalPart] = trimmed.split(',');
  if (decimalPart !== undefined && decimalPart.length > 2) {
    return { ok: false, error: messages.tooManyDecimals };
  }
  if (integerDigitCount(trimmed) > 12) {
    return { ok: false, error: fill(messages.tooLarge, { max: AMOUNT_MAX }) };
  }

  const value = Number(`${wholePart.replace(/\./g, '')}.${decimalPart ?? '0'}`);
  if (!Number.isFinite(value)) return { ok: false, error: messages.invalid };
  if (value <= 0) return { ok: false, error: messages.zero };
  if (value > AMOUNT_MAX) {
    return { ok: false, error: fill(messages.tooLarge, { max: AMOUNT_MAX }) };
  }

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
 * otherwise a grouped date (`18 Sep 2026` in id-ID via `Intl`, R10) rendered
 * uppercase by the `label-uppercase` token. Pass the active language (C6);
 * the default keeps the locked id-ID behaviour.
 */
export function formatDateDivider(
  iso: string,
  now: Date = new Date(),
  lang: Language = 'id',
): string {
  const date = new Date(iso);
  const today = startOfDay(now).getTime();
  const day = startOfDay(date).getTime();
  const daysApart = Math.round((today - day) / 86_400_000);

  const copy = dictionaryFor(lang).transactions.divider;
  if (daysApart === 0) return copy.today;
  if (daysApart === 1) return copy.yesterday;

  return new Intl.DateTimeFormat(localeTagFor(lang), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
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
 * The row's amount string. Income is green with no prefix (the colour alone
 * distinguishes it); expense is red and leads with `-` (DESIGN.md §1).
 * Transfer is neutral white with no prefix — it is neither income nor
 * expense, and the feed label already says where the money went.
 */
export function formatSignedAmount(
  type: TransactionType,
  amount: number,
  currency = 'Rp',
  lang: Language = 'id',
): string {
  const body = `${currency} ${formatGrouped(Math.abs(amount), lang)}`;
  return type === 'expense' ? `-${body}` : body;
}

/**
 * Grouped digits, max two decimals, trailing `,00` dropped (C6: separators
 * follow the active language — `.`/`,` in id-ID, `,`/`.` in en-US; the
 * default keeps the locked id-ID behaviour).
 */
export function formatGrouped(value: number, lang: Language = 'id'): string {
  const thousand = lang === 'en' ? ',' : '.';
  const decimal = lang === 'en' ? '.' : ',';
  const [whole, decimals] = Math.abs(value).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, thousand);
  return decimals === '00' ? grouped : `${grouped}${decimal}${decimals}`;
}

/** Type label in the active language (C6). */
export function transactionTypeLabel(
  type: TransactionType,
  lang: Language = 'id',
): string {
  return dictionaryFor(lang).transactions.type[type];
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
  sourceRequired: id.transactions.transfer.sourceRequired,
  destinationRequired: id.transactions.transfer.destinationRequired,
  sameWallet: id.transactions.transfer.sameWallet,
} as const;

export type TransferValidation =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Validates the transfer wallet pair (V2): both ends present and different.
 * Amount/date rules are shared (`validateAmount` / `isFutureDate`); no
 * category is involved — the DB check enforces `category_id is null`.
 */
export function validateTransfer(
  input: {
    sourceWalletId: string | null;
    destinationWalletId: string | null;
  },
  lang: Language = 'id',
): TransferValidation {
  const messages = dictionaryFor(lang).transactions.transfer;
  if (!input.sourceWalletId) {
    return { ok: false, error: messages.sourceRequired };
  }
  if (!input.destinationWalletId) {
    return { ok: false, error: messages.destinationRequired };
  }
  if (input.sourceWalletId === input.destinationWalletId) {
    return { ok: false, error: messages.sameWallet };
  }
  return { ok: true };
}

/** Icon for transfer rows (MaterialIcons name). */
export const TRANSFER_ICON = 'swap-horiz';

/**
 * The single feed line for a transfer (V2 AC): `Transfer ke {nama}`.
 * Falls back to a bare `Transfer` when the destination name is missing
 * (e.g. an optimistic row before the refresh lands). Pass the active
 * language (C6); the default keeps the locked id-ID behaviour.
 */
export function transferFeedLabel(
  destinationName: string | null | undefined,
  lang: Language = 'id',
): string {
  const copy = dictionaryFor(lang).transactions.transfer;
  return destinationName
    ? fill(copy.feedTo, { name: destinationName })
    : copy.feedBare;
}

/**
 * The one-line confirmation the undo snackbar shows (V4) — the row that just
 * disappeared, named, plus its amount. `formatGrouped` is the same digits the
 * history row renders, so the snackbar cannot disagree with the list.
 * Pass the active language (C6); the default keeps id-ID.
 */
export function deletedTransactionLabel(
  transaction: Transaction,
  lang: Language = 'id',
): string {
  const copy = dictionaryFor(lang).transactions.undo;
  const name =
    transaction.type === 'transfer'
      ? transferFeedLabel(transaction.counterpartyWalletName, lang)
      : transaction.categoryName;
  return fill(copy.label, {
    name: name || copy.fallback,
    amount: formatGrouped(transaction.amount, lang),
  });
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
  lang: Language = 'id',
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
      label: formatDateDivider(transaction.occurredAt, now, lang),
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

/** Short weekday headers, Monday-first — the id-ID source of truth. */
export const WEEKDAY_LABELS = [
  'Sen',
  'Sel',
  'Rab',
  'Kam',
  'Jum',
  'Sab',
  'Min',
] as const;

/** Weekday headers in the active language (C6: `Intl` short weekday, R10). */
export function weekdayLabels(lang: Language = 'id'): readonly string[] {
  if (lang === 'id') return WEEKDAY_LABELS;
  // Monday-first English shorts anchored to a known Monday (2026-09-14).
  const monday = new Date(2026, 8, 14);
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i);
    return new Intl.DateTimeFormat(localeTagFor(lang), {
      weekday: 'short',
    }).format(day);
  });
}

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

/** `September 2026` — the grid's month header (C6: `Intl`, R10). */
export function formatMonthLabel(month: Date, lang: Language = 'id'): string {
  return new Intl.DateTimeFormat(localeTagFor(lang), {
    month: 'long',
    year: 'numeric',
  }).format(month);
}

// ---------------------------------------------------------------------------
// Search (A3 — "cari & filter riwayat")
//
// The query builder A4 (bulk edit) reuses: `TransactionKindFilter` narrows by
// `type`, `buildSearchPattern` turns free text into one PostgREST `ilike`
// pattern matched OR-wise against note/category/wallet names server-side.
// ---------------------------------------------------------------------------

/** Kind narrow-down for search; `all` means "no type filter". */
export type TransactionKindFilter = 'all' | TransactionType;

export const KIND_FILTER_OPTIONS: {
  value: TransactionKindFilter;
  label: string;
}[] = [
  { value: 'all', label: id.search.kind.all },
  { value: 'expense', label: id.search.kind.expense },
  { value: 'income', label: id.search.kind.income },
  { value: 'transfer', label: id.search.kind.transfer },
];

/** Kind-chip label in the active language (C6). */
export function kindFilterLabel(
  filter: TransactionKindFilter,
  lang: Language = 'id',
): string {
  return dictionaryFor(lang).search.kind[filter];
}

/** Text input debounce so every keystroke is not a round-trip. */
export const SEARCH_DEBOUNCE_MS = 300;

/**
 * Turns free text into a single `*…*` contains-pattern for the server `.or()`
 * clause, or `null` when there is nothing to match. `,()\"` are structural to
 * the PostgREST `or()` grammar and cannot appear in a value — they are
 * stripped (not escaped) so a paste can never break the query. A `%`/`_`
 * typed by the user keeps its LIKE meaning; that only ever widens, never
 * hides, and the row set stays server-truth.
 */
export function buildSearchPattern(query: string): string | null {
  const cleaned = query.replace(/[,()"]/g, '').trim();
  return cleaned.length > 0 ? `*${cleaned}*` : null;
}

/** Whether the screen should query at all (vs showing the idle hint). */
export function isSearchActive(
  query: string,
  kind: TransactionKindFilter,
): boolean {
  return buildSearchPattern(query) !== null || kind !== 'all';
}

// ---------------------------------------------------------------------------
// Bulk select (A4 — bulk edit kategori)
//
// Selection is a plain id list; the locked kind derives from the selected
// rows (first row wins), so there is no kind state to drift. `toggleBulkRow`
// is the single gate: transfers can never enter, and a second kind can never
// join — the screen turns the rejection code into a hint.
// ---------------------------------------------------------------------------

/** Ids currently checked + the kind they locked (null when empty). */
export type BulkSelection = {
  ids: string[];
  kind: TransactionType | null;
};

export type BulkRejectReason = 'transfer' | 'kind';

/**
 * Derives the selection from the checked ids and the rows on screen. Ids
 * that left the page (a refetch raced a check) are ignored for the kind, so
 * the lock never points at a row the user cannot see.
 */
export function bulkSelectionFor(
  ids: string[],
  rows: Pick<Transaction, 'id' | 'type'>[],
): BulkSelection {
  const first = rows.find((row) => ids.includes(row.id)) ?? null;
  return { ids, kind: first?.type ?? null };
}

/**
 * One tap on a row in select mode. Returns the next id list, or a rejection
 * code the screen renders as a hint (the list is then unchanged).
 */
export function toggleBulkRow(
  ids: string[],
  row: Pick<Transaction, 'id' | 'type'>,
  lockedKind: TransactionType | null,
): { ids: string[]; rejected: BulkRejectReason | null } {
  if (row.type === 'transfer') return { ids, rejected: 'transfer' };
  if (ids.includes(row.id)) {
    return { ids: ids.filter((id) => id !== row.id), rejected: null };
  }
  if (lockedKind !== null && row.type !== lockedKind) {
    return { ids, rejected: 'kind' };
  }
  return { ids: [...ids, row.id], rejected: null };
}
