/**
 * Outbox domain (OB1/OB2, issues #74/#75) — pure logic for the offline queue.
 *
 * The queue stores a complete save payload plus the labels the History list
 * needs while the server is unreachable. Nothing here talks to SQLite, React,
 * or i18n: the store/context owns those seams, and tests can exercise every
 * rule offline.
 */
import type { Language } from '@/i18n';
import {
  TRANSFER_ICON,
  transferFeedLabel,
  type Transaction,
  type TransactionType,
} from '../transactions/domain';

/** Hard cap per user — mirrors `OUTBOX_CAP` in the frozen OB spec. */
export const OUTBOX_CAP = 200;

/** Rows kept in the local feed cache (already-loaded rows only). */
export const READ_CACHE_LIMIT = 100;

/** Local photos are swept after this window when no queue row references them. */
export const OUTBOX_PHOTO_TTL_MS = 7 * 24 * 3600 * 1000;

/** How long the strip keeps the “sent” confirmation after a clean flush. */
export const OUTBOX_DONE_MS = 4_000;

/** A committed save must not hold the queue in `sending` forever. */
export const OUTBOX_SEND_TIMEOUT_MS = 20_000;

/** Photos/OCR are proof, not the save; cap their best-effort tail. */
export const OUTBOX_ATTACHMENT_TIMEOUT_MS = 15_000;

/** Linking an already-uploaded photo is a fast DB write, not an upload. */
export const OUTBOX_LINK_TIMEOUT_MS = 10_000;

/** Bounded backoff for retryable rows while the app stays online. */
export const OUTBOX_RETRY_DELAYS_MS = [5_000, 15_000, 60_000] as const;

export function outboxRetryDelay(attempt: number): number {
  const index = Math.min(
    Math.max(attempt, 0),
    OUTBOX_RETRY_DELAYS_MS.length - 1,
  );
  return OUTBOX_RETRY_DELAYS_MS[index];
}

export type OutboxStatus = 'waiting' | 'sending' | 'failed';
export type OutboxErrorKind = 'network' | 'server' | null;

export type OutboxSummary = {
  /** Rows still eligible for the next flush (waiting + network failures). */
  waiting: number;
  /** Rows the server refused; only repair or discard clears them. */
  failed: number;
};

/**
 * Stable failure codes persisted in `error_message`. The UI maps them to
 * localized copy — raw server text is never shown and a language change must
 * not freeze the reason in the old language.
 */
export type OutboxFailureCode =
  | 'network'
  | 'missing_reference'
  | 'invalid_data'
  | 'permission'
  | 'rejected';

export type OutboxFailure = {
  kind: Exclude<OutboxErrorKind, null>;
  code: OutboxFailureCode;
};

/**
 * Everything `createTransaction` needs, persisted as JSON. `userId` is part
 * of the payload so a future flush can rebuild a `TransactionDraft` without
 * consulting React state.
 */
export type OutboxPayload = {
  userId: string;
  walletId: string;
  categoryId: string | null;
  counterpartyWalletId: string | null;
  type: TransactionType;
  amount: number;
  occurredAt: string;
  note: string | null;
  idempotencyKey: string;
  /** Receipt rows already uploaded (online captures). */
  receiptIds: string[];
  /** Local photos captured offline; uploaded by the flush (OB2). */
  receiptPaths: string[];
};

/** Labels frozen at enqueue time so History renders without a join. */
export type OutboxDisplay = {
  type: TransactionType;
  amount: number;
  note: string | null;
  occurredAt: string;
  walletName: string;
  categoryName: string | null;
  categoryIcon: string | null;
  counterpartyWalletName: string | null;
};

export type OutboxRow = {
  /** Same as `payload.idempotencyKey` — the queue id is the retry key. */
  id: string;
  userId: string;
  status: OutboxStatus;
  createdAt: string;
  updatedAt: string;
  payload: OutboxPayload;
  display: OutboxDisplay;
  errorKind: OutboxErrorKind;
  errorMessage: string | null;
};

export type OutboxEnqueueInput = Omit<OutboxPayload, 'userId'> & {
  userId: string;
  display: OutboxDisplay;
};

export class OutboxFullError extends Error {
  constructor() {
    super('outbox-full');
    this.name = 'OutboxFullError';
  }
}

export class OutboxUnavailableError extends Error {
  constructor() {
    super('outbox-unavailable');
    this.name = 'OutboxUnavailableError';
  }
}

export function isQueueFull(count: number): boolean {
  return count >= OUTBOX_CAP;
}

function readStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as {
    status?: unknown;
    context?: { status?: unknown };
  };
  const value = candidate.status ?? candidate.context?.status;
  return typeof value === 'number' ? value : null;
}

function readName(error: unknown): string {
  return error instanceof Error ? error.name : '';
}

function readMessage(error: unknown): string {
  return error instanceof Error ? error.message : '';
}

function readCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const value = (error as { code?: unknown }).code;
  return typeof value === 'string' ? value : null;
}

/**
 * Classifies a failed flush attempt. Transport/5xx failures stay retryable on
 * the next reconnect; a 4xx/constraint refusal is terminal until the user
 * repairs or discards the row (T3).
 */
export function outboxFailureFor(error: unknown): OutboxFailure {
  if (shouldQueueSaveError(error, true)) {
    return { kind: 'network', code: 'network' };
  }

  const code = readCode(error);
  if (code === '23503') {
    return { kind: 'server', code: 'missing_reference' };
  }
  if (code === '23514') {
    return { kind: 'server', code: 'invalid_data' };
  }
  if (code === '42501') {
    return { kind: 'server', code: 'permission' };
  }
  return { kind: 'server', code: 'rejected' };
}

