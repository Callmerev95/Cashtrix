import {
  OUTBOX_CAP,
  OUTBOX_DONE_MS,
  OUTBOX_PHOTO_TTL_MS,
  OUTBOX_RETRY_DELAYS_MS,
  READ_CACHE_LIMIT,
  coalesceOnEdit,
  dropOnDelete,
  isFailedOutboxRow,
  isPendingTransactionFailed,
  isQueueFull,
  outboxDiscardDecision,
  isRetryableOutboxRow,
  mergePendingRows,
  outboxFailureFor,
  outboxRetryDelay,
  referencedReceiptPaths,
  shouldQueueSaveError,
  sortFifo,
  summarizeOutbox,
  toPendingTransaction,
  type OutboxDisplay,
  type OutboxRow,
} from '@/features/outbox';
import type { Transaction } from '@/features/transactions/domain';

function display(overrides: Partial<OutboxDisplay> = {}): OutboxDisplay {
  return {
    type: 'expense',
    amount: 25_000,
    note: 'kopi',
    occurredAt: '2026-10-22T03:00:00.000Z',
    walletName: 'BCA',
    categoryName: 'Makanan',
    categoryIcon: 'restaurant',
    counterpartyWalletName: null,
    ...overrides,
  };
}

function row(overrides: Partial<OutboxRow> = {}): OutboxRow {
  const id = overrides.id ?? 'id-1';
  return {
    id,
    userId: 'user-1',
    status: 'waiting',
    createdAt: '2026-10-22T03:00:00.000Z',
    updatedAt: '2026-10-22T03:00:00.000Z',
    payload: {
      userId: 'user-1',
      walletId: 'wallet-1',
      categoryId: 'cat-1',
      counterpartyWalletId: null,
      type: 'expense',
      amount: 25_000,
      occurredAt: '2026-10-22T03:00:00.000Z',
      note: 'kopi',
      idempotencyKey: id,
      receiptIds: [],
      receiptPaths: ['file:///photo.jpg'],
    },
    display: display(),
    errorKind: null,
    errorMessage: null,
    ...overrides,
  };
}

function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx-1',
    type: 'expense',
    amount: 10_000,
    currencyCode: 'IDR',
    occurredAt: '2026-10-22T03:00:00.000Z',
    note: null,
    categoryId: 'cat-1',
    categoryName: 'Makanan',
    categoryIcon: 'restaurant',
    walletId: 'wallet-1',
    walletName: 'BCA',
    counterpartyWalletId: null,
    counterpartyWalletName: null,
    ...overrides,
  };
}

describe('outbox constants', () => {
  it('locks the queue/cache/photo windows from the spec', () => {
    expect(OUTBOX_CAP).toBe(200);
    expect(READ_CACHE_LIMIT).toBe(100);
    expect(OUTBOX_PHOTO_TTL_MS).toBe(7 * 24 * 3600 * 1000);
    expect(isQueueFull(199)).toBe(false);
    expect(isQueueFull(200)).toBe(true);
  });

  it('backs retryable rows off in bounded steps', () => {
    expect(OUTBOX_RETRY_DELAYS_MS).toEqual([5_000, 15_000, 60_000]);
    expect(outboxRetryDelay(0)).toBe(5_000);
    expect(outboxRetryDelay(1)).toBe(15_000);
    expect(outboxRetryDelay(2)).toBe(60_000);
    expect(outboxRetryDelay(9)).toBe(60_000);
  });
});

describe('shouldQueueSaveError', () => {
  it('queues every failure while offline', () => {
    expect(shouldQueueSaveError(new Error('boom'), false)).toBe(true);
  });

  it('queues only transport/5xx failures while online', () => {
    expect(shouldQueueSaveError({ status: 500 }, true)).toBe(true);
    expect(
      shouldQueueSaveError({ context: { status: 503 } }, true),
    ).toBe(true);
    expect(shouldQueueSaveError({ status: 400 }, true)).toBe(false);
    expect(shouldQueueSaveError({ status: 422 }, true)).toBe(false);
    expect(shouldQueueSaveError(new TypeError('Network request failed'), true)).toBe(
      true,
    );
    expect(shouldQueueSaveError(new Error('fetch failed'), true)).toBe(true);
    expect(shouldQueueSaveError(new Error('duplicate key'), true)).toBe(false);
  });

  it('does not queue unknown errors (they stay visible to the form)', () => {
    expect(shouldQueueSaveError(new Error('RLS said no'), true)).toBe(false);
    expect(shouldQueueSaveError('weird', true)).toBe(false);
  });
});

