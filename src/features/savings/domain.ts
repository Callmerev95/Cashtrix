/**
 * Savings goals — pure domain (SV2, `specs/cashtrix-savings.md`).
 *
 * A goal is metadata on one wallet: progress is that wallet's balance from
 * `v_wallet_balances`, never a second ledger. Every function here is
 * presentation logic, which is why the database has no progress column — the
 * balance is the only source of truth and it may go down.
 */
import { dictionaryFor, fill, localeTagFor, type Language } from '@/i18n';
import {
  AMOUNT_MAX,
  parseAmountInput,
  type Wallet,
} from '@/features/wallets/domain';

export const NAME_MAX_LENGTH = 60;
export const MASKED_SAVINGS_PERCENT = '••%';

export type SavingsGoal = {
  id: string;
  userId: string;
  walletId: string;
  name: string | null;
  targetAmount: number;
  /** `YYYY-MM-DD` in the device calendar; null = no deadline. */
  targetDate: string | null;
  createdAt: string;
};

export type SavingsGoalView = SavingsGoal & {
  walletName: string;
  walletArchived: boolean;
  /** Current wallet balance from `v_wallet_balances`. */
  balance: number;
};

export type SavingsStatus = 'achieved' | 'overdue' | 'active';

export type SavingsGoalFieldErrors = {
  walletId: string | null;
  targetAmount: string | null;
  name: string | null;
  targetDate: string | null;
};

export type SavingsGoalInput = {
  walletId: string | null;
  name: string;
  /** Raw grouped amount, e.g. `1.500.000`. */
  targetAmountRaw: string;
  targetDate: string | null;
};

export type SavingsGoalValidationOptions = {
  today?: Date;
  /** Existing date when editing; keeping it is allowed even if it has passed. */
  originalDate?: string | null;
  language?: Language;
};

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

/** `100 * balance / target`, clamped to >= 0; never NaN/Infinity. */
export function progressPercent(
  targetAmount: number,
  balance: number,
): number {
  if (
    !isFiniteNumber(targetAmount) ||
    !isFiniteNumber(balance) ||
    targetAmount <= 0 ||
    balance <= 0
  ) {
    return 0;
  }
  return (balance / targetAmount) * 100;
}

/** Ring fill fraction, clamped to 0..1 (the ring never overshoots). */
export function ringFillFor(percent: number): number {
  if (!isFiniteNumber(percent)) return 0;
  return Math.min(Math.max(percent / 100, 0), 1);
}

/** Remaining amount; 0 once the balance reaches or passes the target. */
export function remainingAmount(
  targetAmount: number,
  balance: number,
): number {
  if (!isFiniteNumber(targetAmount) || !isFiniteNumber(balance)) return 0;
  return Math.max(targetAmount - balance, 0);
}

