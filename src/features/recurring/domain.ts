/**
 * Recurring domain — pure functions only (no bridge, no network).
 *
 * This is the Jest seam for V3 (#32, ADR-0005): the monthly due-day rule
 * (1–28 or last-of-month), the starts_on default that skips the first cycle
 * when the due already passed, the starts/ends window enumeration the
 * `run_recurring_catchup` RPC mirrors server-side, and rule validation.
 *
 * Server/client split, deliberately:
 *  - the SERVER owns the window walk + the 12-per-rule cap + idempotency
 *    (`unique(recurring_rule_id, occurred_on)`); the client never computes
 *    money or months itself (`starts_on` defaults from `current_month(tz)`).
 *  - the CLIENT owns `defaultStartsOn`: a rule saved this month after its due
 *    passed must start NEXT month, otherwise catch-up would invent a past
 *    payment on first run (spec story 27). The server stays dumb — a due
 *    before `starts_on` is simply out of window.
 */

import { dictionaryFor, fill, localeTagFor } from '@/i18n/dictionaries';
import { id } from '@/i18n/id';
import type { Language } from '@/i18n/locale';

export const RECURRING_KINDS = ['expense', 'income'] as const;
export type RecurringKind = (typeof RECURRING_KINDS)[number];

export function isRecurringKind(value: unknown): value is RecurringKind {
  return (
    typeof value === 'string' &&
    (RECURRING_KINDS as readonly string[]).includes(value)
  );
}

export const RULE_STATUSES = ['active', 'paused'] as const;
export type RuleStatus = (typeof RULE_STATUSES)[number];

export function isRuleStatus(value: unknown): value is RuleStatus {
  return (
    typeof value === 'string' &&
    (RULE_STATUSES as readonly string[]).includes(value)
  );
}

/** Max ACTIVE rules per user (paused ones don't count) — DB trigger + AC. */
export const MAX_ACTIVE_RULES = 20;

/** Catch-up writes at most this many occurrences per rule per open (ADR-0005). */
export const CATCHUP_CAP_PER_RULE = 12;

/** Due days 29–31 are never offered, so February can't skip (ADR-0005). */
export const DUE_DAY_MIN = 1;
export const DUE_DAY_MAX = 28;

/** A rule row as listed for the "Transaksi berulang" screen. */
export type RecurringRule = {
  id: string;
  kind: RecurringKind;
  amount: number;
  walletId: string;
  walletName: string;
  /** True when the wallet has been archived (the rule auto-pauses). */
  walletArchived: boolean;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  /** 1–28, or null when `dueLast` (last day of month). */
  dueDay: number | null;
  dueLast: boolean;
  /** Day-1 `YYYY-MM-DD` — the first month the rule may birth into. */
  startsOn: string;
  /** Day-1 `YYYY-MM-DD` or null (no end). */
  endsOn: string | null;
  status: RuleStatus;
};

// ---------------------------------------------------------------------------
// Labels
// ---------------------------------------------------------------------------

/** `Tgl 5` / `Akhir bulan` — the due line on rule cards (C6: lang-aware). */
export function dueLabel(
  dueDay: number | null,
  dueLast: boolean,
  lang: Language = 'id',
): string {
  const due = dictionaryFor(lang).recurring.due;
  if (dueLast) return due.lastDay;
  return fill(due.day, { day: dueDay ?? '—' });
}

/** UI copy uses "Jeda", never "pause" (CONTEXT.md glossary). */
export function statusLabel(status: RuleStatus, lang: Language = 'id'): string {
  const labels = dictionaryFor(lang).recurring.status;
  return status === 'paused' ? labels.paused : labels.active;
}

export function isPaused(rule: Pick<RecurringRule, 'status'>): boolean {
  return rule.status === 'paused';
}

/**
 * `2026-09-01` → `September 2026`. Falls back to the raw string when the input
 * is not a day-1 key. Month names come from `Intl` (R10) — no static list.
 */
export function formatRuleMonth(dayOne: string, lang: Language = 'id'): string {
  const year = Number(dayOne.slice(0, 4));
  const monthIndex = Number(dayOne.slice(5, 7)) - 1;
  if (
    !Number.isFinite(year) ||
    !Number.isInteger(monthIndex) ||
    monthIndex < 0 ||
    monthIndex > 11
  ) {
    return dayOne;
  }
  return new Intl.DateTimeFormat(localeTagFor(lang), {
    month: 'long',
    year: 'numeric',
  }).format(new Date(year, monthIndex, 1));
}

/** `2026-09-01` → `September 2026 – Desember 2026`, or `Mulai …` when open. */
export function formatRuleWindow(
  startsOn: string,
  endsOn: string | null,
  lang: Language = 'id',
): string {
  const start = formatRuleMonth(startsOn, lang);
  const windowCopy = dictionaryFor(lang).recurring.window;
  if (!endsOn) return fill(windowCopy.open, { month: start });
  return fill(windowCopy.range, { start, end: formatRuleMonth(endsOn, lang) });
}

// ---------------------------------------------------------------------------
// Due-date math (mirrors the RPC window; pure so Jest pins it)
// ---------------------------------------------------------------------------

