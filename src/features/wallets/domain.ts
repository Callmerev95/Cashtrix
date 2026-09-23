/**
 * Wallet domain — pure functions only (no bridge, no network).
 *
 * This is the Jest seam from `specs/cashtrix-mvp.md`: money formatting and
 * input validation live here so they can be tested without Supabase or React.
 *
 * Key rules (PRD §2.3 Epic B / §4.6):
 *  - Maximum 10 wallets per account (`MAX_WALLETS`), enforced in the DB *and*
 *    here so the button can be disabled before a request is wasted.
 *  - `opening_balance` may be negative (a card can start in debt) and follows
 *    the same bounds as a transaction amount.
 *  - No custom colour picker in MVP: the colour/icon comes from the type token
 *    (`walletTypeMeta`). The DB stores only `type`.
 */

import { dictionaryFor, fill } from '@/i18n/dictionaries';
import { id } from '@/i18n/id';
import type { Language } from '@/i18n/locale';

export const MAX_WALLETS = 10;

export const WALLET_TYPES = ['bank', 'ewallet', 'cash', 'card'] as const;
export type WalletType = (typeof WALLET_TYPES)[number];

export const WALLET_NAME_MAX = 60;
/** Currency entry bound shared with transactions (PRD §2.3 Epic C). */
export const AMOUNT_MAX = 999_999_999_999;

export type Wallet = {
  id: string;
  name: string;
  type: WalletType;
  openingBalance: number;
  balance: number;
  transactionCount: number;
  /**
   * Archive marker (V4). An archived wallet keeps its rows and its history —
   * it only disappears from the Dashboard and every picker. `null` = active.
   */
  archivedAt: string | null;
};

export function isWalletType(value: unknown): value is WalletType {
  return typeof value === 'string' && (WALLET_TYPES as readonly string[]).includes(value);
}

// ---------------------------------------------------------------------------
// Amount parsing / formatting
// ---------------------------------------------------------------------------

/**
 * Parses a user-typed amount (`"1.250.000"`, `"12,5"`, `"Rp 40 000"`) into a
 * number. Returns `null` when it is not a finite number in range — callers
 * show the inline error, never NaN.
 *
 * `id-ID` uses `.` as thousands separator and `,` as the decimal separator.
 */
export function parseAmountInput(raw: string): number | null {
  const cleaned = raw.replace(/[^0-9.,-]/g, '');
  if (cleaned === '') return null;

  const normalized = cleaned.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d*)?$/.test(normalized)) return null;

  const value = Number(normalized);
  if (!Number.isFinite(value)) return null;
  if (Math.abs(value) > AMOUNT_MAX) return null;
  if (/(\.\d{3,})$/.test(normalized)) return null; // more than 2 decimals

  return value;
}

/** Grouped digits (C6: separators follow the active language — `.`/`,` in
 * id-ID, `,`/`.` in en-US; the default keeps the locked id-ID behaviour). */
export function formatAmount(value: number, lang: Language = 'id'): string {
  const thousand = lang === 'en' ? ',' : '.';
  const decimal = lang === 'en' ? '.' : ',';
  const sign = value < 0 ? '-' : '';
  const [whole, decimals] = Math.abs(value).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, thousand);
  return decimals === '00'
    ? `${sign}${grouped}`
    : `${sign}${grouped}${decimal}${decimals}`;
}

/** `Rp 1.250.000` — the dashboard/list rendering shared by every wallet UI. */
export function formatCurrency(
  value: number,
  currency = 'Rp',
  lang: Language = 'id',
): string {
  return `${value < 0 ? '-' : ''}${currency} ${formatAmount(Math.abs(value), lang)}`;
}

// ---------------------------------------------------------------------------
// Validation (copy from PRD §2.3 Epic B, mirrored in ticket #5)
// ---------------------------------------------------------------------------

export const walletMessages = {
  nameRequired: id.wallets.validation.nameRequired,
  nameTooLong: fill(id.wallets.validation.nameTooLong, {
    max: WALLET_NAME_MAX,
  }),
  nameDuplicate: id.wallets.validation.nameDuplicate,
  amountInvalid: fill(id.wallets.validation.amountInvalid, {
    max: AMOUNT_MAX,
  }),
  amountInvalidNumber: id.wallets.validation.amountInvalidNumber,
  limitReached: fill(id.wallets.validation.limitReached, {
    max: MAX_WALLETS,
  }),
  deleteConfirm: id.wallets.validation.deleteConfirm,
  reassignRequired: id.wallets.validation.reassignRequired,
} as const;