describe('flush failure classification', () => {
  it('separates transport failures from terminal server refusals', () => {
    expect(outboxFailureFor({ status: 503 })).toEqual({
      kind: 'network',
      code: 'network',
    });
    expect(outboxFailureFor({ code: '23503' })).toEqual({
      kind: 'server',
      code: 'missing_reference',
    });
    expect(outboxFailureFor({ code: '23514' })).toEqual({
      kind: 'server',
      code: 'invalid_data',
    });
    expect(outboxFailureFor({ code: '42501' })).toEqual({
      kind: 'server',
      code: 'permission',
    });
    expect(outboxFailureFor({ code: '23505' })).toEqual({
      kind: 'server',
      code: 'rejected',
    });
  });

  it('retries waiting, crash-stale sending, and network failures only', () => {
    expect(isRetryableOutboxRow(row({ status: 'waiting' }))).toBe(true);
    expect(isRetryableOutboxRow(row({ status: 'sending' }))).toBe(true);
    expect(
      isRetryableOutboxRow(
        row({ status: 'failed', errorKind: 'network', errorMessage: 'network' }),
      ),
    ).toBe(true);
    expect(
      isRetryableOutboxRow(
        row({ status: 'failed', errorKind: 'server', errorMessage: 'rejected' }),
      ),
    ).toBe(false);
  });
});

describe('toPendingTransaction', () => {
  it('maps an expense with the frozen display labels', () => {
    const pending = toPendingTransaction(row());
    expect(pending).toMatchObject({
      id: 'id-1',
      type: 'expense',
      amount: 25_000,
      walletName: 'BCA',
      categoryName: 'Makanan',
      categoryIcon: 'restaurant',
      pending: true,
    });
  });

  it('carries the failure code and local photo paths for the form', () => {
    const pending = toPendingTransaction(
      row({
        status: 'failed',
        errorKind: 'server',
        errorMessage: 'invalid_data',
        payload: {
          ...row().payload,
          receiptIds: ['receipt-1'],
          receiptPaths: ['file:///proof.jpg'],
        },
      }),
    );
    expect(pending.pendingError).toBe('invalid_data');
    expect(pending.pendingReceiptIds).toEqual(['receipt-1']);
    expect(pending.pendingReceiptPaths).toEqual(['file:///proof.jpg']);
  });

  it('maps a transfer with the feed label/icon fallbacks', () => {
    const pending = toPendingTransaction(
      row({
        display: display({
          type: 'transfer',
          categoryName: null,
          categoryIcon: null,
          counterpartyWalletName: 'GoPay',
        }),
      }),
    );
    expect(pending.categoryId).toBeNull();
    expect(pending.categoryName).toBe('Transfer ke GoPay');
    expect(pending.categoryIcon).toBe('swap-horiz');
    expect(pending.counterpartyWalletName).toBe('GoPay');
  });
});

describe('mergePendingRows', () => {
  it('sorts by date and puts pending first on a tie', () => {
    const server = [
      transaction({ id: 'server-new', occurredAt: '2026-10-22T04:00:00.000Z' }),
      transaction({ id: 'server-old', occurredAt: '2026-10-20T04:00:00.000Z' }),
    ];
    const pending = [
      transaction({
        id: 'queued',
        pending: true,
        occurredAt: '2026-10-22T04:00:00.000Z',
      }),
    ];

    expect(mergePendingRows(server, pending).map((item) => item.id)).toEqual([
      'queued',
      'server-new',
      'server-old',
    ]);
  });

  it('keeps a backdated queued row in its real day', () => {
    const server = [
      transaction({ id: 'server', occurredAt: '2026-10-22T04:00:00.000Z' }),
    ];
    const pending = [
      transaction({
        id: 'old-queued',
        pending: true,
        occurredAt: '2026-10-10T04:00:00.000Z',
      }),
    ];

    expect(mergePendingRows(server, pending).map((item) => item.id)).toEqual([
      'server',
      'old-queued',
    ]);
  });

  it('does no work when the queue is empty', () => {
    const server = [transaction()];
    expect(mergePendingRows(server, [])).toBe(server);
  });
});