/** Last calendar day of a month (month is 1–12). Feb 2026 → 28. */
export function lastDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** Concrete due `YYYY-MM-DD` for one month. */
export function resolveDueDate(
  year: number,
  month: number,
  dueDay: number | null,
  dueLast: boolean,
): string {
  const day = dueLast
    ? lastDayOfMonth(year, month)
    : Math.min(Math.max(dueDay ?? DUE_DAY_MIN, DUE_DAY_MIN), DUE_DAY_MAX);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseDayOne(dayOne: string): { year: number; month: number } {
  return {
    year: Number(dayOne.slice(0, 4)),
    month: Number(dayOne.slice(5, 7)),
  };
}

function toDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Every due date the rule covers, oldest first: from the `starts_on` month up
 * to the earlier of the `ends_on` month and the `today` month, keeping only
 * dues within `[startsOn, endsOn]` and `≤ today`. Months whose due hasn't
 * arrived stay unborn. Pass `limit` to mirror the RPC's per-call cap.
 */
export function enumerateDueDates(input: {
  startsOn: string;
  endsOn: string | null;
  dueDay: number | null;
  dueLast: boolean;
  today?: Date;
  limit?: number;
}): string[] {
  const todayKey = toDayKey(input.today ?? new Date());
  const limit = input.limit ?? Number.POSITIVE_INFINITY;
  const start = parseDayOne(input.startsOn);
  const endMonth = input.endsOn ?? `${todayKey.slice(0, 7)}-01`;
  const end = parseDayOne(endMonth);

  const dues: string[] = [];
  let year = start.year;
  let month = start.month;

  while (
    dues.length < limit &&
    (year < end.year || (year === end.year && month <= end.month))
  ) {
    const due = resolveDueDate(year, month, input.dueDay, input.dueLast);
    if (
      due >= input.startsOn &&
      (input.endsOn === null || due <= input.endsOn) &&
      due <= todayKey
    ) {
      dues.push(due);
    }
    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return dues;
}

/**
 * The `starts_on` default for a new rule (day-1, PRD R8): the running month,
 * bumped to NEXT month when this month's due already passed — otherwise the
 * first catch-up would invent a payment for a due the user never owed
 * (spec story 27). `currentMonthOne` comes from `current_month(tz)`, never
 * derived client-side.
 */
export function defaultStartsOn(input: {
  currentMonthOne: string;
  dueDay: number | null;
  dueLast: boolean;
  today?: Date;
}): string {
  const today = input.today ?? new Date();
  const { year, month } = parseDayOne(input.currentMonthOne);
  const due = resolveDueDate(year, month, input.dueDay, input.dueLast);

  if (due < toDayKey(today)) {
    const next = new Date(year, month, 1);
    const key = toDayKey(next);
    return `${key.slice(0, 7)}-01`;
  }
  return input.currentMonthOne;
}

// ---------------------------------------------------------------------------
// Validation (locked Indonesian copy, same style as the other seams)
// ---------------------------------------------------------------------------

export const recurringMessages = {
  kindRequired: id.recurring.validation.kindRequired,
  walletRequired: id.recurring.validation.walletRequired,
  categoryRequired: id.recurring.validation.categoryRequired,
  dueRequired: id.recurring.validation.dueRequired,
  startsRequired: id.recurring.validation.startsRequired,
  startsNotDayOne: id.recurring.validation.startsNotDayOne,
  endsNotDayOne: id.recurring.validation.endsNotDayOne,
  endsBeforeStarts: id.recurring.validation.endsBeforeStarts,
} as const;

function isDayOne(value: string): boolean {
  return /^\d{4}-\d{2}-01$/.test(value);
}

/**
 * Validates the rule shape (amount itself is validated by `validateAmount`
 * in the form — same split as the transaction form). Returns the first
 * inline error, or `null` when the rule may be sent.
 */
export function validateRecurringRule(
  input: {
    kind: RecurringKind | null;
    walletId: string | null;
    categoryId: string | null;
    dueDay: number | null;
    dueLast: boolean;
    startsOn: string;
    endsOn: string | null;
  },
  lang: Language = 'id',
): string | null {
  const messages = dictionaryFor(lang).recurring.validation;
  if (!input.kind || !isRecurringKind(input.kind)) {
    return messages.kindRequired;
  }
  if (!input.walletId) return messages.walletRequired;
  if (!input.categoryId) return messages.categoryRequired;
  if (!input.dueLast) {
    if (
      input.dueDay === null ||
      !Number.isInteger(input.dueDay) ||
      input.dueDay < DUE_DAY_MIN ||
      input.dueDay > DUE_DAY_MAX
    ) {
      return messages.dueRequired;
    }
  }
  if (!input.startsOn) return messages.startsRequired;
  if (!isDayOne(input.startsOn)) return messages.startsNotDayOne;
  if (input.endsOn !== null) {
    if (!isDayOne(input.endsOn)) return messages.endsNotDayOne;
    if (input.endsOn < input.startsOn) {
      return messages.endsBeforeStarts;
    }
  }
  return null;
}
