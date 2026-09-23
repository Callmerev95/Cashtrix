/**
 * Budgets domain — pure functions only (no bridge, no network).
 *
 * This is the Jest seam for T7 (Epic E "Budget Architecture"). The *money*
 * aggregation never happens here: `spent`, `percent` and `state` arrive
 * pre-computed from Postgres (`v_budget_status`, PRD §4.2). What lives here is
 * the presentation + guard logic that must be exact and is easy to get wrong:
 *
 *  - the threshold boundary: `percent >= 80` → `warning`, `>= 100` →
 *    `exceeded` (79.9 stays `ok`, 99.9 stays `warning`);
 *  - mapping a state to its dedup key (`warning_80` / `exceeded_100` — the two
 *    values of the `budget_alerts.threshold` check, PRD §6.1 R1);
 *  - the create/update guard: expense categories only, amount within
 *    `0 < amount ≤ AMOUNT_MAX` (same 12-digit bound as transactions).
 */

import { AMOUNT_MAX } from '../transactions/domain';
import { dictionaryFor, fill } from '@/i18n/dictionaries';
import { id } from '@/i18n/id';
import type { Language } from '@/i18n/locale';

// ---------------------------------------------------------------------------
// Thresholds (PRD §2.3 Epic E)
// ---------------------------------------------------------------------------

/** `spent/limit` in percent at which the ring turns fully gold. */
export const WARNING_THRESHOLD = 80;
/** `spent/limit` in percent at which the budget is blown. */
export const EXCEEDED_THRESHOLD = 100;

export type BudgetState = 'ok' | 'warning' | 'exceeded';

export const BUDGET_STATES: readonly BudgetState[] = [
  'ok',
  'warning',
  'exceeded',
] as const;

export function isBudgetState(value: unknown): value is BudgetState {
  return (
    value === 'ok' || value === 'warning' || value === 'exceeded'
  );
}

/** The two `budget_alerts.threshold` values (PRD §4.2 check constraint). */
export const BUDGET_ALERT_THRESHOLDS = [
  'warning_80',
  'exceeded_100',
] as const;

export type BudgetAlertThreshold = (typeof BUDGET_ALERT_THRESHOLDS)[number];

/** Server row from `v_budget_status` (numbers already parsed by `api.ts`). */
export type BudgetStatus = {
  budgetId: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  /** First-of-month `YYYY-MM-DD` of the budget's month. */
  month: string;
  amountLimit: number;
  spent: number;
  /** 0..100+ percent (`spent / limit * 100`). */
  percent: number;
  state: BudgetState;
};

// ---------------------------------------------------------------------------
// Percent + state (pure mirrors of the SQL — the DB is authoritative)
// ---------------------------------------------------------------------------

/**
 * `spent / limit * 100`. A non-positive or non-finite limit yields `0`
 * (the DB guard `amount_limit > 0` guarantees this never happens in practice;
 * the client must still never render `NaN`/`Infinity`).
 */
export function percentFor(spent: number, limit: number): number {
  if (!Number.isFinite(spent) || !Number.isFinite(limit) || limit <= 0) {
    return 0;
  }
  return (spent / limit) * 100;
}

/**
 * The ring state for a percent. Boundary-exact: 79.9 → `ok`, 80 → `warning`,
 * 99.9 → `warning`, 100 → `exceeded`. Mirrors the `CASE` in `v_budget_status`
 * so the client and the view can never disagree on a boundary.
 */
export function stateForPercent(percent: number): BudgetState {
  if (!Number.isFinite(percent)) return 'ok';
  if (percent >= EXCEEDED_THRESHOLD) return 'exceeded';
  if (percent >= WARNING_THRESHOLD) return 'warning';
  return 'ok';
}

/**
 * Which alert key a state fires, if any. `ok` fires nothing — this is what
 * keeps the app from spamming `budget_alerts` on every refresh.
 */
export function thresholdForState(
  state: BudgetState,
): BudgetAlertThreshold | null {
  if (state === 'warning') return 'warning_80';
  if (state === 'exceeded') return 'exceeded_100';
  return null;
}

/**
 * Fraction of the ring that is filled: `percent / 100` clamped to `0..1`.
 * The ring is full from 100% on — overspend past the limit does not overfill.
 */
export function ringFillFor(percent: number): number {
  if (!Number.isFinite(percent) || percent <= 0) return 0;
  return Math.min(percent / 100, 1);
}

// ---------------------------------------------------------------------------
// Validation (create/update guard — the DB trigger is the backstop)
// ---------------------------------------------------------------------------

export type BudgetValidation = {
  categoryError: string | null;
  amountError: string | null;
};

