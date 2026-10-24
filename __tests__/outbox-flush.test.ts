/**
 * OB2 flush engine: FIFO, one outcome per row, network stops the pass,
 * server refusals continue, and receipts upload only after the transaction
 * commits. The in-memory DB keeps the assertions on real store reads.
 */
import {
  enqueueOutbox,
  flushOutbox,
  listOutbox,
  updateOutboxStatus,
  type OutboxEnqueueInput,
} from '@/features/outbox';
import {
  resetOutboxDatabaseForTests,
  setOutboxDatabaseForTests,
} from '@/features/outbox/db';
import { createMemoryOutboxDb } from './helpers/outbox-db';

const USER = 'user-1';

jest.mock('@/features/transactions/api', () => ({
  createTransaction: jest.fn(),
}));

jest.mock('@/features/receipts/api', () => ({
  uploadReceiptPhoto: jest.fn(),
  linkReceiptsToTransaction: jest.fn(async () => 0),
}));

jest.mock('@/features/receipts/scan', () => ({
  hasScanConsent: jest.fn(async () => false),
  scanReceipt: jest.fn(async () => ({ kind: 'ok' })),
}));

jest.mock('@/features/outbox/files', () => ({
  deleteOutboxPhoto: jest.fn(),
}));

const api = require('@/features/transactions/api') as {
  createTransaction: jest.Mock;
};
const receipts = require('@/features/receipts/api') as {
  uploadReceiptPhoto: jest.Mock;
  linkReceiptsToTransaction: jest.Mock;
};
const scan = require('@/features/receipts/scan') as {
  hasScanConsent: jest.Mock;
  scanReceipt: jest.Mock;
};
const files = require('@/features/outbox/files') as {
  deleteOutboxPhoto: jest.Mock;
};