/** Waiting rows, crash-stale `sending` rows, and retryable network failures. */
export function isRetryableOutboxRow(row: OutboxRow): boolean {
  return (
    row.status === 'waiting' ||
    row.status === 'sending' ||
    (row.status === 'failed' && row.errorKind === 'network')
  );
}

/** A terminal server refusal — not something the next reconnect can fix. */
export function isFailedOutboxRow(row: OutboxRow): boolean {
  return row.status === 'failed' && row.errorKind !== 'network';
}

/**
 * The strip’s two honest buckets: retryable rows are “waiting”, terminal
 * refusals are “failed”. No third “sending” bucket — it is a waiting row.
 */
export function summarizeOutbox(rows: OutboxRow[]): OutboxSummary {
  const failed = rows.filter(isFailedOutboxRow).length;
  return { waiting: rows.length - failed, failed };
}

export type OutboxDiscardDecision = 'discard' | 'missing' | 'sending';

/**
 * Long-press discard guard: a row that already left for the server must
 * finish (the server is the source of truth), and a row that vanished while
 * the sheet was open must not turn into an online delete.
 */
export function outboxDiscardDecision(
  rows: OutboxRow[],
  id: string,
): OutboxDiscardDecision {
  const row = rows.find((item) => item.id === id);
  if (!row) return 'missing';
  return row.status === 'sending' ? 'sending' : 'discard';
}

/**
 * Whether a failed save is safe to queue. Offline is always queueable; online
 * only transport/5xx failures are (a 4xx is a validation/RLS refusal that a
 * retry would repeat forever). Deliberately conservative — unknown errors
 * surface to the form instead of silently entering a queue that cannot land.
 */
export function shouldQueueSaveError(
  error: unknown,
  isOnline: boolean,
): boolean {
  if (!isOnline) return true;

  const status = readStatus(error);
  if (status !== null) return status >= 500;

  const name = readName(error);
  if (
    name === 'TypeError' ||
    name === 'AbortError' ||
    name === 'AuthRetryableFetchError'
  ) {
    return true;
  }

  return /network request failed|failed to fetch|fetch failed|networkerror|timeout|timed out|load failed/i.test(
    readMessage(error),
  );
}

/** True only when the queued row needs repair — network failures still wait. */
export function isPendingTransactionFailed(transaction: Transaction): boolean {
  return (
    transaction.pending === true &&
    typeof transaction.pendingError === 'string' &&
    transaction.pendingError.length > 0 &&
    transaction.pendingError !== 'network'
  );
}

/**
 * A queued row as a History row. `id` is the idempotency key, so a tap can
 * address the queue entry (OB2). The transfer label/icon fallbacks mirror the
 * feed view.
 */
export function toPendingTransaction(
  row: OutboxRow,
  lang: Language = 'id',
): Transaction {
  const transfer = row.display.type === 'transfer';
  return {
    id: row.id,
    type: row.display.type,
    amount: row.display.amount,
    currencyCode: 'IDR',
    occurredAt: row.display.occurredAt,
    note: row.display.note,
    categoryId: transfer ? null : row.payload.categoryId,
    categoryName: transfer
      ? transferFeedLabel(row.display.counterpartyWalletName, lang)
      : (row.display.categoryName ?? ''),
    categoryIcon: transfer
      ? TRANSFER_ICON
      : (row.display.categoryIcon ?? 'receipt'),
    walletId: row.payload.walletId,
    walletName: row.display.walletName,
    counterpartyWalletId: row.payload.counterpartyWalletId,
    counterpartyWalletName: row.display.counterpartyWalletName,
    pending: true,
    pendingError: row.status === 'failed' ? row.errorMessage : null,
    pendingReceiptIds: row.payload.receiptIds,
    pendingReceiptPaths: row.payload.receiptPaths,
  };
}

/**
 * Pending rows are newer locally than any server row with the same timestamp,
 * so the tie-break puts them first; the server's own order is preserved
 * otherwise. Sorting the combined list keeps day grouping correct even when
 * a queued row is backdated.
 */
export function mergePendingRows(
  server: Transaction[],
  pending: Transaction[],
): Transaction[] {
  if (pending.length === 0) return server;
  return [...pending, ...server].sort((a, b) => {
    const delta = Date.parse(b.occurredAt) - Date.parse(a.occurredAt);
    if (delta !== 0) return delta;
    if (a.pending !== b.pending) return a.pending ? -1 : 1;
    return 0;
  });
}

/** FIFO order for the flush engine (OB2). */
export function sortFifo(rows: OutboxRow[]): OutboxRow[] {
  return [...rows].sort((a, b) => {
    const delta = Date.parse(a.createdAt) - Date.parse(b.createdAt);
    return delta !== 0 ? delta : a.id.localeCompare(b.id);
  });
}

/**
 * Editing a waiting row replaces its payload while preserving its place in
 * the queue. Sending rows are never coalesced; a failed row returns to
 * `waiting` so the next flush retries it.
 */
export function coalesceOnEdit(
  rows: OutboxRow[],
  next: OutboxRow,
): OutboxRow[] {
  return rows.map((row) => {
    if (row.id !== next.id || row.status === 'sending') return row;
    return {
      ...next,
      createdAt: row.createdAt,
      updatedAt: next.updatedAt,
      status: 'waiting',
      errorKind: null,
      errorMessage: null,
    };
  });
}

/** Deleting a queued row drops it; a sending row is left to finish. */
export function dropOnDelete(rows: OutboxRow[], id: string): OutboxRow[] {
  return rows.filter((row) => row.id !== id || row.status === 'sending');
}

/** Local photo paths referenced by the queue — the orphan sweep keep-set. */
export function referencedReceiptPaths(rows: OutboxRow[]): string[] {
  return rows.flatMap((row) => row.payload.receiptPaths);
}