export const budgetMessages = {
  categoryRequired: 'Pilih kategori pengeluaran',
  categoryNotExpense: 'Budget hanya untuk kategori pengeluaran',
  amountRequired: 'Nominal budget wajib diisi',
  amountInvalid: 'Nominal budget tidak valid',
  amountTooSmall: 'Nominal budget harus lebih dari 0',
  amountTooLarge: `Nominal maksimal ${AMOUNT_MAX}`,
} as const;

export function validateBudget(input: {
  /** `null` = no category picked yet. */
  categoryId: string | null;
  /** `kind` of the picked category (`income` is rejected). */
  categoryKind: 'income' | 'expense' | null;
  /** Raw amount string (grouped `id-ID`, e.g. `1.500.000`). */
  amountRaw: string;
}): BudgetValidation {
  let categoryError: string | null = null;
  if (!input.categoryId || !input.categoryKind) {
    categoryError = budgetMessages.categoryRequired;
  } else if (input.categoryKind !== 'expense') {
    categoryError = budgetMessages.categoryNotExpense;
  }

  let amountError: string | null = null;
  const digits = input.amountRaw.replace(/[^0-9]/g, '');
  if (digits.length === 0) {
    amountError = budgetMessages.amountRequired;
  } else {
    const value = Number(digits);
    if (!Number.isFinite(value)) {
      amountError = budgetMessages.amountInvalid;
    } else if (value <= 0) {
      amountError = budgetMessages.amountTooSmall;
    } else if (value > AMOUNT_MAX) {
      amountError = budgetMessages.amountTooLarge;
    }
  }

  return { categoryError, amountError };
}

export function hasBudgetErrors(validation: BudgetValidation): boolean {
  return (
    validation.categoryError !== null || validation.amountError !== null
  );
}

/** Digits of a grouped `id-ID` amount input (assumes `validateBudget` passed). */
export function budgetLimitFromInput(amountRaw: string): number {
  return Number(amountRaw.replace(/[^0-9]/g, ''));
}

// ---------------------------------------------------------------------------
// Labels (C6: screen + notification copy lives in the central dictionary;
// these stay as the id-ID source of truth for unmigrated callers)
// ---------------------------------------------------------------------------

export const budgetStateLabels: Record<BudgetState, string> =
  id.budgets.state;

/** State chip label in the active language (C6). */
export function budgetStateLabel(
  state: BudgetState,
  lang: Language = 'id',
): string {
  return dictionaryFor(lang).budgets.state[state];
}

/** `79,9%` — id-ID decimal comma, never `NaN`/`Infinity`. */
export function formatPercent(percent: number): string {
  if (!Number.isFinite(percent)) return '0%';
  const rounded = Math.round(percent * 10) / 10;
  const text =
    Number.isInteger(rounded)
      ? String(rounded)
      : rounded.toFixed(1).replace('.', ',');
  return `${text}%`;
}

// ---------------------------------------------------------------------------
// Inbox (A5 — riwayat alert di app)
// ---------------------------------------------------------------------------

/**
 * One persisted alert row for the inbox: the fired alert plus its read flag.
 * `readAt` null = unread (including every pre-A5 row — the migration leaves
 * them NULL rather than backfilling).
 */
export type InboxAlert = {
  id: string;
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  month: string;
  threshold: BudgetAlertThreshold;
  firedAt: string;
  readAt: string | null;
};

/** Unread-first would reorder history; the inbox stays newest-first, the dot marks unread. */
export function unreadAlerts(alerts: InboxAlert[]): InboxAlert[] {
  return alerts.filter((alert) => alert.readAt === null);
}

/**
 * Inbox row title (the Jest seam — the push body stays in `notifications.ts`).
 * `Makanan menyentuh 80% budget` / `Makanan melampaui 100% budget` in id-ID;
 * pass the active language for the localised form (C6).
 */
export function inboxAlertTitle(
  categoryName: string,
  threshold: BudgetAlertThreshold,
  lang: Language = 'id',
): string {
  const copy = dictionaryFor(lang).budgets.inbox;
  return threshold === 'warning_80'
    ? fill(copy.warningTitle, { categoryName })
    : fill(copy.exceededTitle, { categoryName });
}

/** One inbox month group, newest month first (input already newest-first). */
export type InboxMonthGroup = {
  month: string;
  alerts: InboxAlert[];
};

/**
 * Groups inbox rows by budget month for the `/notifications` screen, so a
 * year of history reads as "September 2026 / Agustus 2026" instead of one
 * endless list. Order is stable: first-seen month wins, rows keep their
 * newest-first order — never re-sorted (A5 follow-up).
 */
export function groupAlertsByMonth(alerts: InboxAlert[]): InboxMonthGroup[] {
  const groups: InboxMonthGroup[] = [];
  for (const alert of alerts) {
    const group = groups.find((entry) => entry.month === alert.month);
    if (group) {
      group.alerts.push(alert);
    } else {
      groups.push({ month: alert.month, alerts: [alert] });
    }
  }
  return groups;
}