describe('queue editing helpers', () => {
  it('orders FIFO by createdAt, then id', () => {
    const rows = [
      row({ id: 'b', createdAt: '2026-10-22T03:00:00.000Z' }),
      row({ id: 'a', createdAt: '2026-10-22T03:00:00.000Z' }),
      row({ id: 'c', createdAt: '2026-10-22T02:00:00.000Z' }),
    ];
    expect(sortFifo(rows).map((item) => item.id)).toEqual(['c', 'a', 'b']);
  });

  it('coalesces a waiting/failed row and preserves its place in line', () => {
    const original = row({
      id: 'a',
      status: 'failed',
      errorKind: 'server',
      errorMessage: '500',
      createdAt: '2026-10-22T01:00:00.000Z',
    });
    const next = row({
      id: 'a',
      status: 'waiting',
      createdAt: '2026-10-22T05:00:00.000Z',
      payload: { ...row().payload, amount: 40_000 },
    });

    expect(coalesceOnEdit([original], next)[0]).toMatchObject({
      id: 'a',
      createdAt: '2026-10-22T01:00:00.000Z',
      status: 'waiting',
      errorKind: null,
      errorMessage: null,
      payload: { amount: 40_000 },
    });
  });

  it('never rewrites a row that is currently sending', () => {
    const sending = row({ id: 'a', status: 'sending' });
    expect(coalesceOnEdit([sending], row({ id: 'a' }))[0]).toBe(sending);
  });

  it('drops waiting rows but leaves a sending row to finish', () => {
    const rows = [
      row({ id: 'waiting' }),
      row({ id: 'sending', status: 'sending' }),
    ];
    expect(dropOnDelete(rows, 'waiting').map((item) => item.id)).toEqual([
      'sending',
    ]);
    expect(dropOnDelete(rows, 'sending')).toHaveLength(2);
  });

  it('collects only the paths referenced by queue rows', () => {
    expect(
      referencedReceiptPaths([
        row({ id: 'a' }),
        row({
          id: 'b',
          payload: { ...row().payload, receiptPaths: ['file:///b.jpg'] },
        }),
      ]),
    ).toEqual(['file:///photo.jpg', 'file:///b.jpg']);
  });
});

describe('outbox summary (OB3)', () => {
  it('counts retryable rows as waiting and only terminal refusals as failed', () => {
    const rows = [
      row({ id: 'waiting' }),
      row({ id: 'sending', status: 'sending' }),
      row({ id: 'network', status: 'failed', errorKind: 'network' }),
      row({ id: 'server', status: 'failed', errorKind: 'server' }),
    ];

    expect(summarizeOutbox(rows)).toEqual({ waiting: 3, failed: 1 });
    expect(isFailedOutboxRow(rows[3])).toBe(true);
    expect(isFailedOutboxRow(rows[2])).toBe(false);
  });

  it('treats an empty queue as zero of both', () => {
    expect(summarizeOutbox([])).toEqual({ waiting: 0, failed: 0 });
  });

  it('marks a pending feed row failed only for non-network errors', () => {
    expect(
      isPendingTransactionFailed(
        transaction({ pending: true, pendingError: 'invalid_data' }),
      ),
    ).toBe(true);
    expect(
      isPendingTransactionFailed(
        transaction({ pending: true, pendingError: 'network' }),
      ),
    ).toBe(false);
    expect(isPendingTransactionFailed(transaction())).toBe(false);
  });

  it('keeps the done confirmation short and explicit', () => {
    expect(OUTBOX_DONE_MS).toBe(4_000);
  });

  it('allows discard only for rows still in the queue and not sending', () => {
    const rows = [
      row({ id: 'waiting' }),
      row({ id: 'failed', status: 'failed', errorKind: 'server' }),
      row({ id: 'sending', status: 'sending' }),
    ];
    expect(outboxDiscardDecision(rows, 'waiting')).toBe('discard');
    expect(outboxDiscardDecision(rows, 'failed')).toBe('discard');
    expect(outboxDiscardDecision(rows, 'sending')).toBe('sending');
    expect(outboxDiscardDecision(rows, 'gone')).toBe('missing');
  });
});
