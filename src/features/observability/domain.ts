/**
 * Observability domain (T10, issue #11) — the pure Jest seam.
 *
 * The one hard rule (PRD §4.4): no financial data may leave the device in a
 * log, crash report, or analytics payload. Every event below carries only
 * coarse, non-financial facts (screen names, transaction kinds, threshold
 * keys), and `scrubValue` is the defensive backstop — the sink runs every
 * outbound payload through it, so a future field addition cannot leak
 * `amount`/`note` by accident.
 *
 * Why no `@sentry/react-native` (PRD §4.3 says "Sentry atau setara"): it is a
 * native module, and this repo deliberately stays on Expo Go (cf. T5 refusing
 * a native date picker, T6 refusing `react-native-svg`). The sink in
 * `observability.ts` therefore defaults to a redacted local buffer + dev
 * console, with an injectable transport for Sentry once a dev-client build
 * adopts it. That is the "setara" the ticket allows.
 */

/** Event names the app may emit (PRD §4.3). Closed set — no ad-hoc strings. */
export const OBSERVABILITY_EVENT_NAMES = [
  'screen_view',
  'tx_created',
  'budget_threshold_reached',
] as const;

export type ObservabilityEventName =
  (typeof OBSERVABILITY_EVENT_NAMES)[number];

export type AnalyticsEvent = {
  name: ObservabilityEventName;
  params: Record<string, string | number | boolean>;
};

/**
 * Object keys that must never leave the device with their value intact.
 * Compared case-insensitively with `_` stripped, so `amountLimit`,
 * `amount_limit`, and `AMOUNT` all match.
 */
const FINANCIAL_KEYS = new Set([
  'amount',
  'note',
  'spent',
  'amountlimit',
  'openingbalance',
  'balance',
  'income',
  'expense',
  'net',
  'total',
  'totalexpense',
  'totalincome',
]);

/** Replacement written over every forbidden value. */
export const REDACTED = '[redacted]';

function isFinancialKey(key: string): boolean {
  return FINANCIAL_KEYS.has(key.toLowerCase().replace(/_/g, ''));
}

const MAX_SCRUB_DEPTH = 10;

/**
 * Deep-clones `value`, replacing every financial field with `[redacted]`.
 * Non-plain values (Date, class instances) pass through by reference — they
 * carry no user payload in our events. Circular refs become `[circular]`
 * instead of throwing.
 */
export function scrubValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_SCRUB_DEPTH) return REDACTED;
  if (value === null || typeof value !== 'object') return value;
  if (value instanceof Date) return value;
  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, depth + 1));
  }
  const seen = scrubValueSeen;
  if (seen.has(value)) return '[circular]';
  seen.add(value);
  try {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = isFinancialKey(key)
        ? REDACTED
        : scrubValue(entry, depth + 1);
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

// Module-level set threaded through one `scrubValue` call tree (entry points
// reset it, so concurrent calls cannot observe each other's cycles).
const scrubValueSeen = new Set<object>();

/**
 * `true` when any key anywhere in `value` is a financial key — the assertion
 * the AC "payload event tidak memuat amount/note mentah" is verified with.
 */
export function containsFinancialData(value: unknown): boolean {
  if (value === null || typeof value !== 'object') return false;
  if (value instanceof Date) return false;
  if (Array.isArray(value)) return value.some(containsFinancialData);
  if (typeof value === 'object') {
    if (seenContains.has(value)) return false;
    seenContains.add(value);
    try {
      return Object.entries(value).some(
        ([key, entry]) => isFinancialKey(key) || containsFinancialData(entry),
      );
    } finally {
      seenContains.delete(value);
    }
  }
  return false;
}

const seenContains = new Set<object>();

/**
 * Maps expo-router segments to a stable screen name for `screen_view`.
 * Group segments (`(tabs)`, `(auth)`) are navigation structure, not screens,
 * so they are dropped; the last remaining segment wins. Dashes become
 * underscores (`add-transaction` → `add_transaction`) for a stable taxonomy.
 */
export function screenNameFromSegments(segments: readonly string[]): string {
  const visible = segments.filter(
    (segment) =>
      segment.length > 0 &&
      !segment.startsWith('(') &&
      segment !== '+not-found',
  );
  const last = visible[visible.length - 1];
  if (!last) return 'unknown';
  return last.replace(/-/g, '_');
}

/** `screen_view` — carries only the screen name, never params or amounts. */
export function screenViewEvent(screen: string): AnalyticsEvent {
  return { name: 'screen_view', params: { screen } };
}

export type TransactionKind = 'expense' | 'income';

/**
 * `tx_created` — coarse facts only: which kind, and whether a note exists
 * (boolean, never the text). No amount, no wallet id, no category id.
 */
export function txCreatedEvent(input: {
  type: TransactionKind;
  hasNote: boolean;
}): AnalyticsEvent {
  return {
    name: 'tx_created',
    params: { type: input.type, has_note: input.hasNote },
  };
}

export type BudgetThreshold = 80 | 100;

function isBudgetThreshold(value: number): value is BudgetThreshold {
  return value === 80 || value === 100;
}

/**
 * `budget_threshold_reached` — the threshold key + month + category id.
 * Deliberately *without* `spent`/`amountLimit`: those are amounts, and the
 * AC forbids raw amounts in outbound payloads.
 */
export function budgetThresholdEvent(input: {
  threshold: number;
  month: string;
  categoryId: string;
}): AnalyticsEvent {
  if (!isBudgetThreshold(input.threshold)) {
    throw new Error(
      `threshold observability tidak dikenal: ${input.threshold}`,
    );
  }
  return {
    name: 'budget_threshold_reached',
    params: {
      threshold: input.threshold,
      month: input.month,
      category_id: input.categoryId,
    },
  };
}