function input(
  overrides: Partial<OutboxEnqueueInput> = {},
): OutboxEnqueueInput {
  const idempotencyKey = overrides.idempotencyKey ?? 'a';
  return {
    userId: USER,
    walletId: 'wallet-1',
    categoryId: 'cat-1',
    counterpartyWalletId: null,
    type: 'expense',
    amount: 25_000,
    occurredAt: '2026-10-22T03:00:00.000Z',
    note: 'kopi',
    idempotencyKey,
    receiptIds: [],
    receiptPaths: [],
    display: {
      type: 'expense',
      amount: 25_000,
      note: 'kopi',
      occurredAt: '2026-10-22T03:00:00.000Z',
      walletName: 'BCA',
      categoryName: 'Makanan',
      categoryIcon: 'restaurant',
      counterpartyWalletName: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  setOutboxDatabaseForTests(createMemoryOutboxDb());
  api.createTransaction.mockReset();
  receipts.uploadReceiptPhoto.mockReset();
  receipts.linkReceiptsToTransaction.mockReset();
  receipts.linkReceiptsToTransaction.mockResolvedValue(0);
  scan.hasScanConsent.mockReset();
  scan.hasScanConsent.mockResolvedValue(false);
  scan.scanReceipt.mockReset();
  scan.scanReceipt.mockResolvedValue({ kind: 'ok' });
  files.deleteOutboxPhoto.mockReset();
});

afterEach(() => {
  resetOutboxDatabaseForTests();
});

describe('outbox flush', () => {
  it('sends FIFO and keeps a server-refused row while continuing', async () => {
    await enqueueOutbox(input({ idempotencyKey: 'a' }));
    await enqueueOutbox(input({ idempotencyKey: 'b' }));
    await enqueueOutbox(input({ idempotencyKey: 'c' }));

    const calls: string[] = [];
    api.createTransaction.mockImplementation(async (draft: { idempotencyKey: string }) => {
      calls.push(draft.idempotencyKey);
      if (draft.idempotencyKey === 'b') throw { code: '23514' };
      return `tx-${draft.idempotencyKey}`;
    });

    const result = await flushOutbox({ userId: USER });

    expect(result).toEqual({ sent: 2, failed: 1, stopped: false });
    expect(calls).toEqual(['a', 'b', 'c']);
    const rows = await listOutbox(USER);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'b',
      status: 'failed',
      errorKind: 'server',
      errorMessage: 'invalid_data',
    });
    expect(api.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'a' }),
    );
  });

  it('stops the pass on a network failure and leaves later rows waiting', async () => {
    await enqueueOutbox(input({ idempotencyKey: 'a' }));
    await enqueueOutbox(input({ idempotencyKey: 'b' }));
    await enqueueOutbox(input({ idempotencyKey: 'c' }));

    api.createTransaction.mockImplementation(async (draft: { idempotencyKey: string }) => {
      if (draft.idempotencyKey === 'b') throw { status: 503 };
      return `tx-${draft.idempotencyKey}`;
    });

    const result = await flushOutbox({ userId: USER });

    expect(result).toEqual({ sent: 1, failed: 1, stopped: true });
    expect(api.createTransaction).toHaveBeenCalledTimes(2);
    const rows = await listOutbox(USER);
    expect(rows.map((row) => [row.id, row.status, row.errorKind])).toEqual([
      ['b', 'failed', 'network'],
      ['c', 'waiting', null],
    ]);
  });

  it('skips terminal server failures on the next pass', async () => {
    await enqueueOutbox(input({ idempotencyKey: 'bad' }));
    await enqueueOutbox(input({ idempotencyKey: 'good' }));
    await updateOutboxStatus({
      userId: USER,
      id: 'bad',
      status: 'failed',
      errorKind: 'server',
      errorMessage: 'rejected',
    });
    api.createTransaction.mockResolvedValue('tx-good');

    await flushOutbox({ userId: USER });

    expect(api.createTransaction).toHaveBeenCalledTimes(1);
    expect(api.createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ idempotencyKey: 'good' }),
    );
    expect((await listOutbox(USER)).map((row) => row.id)).toEqual(['bad']);
  });

  it('uploads local photos only after the transaction commits', async () => {
    await enqueueOutbox(
      input({
        idempotencyKey: 'a',
        receiptPaths: ['file:///proof.jpg'],
      }),
    );
    api.createTransaction.mockResolvedValue('tx-a');
    receipts.uploadReceiptPhoto.mockResolvedValue({
      id: 'receipt-1',
      storagePath: 'user-1/receipt-1.jpg',
    });

    await flushOutbox({ userId: USER });

    expect(api.createTransaction.mock.invocationCallOrder[0]).toBeLessThan(
      receipts.uploadReceiptPhoto.mock.invocationCallOrder[0],
    );
    expect(receipts.linkReceiptsToTransaction).toHaveBeenCalledWith({
      userId: USER,
      receiptIds: ['receipt-1'],
      transactionId: 'tx-a',
    });
    expect(files.deleteOutboxPhoto).toHaveBeenCalledWith('file:///proof.jpg');
    expect(await listOutbox(USER)).toEqual([]);
  });

  it('keeps the transaction committed when a photo upload fails', async () => {
    await enqueueOutbox(
      input({
        idempotencyKey: 'a',
        receiptPaths: ['file:///proof.jpg'],
      }),
    );
    api.createTransaction.mockResolvedValue('tx-a');
    receipts.uploadReceiptPhoto.mockRejectedValue(new Error('upload failed'));

    const result = await flushOutbox({ userId: USER });

    expect(result).toEqual({ sent: 1, failed: 0, stopped: false });
    expect(files.deleteOutboxPhoto).not.toHaveBeenCalled();
    expect(await listOutbox(USER)).toEqual([]);
  });

  it('links receipts uploaded before the failed online attempt', async () => {
    await enqueueOutbox(
      input({ idempotencyKey: 'a', receiptIds: ['receipt-1'] }),
    );
    api.createTransaction.mockResolvedValue('tx-a');

    await flushOutbox({ userId: USER });

    expect(receipts.uploadReceiptPhoto).not.toHaveBeenCalled();
    expect(receipts.linkReceiptsToTransaction).toHaveBeenCalledWith({
      userId: USER,
      receiptIds: ['receipt-1'],
      transactionId: 'tx-a',
    });
    expect(await listOutbox(USER)).toEqual([]);
  });

  it('keeps a committed save when the OCR consent check fails', async () => {
    await enqueueOutbox(
      input({
        idempotencyKey: 'a',
        receiptPaths: ['file:///proof.jpg'],
      }),
    );
    api.createTransaction.mockResolvedValue('tx-a');
    receipts.uploadReceiptPhoto.mockResolvedValue({
      id: 'receipt-1',
      storagePath: 'user-1/receipt-1.jpg',
    });
    scan.hasScanConsent.mockRejectedValue(new Error('storage unavailable'));

    const result = await flushOutbox({ userId: USER });

    expect(result).toEqual({ sent: 1, failed: 0, stopped: false });
    expect(await listOutbox(USER)).toEqual([]);
  });

  it('retries OCR only after upload and only with consent', async () => {
    await enqueueOutbox(
      input({
        idempotencyKey: 'a',
        receiptPaths: ['file:///proof.jpg'],
      }),
    );
    api.createTransaction.mockResolvedValue('tx-a');
    receipts.uploadReceiptPhoto.mockResolvedValue({
      id: 'receipt-1',
      storagePath: 'user-1/receipt-1.jpg',
    });
    scan.hasScanConsent.mockResolvedValue(true);

    await flushOutbox({ userId: USER });

    expect(scan.scanReceipt).toHaveBeenCalledWith({
      storagePath: 'user-1/receipt-1.jpg',
    });
    expect(receipts.uploadReceiptPhoto.mock.invocationCallOrder[0]).toBeLessThan(
      scan.scanReceipt.mock.invocationCallOrder[0],
    );
  });

  it('does not call OCR without consent', async () => {
    await enqueueOutbox(
      input({
        idempotencyKey: 'a',
        receiptPaths: ['file:///proof.jpg'],
      }),
    );
    api.createTransaction.mockResolvedValue('tx-a');
    receipts.uploadReceiptPhoto.mockResolvedValue({
      id: 'receipt-1',
      storagePath: 'user-1/receipt-1.jpg',
    });

    await flushOutbox({ userId: USER });

    expect(scan.scanReceipt).not.toHaveBeenCalled();
  });

  it('isolates users', async () => {
    await enqueueOutbox(input({ idempotencyKey: 'a' }));
    await enqueueOutbox(input({ idempotencyKey: 'other', userId: 'user-2' }));
    api.createTransaction.mockResolvedValue('tx-a');

    await flushOutbox({ userId: USER });

    expect(await listOutbox('user-2')).toHaveLength(1);
    expect(api.createTransaction).toHaveBeenCalledTimes(1);
  });
});