function parseDateKey(key: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

/** Local calendar day key, mirroring `toDateKey` in transactions. */
function localDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function calendarDaysBetween(fromKey: string, toKey: string): number {
  const from = parseDateKey(fromKey);
  const to = parseDateKey(toKey);
  if (!from || !to) return 0;
  const fromUtc = Date.UTC(
    from.getFullYear(),
    from.getMonth(),
    from.getDate(),
  );
  const toUtc = Date.UTC(to.getFullYear(), to.getMonth(), to.getDate());
  return Math.round((toUtc - fromUtc) / 86_400_000);
}

/**
 * Calendar days from today to the target date (negative when overdue).
 * `null` for a missing or malformed date.
 */
export function daysUntil(
  targetDate: string | null,
  today: Date = new Date(),
): number | null {
  if (!targetDate || !parseDateKey(targetDate)) return null;
  return calendarDaysBetween(localDateKey(today), targetDate);
}

export function savingsStatus(
  goal: Pick<SavingsGoal, 'targetAmount' | 'targetDate'>,
  balance: number,
  today: Date = new Date(),
): SavingsStatus {
  if (
    isFiniteNumber(goal.targetAmount) &&
    isFiniteNumber(balance) &&
    goal.targetAmount > 0 &&
    balance >= goal.targetAmount
  ) {
    return 'achieved';
  }

  const days = daysUntil(goal.targetDate, today);
  if (days !== null && days < 0) return 'overdue';
  return 'active';
}

/** `21 Okt 2026` in the active language. */
export function formatTargetDate(
  targetDate: string | null,
  lang: Language = 'id',
): string | null {
  if (!targetDate) return null;
  const date = parseDateKey(targetDate);
  if (!date) return null;
  return new Intl.DateTimeFormat(localeTagFor(lang), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** `Hari ini` / `N hari lagi` / `Lewat target`, localized. */
export function dateLabel(
  targetDate: string | null,
  today: Date = new Date(),
  lang: Language = 'id',
): string | null {
  const days = daysUntil(targetDate, today);
  if (days === null) return null;
  const copy = dictionaryFor(lang).savings.date;
  if (days < 0) return copy.overdue;
  if (days === 0) return copy.today;
  return fill(copy.daysLeft, { days });
}

/**
 * Rough monthly set-aside: remaining divided by whole 30-day months left,
 * rounded up to the nearest 1.000. Presentation only — not a transfer
 * schedule, not financial advice. Null unless the goal is active, dated, at
 * least 30 days out and still short of target.
 */
export function estimatePerMonth(
  goal: Pick<SavingsGoal, 'targetAmount' | 'targetDate'>,
  balance: number,
  today: Date = new Date(),
): number | null {
  if (savingsStatus(goal, balance, today) !== 'active') return null;
  const days = daysUntil(goal.targetDate, today);
  if (days === null || days < 30) return null;
  const remaining = goal.targetAmount - balance;
  if (!isFiniteNumber(remaining) || remaining <= 0) return null;
  return Math.ceil(remaining / (days / 30) / 1000) * 1000;
}

/** Trimmed name, or null for a blank field (the column is nullable). */
export function normalizeSavingsName(raw: string): string | null {
  const trimmed = raw.trim();
  return trimmed === '' ? null : trimmed;
}

function isValidDateKey(key: string): boolean {
  return parseDateKey(key) !== null;
}

export function validateSavingsGoal(
  input: SavingsGoalInput,
  options: SavingsGoalValidationOptions = {},
): SavingsGoalFieldErrors {
  const lang = options.language ?? 'id';
  const today = options.today ?? new Date();
  const messages = dictionaryFor(lang).savings.validation;

  const walletId = input.walletId ? null : messages.walletRequired;

  let targetAmount: string | null = null;
  const rawAmount = input.targetAmountRaw.trim();
  if (rawAmount === '') {
    targetAmount = messages.amountRequired;
  } else {
    const parsed = parseAmountInput(rawAmount);
    if (parsed === null) {
      const digits = rawAmount.replace(/[^0-9]/g, '');
      targetAmount =
        digits.length > String(AMOUNT_MAX).length
          ? fill(messages.amountTooLarge, { max: AMOUNT_MAX })
          : messages.amountInvalid;
    } else if (parsed <= 0) {
      targetAmount = messages.amountTooSmall;
    } else if (parsed > AMOUNT_MAX) {
      targetAmount = fill(messages.amountTooLarge, { max: AMOUNT_MAX });
    }
  }

  const name = normalizeSavingsName(input.name);
  const nameError =
    name !== null && name.length > NAME_MAX_LENGTH
      ? fill(messages.nameTooLong, { max: NAME_MAX_LENGTH })
      : null;

  let targetDate: string | null = null;
  const date = input.targetDate?.trim() ?? '';
  if (date !== '') {
    if (!isValidDateKey(date)) {
      targetDate = messages.dateInvalid;
    } else if (
      date < localDateKey(today) &&
      date !== (options.originalDate ?? null)
    ) {
      targetDate = messages.datePast;
    }
  }

  return {
    walletId,
    targetAmount,
    name: nameError,
    targetDate,
  };
}

export function hasSavingsErrors(errors: SavingsGoalFieldErrors): boolean {
  return Object.values(errors).some((error) => error !== null);
}

/** Nearest deadline first, undated last, then oldest goal first. */
export function sortSavingsGoals<T extends SavingsGoal>(goals: T[]): T[] {
  return [...goals].sort((a, b) => {
    if (a.targetDate === null && b.targetDate !== null) return 1;
    if (a.targetDate !== null && b.targetDate === null) return -1;
    if (a.targetDate !== null && b.targetDate !== null) {
      if (a.targetDate !== b.targetDate) {
        return a.targetDate < b.targetDate ? -1 : 1;
      }
    }
    if (a.createdAt !== b.createdAt) {
      return a.createdAt < b.createdAt ? -1 : 1;
    }
    return 0;
  });
}

export function pickDashboardGoal<T extends SavingsGoal>(
  goals: T[],
): T | null {
  return sortSavingsGoals(goals)[0] ?? null;
}

/** Goals whose wallet is archived — hidden from the active list, still guard deletes. */
export function hiddenGoalCount(
  goals: Pick<SavingsGoal, 'walletId'>[],
  archivedWallets: Pick<Wallet, 'id'>[],
): number {
  const archivedIds = new Set(archivedWallets.map((wallet) => wallet.id));
  return goals.filter((goal) => archivedIds.has(goal.walletId)).length;
}

/** Active wallets that do not have a goal yet (the create form's picker). */
export function availableWallets(
  wallets: Wallet[],
  goals: Pick<SavingsGoal, 'walletId'>[],
): Wallet[] {
  const used = new Set(goals.map((goal) => goal.walletId));
  return wallets.filter((wallet) => !used.has(wallet.id));
}
