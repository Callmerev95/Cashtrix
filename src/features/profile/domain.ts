/**
 * Profile domain — pure functions only (no bridge, no network).
 *
 * The Jest seam for T8 (#9): display-name validation (60 chars, PRD §2.3 Epic
 * F), custom-category validation (name 1..40, icon from the Material catalog,
 * kind locked to expense/income), currency validation (stored on the profile,
 * display only — no conversion, D5), and the visibility rule that merges the
 * two archive sources: `archived_at` for custom categories, per-user
 * `category_mutes` for shared system categories.
 */

export const DISPLAY_NAME_MAX_LENGTH = 60;
export const CATEGORY_NAME_MAX_LENGTH = 40;

/** Avatar pipeline contract (AC #9): resized before upload, bucket-capped. */
export const AVATAR_SIZE_PX = 512;
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_MIME_TYPES = ['image/png', 'image/jpeg'] as const;
export type AvatarMimeType = (typeof AVATAR_MIME_TYPES)[number];

export function isAvatarMimeType(value: unknown): value is AvatarMimeType {
  return (
    typeof value === 'string' &&
    (AVATAR_MIME_TYPES as readonly string[]).includes(value)
  );
}

export const CATEGORY_KINDS = ['expense', 'income'] as const;
export type CategoryKind = (typeof CATEGORY_KINDS)[number];

export function isCategoryKind(value: unknown): value is CategoryKind {
  return (
    typeof value === 'string' &&
    (CATEGORY_KINDS as readonly string[]).includes(value)
  );
}

/**
 * Icon catalog for custom categories (AC #9: name + icon from the Material
 * catalog, no color picker). Rendered with `@expo/vector-icons/MaterialIcons`
 * like every other category surface, so every entry must be a valid
 * Material Icons name — unknown names render as blank wells.
 *
 * Naming convention (bugfix ikon, pra-T11): `@expo/vector-icons@15` uses
 * DASHED names (`shopping-bag`), not underscores. The glyphmap is the ground
 * truth (`node_modules/@expo/vector-icons/.../glyphmaps/MaterialIcons.json`);
 * `__tests__/icon-convention.test.ts` pins this convention so a future
 * catalog addition with underscores fails loudly instead of blank at runtime.
 */
export const ICON_CATALOG = [
  // System icons, reusable for custom categories too.
  'restaurant',
  'directions-car',
  'shopping-bag',
  'receipt-long',
  'movie',
  'medical-services',
  'show-chart',
  'category',
  'payments',
  'redeem',
  'trending-up',
  'add-circle',
  // General extras.
  'home',
  'work',
  'school',
  'flight',
  'hotel',
  'shopping-cart',
  'fastfood',
  'local-cafe',
  'directions-bike',
  'music-note',
  'palette',
  'favorite',
] as const;

export type CatalogIcon = (typeof ICON_CATALOG)[number];

export function isCatalogIcon(value: unknown): value is CatalogIcon {
  return (
    typeof value === 'string' &&
    (ICON_CATALOG as readonly string[]).includes(value)
  );
}

/**
 * Currency choices for the profile setting (PRD D5: single display currency,
 * schema multi-ready, **no conversion**). Stored as `profiles.currency_code`;
 * every money surface formats through `formatMoney` with the stored code.
 */
export const SUPPORTED_CURRENCIES = [
  'IDR',
  'USD',
  'SGD',
  'MYR',
  'THB',
  'PHP',
  'JPY',
  'AUD',
  'EUR',
  'GBP',
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export function isCurrencyCode(value: unknown): value is CurrencyCode {
  return (
    typeof value === 'string' &&
    (SUPPORTED_CURRENCIES as readonly string[]).includes(value)
  );
}

/** Default when the profile row has no explicit choice. */
export const DEFAULT_CURRENCY: CurrencyCode = 'IDR';

// ---------------------------------------------------------------------------
// Validation (locked Indonesian copy, same style as the auth seam)
// ---------------------------------------------------------------------------

/** Returns the inline error, or `null` when the name is acceptable. */
export function validateDisplayName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'Nama wajib diisi';
  if (trimmed.length > DISPLAY_NAME_MAX_LENGTH) {
    return `Nama maksimal ${DISPLAY_NAME_MAX_LENGTH} karakter`;
  }
  return null;
}

/** Returns the inline error, or `null` when the name is acceptable. */
export function validateCategoryName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed === '') return 'Nama kategori wajib diisi';
  if (trimmed.length > CATEGORY_NAME_MAX_LENGTH) {
    return `Nama kategori maksimal ${CATEGORY_NAME_MAX_LENGTH} karakter`;
  }
  return null;
}

/** Returns the inline error, or `null` when the icon is in the catalog. */
export function validateCategoryIcon(icon: string): string | null {
  if (!isCatalogIcon(icon)) return 'Pilih ikon dari katalog';
  return null;
}

/** Returns the inline error, or `null` when the code is supported. */
export function validateCurrency(code: string): string | null {
  if (!isCurrencyCode(code)) return 'Mata uang tidak didukung';
  return null;
}

// ---------------------------------------------------------------------------
// Money display (no conversion — the code only changes the rendering)
// ---------------------------------------------------------------------------

/**
 * Formats an amount in the profile's display currency. Amounts are stored
 * positive with `type` carrying the direction (PRD §6.1 R4); this function
 * never signs, converts, or aggregates — it only renders.
 */
export function formatMoney(
  amount: number,
  currency: CurrencyCode,
  locale = 'id-ID',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

// ---------------------------------------------------------------------------
// Category visibility (two archive sources, one rule)
// ---------------------------------------------------------------------------

export type ManagedCategory = {
  id: string;
  name: string;
  icon: string;
  kind: CategoryKind;
  /** True for the shared seed rows (`user_id is null`). */
  isSystem: boolean;
  /** `archived_at is not null` — only ever set on custom categories. */
  archived: boolean;
  /** Present in `category_mutes` — only ever set on system categories. */
  muted: boolean;
};

/**
 * A category shows in pickers and grids unless it is archived (custom) or
 * muted (system). The two flags are disjoint by construction, so the rule is
 * a plain conjunction — no precedence to get wrong.
 */
export function isCategoryVisible(category: ManagedCategory): boolean {
  return !category.archived && !category.muted;
}

/** Picker options from the visible subset, in stable name order. */
export function visibleCategories(
  categories: ManagedCategory[],
): ManagedCategory[] {
  return categories
    .filter(isCategoryVisible)
    .sort((a, b) => a.name.localeCompare(b.name));
}
