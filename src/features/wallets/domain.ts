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

/** Formats a number as `id-ID` grouped digits (no currency glyph). */
export function formatAmount(value: number): string {
  const sign = value < 0 ? '-' : '';
  const [whole, decimals] = Math.abs(value).toFixed(2).split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return decimals === '00' ? `${sign}${grouped}` : `${sign}${grouped},${decimals}`;
}

/** `Rp 1.250.000` — the dashboard/list rendering shared by every wallet UI. */
export function formatCurrency(value: number, currency = 'Rp'): string {
  return `${value < 0 ? '-' : ''}${currency} ${formatAmount(Math.abs(value))}`;
}

// ---------------------------------------------------------------------------
// Validation (copy from PRD §2.3 Epic B, mirrored in ticket #5)
// ---------------------------------------------------------------------------

export const walletMessages = {
  nameRequired: 'Nama dompet wajib diisi',
  nameTooLong: `Nama dompet maksimal ${WALLET_NAME_MAX} karakter`,
  nameDuplicate: 'Nama dompet sudah dipakai',
  amountInvalid: `Nominal harus antara 0 dan ${AMOUNT_MAX}`,
  amountInvalidNumber: 'Nominal tidak valid',
  limitReached: `Maksimal ${MAX_WALLETS} dompet`,
  deleteConfirm: 'Hapus dompet ini?',
  reassignRequired: 'Pilih dompet tujuan untuk memindahkan transaksi',
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
export function validateWallet(input: {
  name: string;
  openingBalanceRaw: string;
  existingNames?: string[];
}): WalletFieldErrors {
  const errors: WalletFieldErrors = {};

  const name = input.name.trim();
  if (name === '') {
    errors.name = walletMessages.nameRequired;
  } else if (name.length > WALLET_NAME_MAX) {
    errors.name = walletMessages.nameTooLong;
  } else if (
    (input.existingNames ?? []).some(
      (existing) => existing.trim().toLowerCase() === name.toLowerCase(),
    )
  ) {
    errors.name = walletMessages.nameDuplicate;
  }

  const raw = input.openingBalanceRaw.trim();
  if (raw !== '') {
    const parsed = parseAmountInput(raw);
    if (parsed === null) {
      errors.openingBalance = /[^0-9.,\s-]/.test(raw)
        ? walletMessages.amountInvalidNumber
        : walletMessages.amountInvalid;
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
  bank: { label: 'Bank', icon: 'account-balance', accent: 'accent' },
  ewallet: { label: 'E-Wallet', icon: 'smartphone', accent: 'accent' },
  cash: { label: 'Tunai', icon: 'payments', accent: 'accent' },
  card: { label: 'Kartu', icon: 'credit-card', accent: 'textSecondary' },
};

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