export type WalletFieldErrors = {
  name?: string;
  openingBalance?: string;
};

/**
 * Validates the wallet form. `existingNames` are the *other* wallets of the
 * user (case-insensitive), because `unique(user_id, name)` in the DB rejects
 * duplicates and a 409 after a round trip is a worse experience than inline.
 */
export function validateWallet(
  input: {
    name: string;
    openingBalanceRaw: string;
    existingNames?: string[];
  },
  lang: Language = 'id',
): WalletFieldErrors {
  const messages = dictionaryFor(lang).wallets.validation;
  const errors: WalletFieldErrors = {};

  const name = input.name.trim();
  if (name === '') {
    errors.name = messages.nameRequired;
  } else if (name.length > WALLET_NAME_MAX) {
    errors.name = fill(messages.nameTooLong, { max: WALLET_NAME_MAX });
  } else if (
    (input.existingNames ?? []).some(
      (existing) => existing.trim().toLowerCase() === name.toLowerCase(),
    )
  ) {
    errors.name = messages.nameDuplicate;
  }

  const raw = input.openingBalanceRaw.trim();
  if (raw !== '') {
    const parsed = parseAmountInput(raw);
    if (parsed === null) {
      errors.openingBalance = /[^0-9.,\s-]/.test(raw)
        ? messages.amountInvalidNumber
        : fill(messages.amountInvalid, { max: AMOUNT_MAX });
    }
  }

  return errors;
}

export function hasWalletErrors(errors: WalletFieldErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/** Parses the opening-balance field; an empty field means 0. */
export function openingBalanceFromInput(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === '') return 0;
  return parseAmountInput(trimmed) ?? 0;
}

// ---------------------------------------------------------------------------
// Type metadata — colour/icon come from design tokens, never from the user
// ---------------------------------------------------------------------------

export type WalletTypeMeta = {
  label: string;
  /** Material Symbols icon name (DESIGN.md: Material Symbols Outlined). */
  icon: string;
  /** Theme token name resolved by the caller (keeps hex out of domain code). */
  accent: 'accent' | 'textSecondary' | 'textPrimary';
};

export const walletTypeMeta: Record<WalletType, WalletTypeMeta> = {
  bank: { label: id.wallets.type.bank, icon: 'account-balance', accent: 'accent' },
  ewallet: { label: id.wallets.type.ewallet, icon: 'smartphone', accent: 'accent' },
  cash: { label: id.wallets.type.cash, icon: 'payments', accent: 'accent' },
  card: { label: id.wallets.type.card, icon: 'credit-card', accent: 'textSecondary' },
};

/** Type label in the active language (C6). */
export function walletTypeLabel(type: WalletType, lang: Language = 'id'): string {
  return dictionaryFor(lang).wallets.type[type];
}

// ---------------------------------------------------------------------------
// Archive split (V4) — Dashboard and pickers render `activeWallets` only;
// the Wallets screen also renders `archivedWallets` with an unarchive action.
// ---------------------------------------------------------------------------

/** Active (unarchived) wallets, in list order. */
export function activeWallets(wallets: Wallet[]): Wallet[] {
  return wallets.filter((wallet) => wallet.archivedAt === null);
}

/** Archived wallets, in list order (feeds the manage screen's archive row). */
export function archivedWallets(wallets: Wallet[]): Wallet[] {
  return wallets.filter((wallet) => wallet.archivedAt !== null);
}

// ---------------------------------------------------------------------------
// Derived view data
// ---------------------------------------------------------------------------

export type WalletSummary = {
  /** Σ balance across every visible wallet — the Dashboard hero number. */
  totalBalance: number;
  count: number;
  /** How many more wallets may be created (0 disables the add action). */
  remainingSlots: number;
};

export function summarizeWallets(wallets: Wallet[]): WalletSummary {
  const totalBalance = wallets.reduce((sum, wallet) => sum + wallet.balance, 0);
  return {
    totalBalance,
    count: wallets.length,
    remainingSlots: Math.max(0, MAX_WALLETS - wallets.length),
  };
}
