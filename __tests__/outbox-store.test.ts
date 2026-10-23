import {
  OUTBOX_CAP,
  OutboxFullError,
  clearAllOutbox,
  countOutbox,
  deleteOutboxRow,
  deleteOutboxRows,
  enqueueOutbox,
  listOutbox,
  listOutboxReceiptPaths,
  updateOutboxStatus,
  type OutboxEnqueueInput,
} from '@/features/outbox';
import {
  resetOutboxDatabaseForTests,
  setOutboxDatabaseForTests,
} from '@/features/outbox/db';
import { createMemoryOutboxDb } from './helpers/outbox-db';

const USER = 'user-1';

function input(
  overrides: Partial<OutboxEnqueueInput> = {},
): OutboxEnqueueInput {
  const idempotencyKey = overrides.idempotencyKey ?? 'key-1';
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
});

afterEach(() => {
  resetOutboxDatabaseForTests();
});

describe('outbox store', () => {
  it('persists one row and reads it back', async () => {
    const queued = await enqueueOutbox(input());
    const rows = await listOutbox(USER);

    expect(queued.id).toBe('key-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'key-1',
      userId: USER,
      status: 'waiting',
      payload: { amount: 25_000, idempotencyKey: 'key-1' },
      display: { walletName: 'BCA' },
    });
  });

  it('retries the same idempotency key without duplicating or reordering', async () => {
    await enqueueOutbox(input());
    const [first] = await listOutbox(USER);
    await updateOutboxStatus({
      userId: USER,
      id: 'key-1',
      status: 'failed',
      errorKind: 'server',
      errorMessage: '500',
    });

    await enqueueOutbox(
      input({
        amount: 40_000,
        note: 'kopi susu',
        display: { ...input().display, amount: 40_000, note: 'kopi susu' },
      }),
    );

    const rows = await listOutbox(USER);
    expect(rows).toHaveLength(1);
    expect(rows[0].createdAt).toBe(first.createdAt);
    expect(rows[0].status).toBe('waiting');
    expect(rows[0].errorKind).toBeNull();
    expect(rows[0].payload.amount).toBe(40_000);
    expect(await countOutbox(USER)).toBe(1);
  });

  it('rejects row 201 but still accepts a retry of an existing key', async () => {
    for (let index = 0; index < OUTBOX_CAP; index += 1) {
      await enqueueOutbox(input({ idempotencyKey: `key-${index}` }));
    }
    expect(await countOutbox(USER)).toBe(OUTBOX_CAP);

    await expect(
      enqueueOutbox(input({ idempotencyKey: 'key-overflow' })),
    ).rejects.toBeInstanceOf(OutboxFullError);

    await expect(
      enqueueOutbox(input({ idempotencyKey: 'key-0', note: 'retry' })),
    ).resolves.toMatchObject({ id: 'key-0' });
    expect(await countOutbox(USER)).toBe(OUTBOX_CAP);
  });

  it('updates status, removes rows, and isolates users', async () => {
    await enqueueOutbox(input({ idempotencyKey: 'a' }));
    await enqueueOutbox(input({ idempotencyKey: 'b' }));
    await enqueueOutbox(input({ idempotencyKey: 'other', userId: 'user-2' }));

    await updateOutboxStatus({
      userId: USER,
      id: 'a',
      status: 'sending',
    });
    expect((await listOutbox(USER)).find((row) => row.id === 'a')?.status).toBe(
      'sending',
    );

    await deleteOutboxRow(USER, 'a');
    await deleteOutboxRows(USER, ['b']);
    expect(await listOutbox(USER)).toEqual([]);
    expect(await listOutbox('user-2')).toHaveLength(1);

    await clearAllOutbox();
    expect(await countOutbox('user-2')).toBe(0);
  });

  it('keeps local receipt paths addressable for the flush', async () => {
    await enqueueOutbox(
      input({
        idempotencyKey: 'a',
        receiptPaths: ['file:///a.jpg', 'file:///b.jpg'],
      }),
    );
    await enqueueOutbox(
      input({ idempotencyKey: 'b', receiptPaths: ['file:///c.jpg'] }),
    );

    expect((await listOutboxReceiptPaths(USER)).sort()).toEqual([
      'file:///a.jpg',
      'file:///b.jpg',
      'file:///c.jpg',
    ]);
  });

  it('fails open when SQLite is unavailable', async () => {
    setOutboxDatabaseForTests(null);
    await expect(enqueueOutbox(input())).rejects.toBeTruthy();
    await expect(listOutbox(USER)).rejects.toBeTruthy();
  });
});
