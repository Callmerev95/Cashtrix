/**
 * OB1 save path behind the Add form: offline creates queue, failed online
 * creates queue only on transport/5xx errors, and edits stay blocked until
 * OB2 can address a server row.
 */
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { OutboxProvider, listOutbox, updateOutboxStatus } from '@/features/outbox';
import {
  resetOutboxDatabaseForTests,
  setOutboxDatabaseForTests,
} from '@/features/outbox/db';
import {
  TransactionsProvider,
  useTransactions,
  type SaveInput,
  type Transaction,
} from '@/features/transactions';
import { createMemoryOutboxDb } from './helpers/outbox-db';

let mockOnline = false;

jest.mock('@/features/auth', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));

jest.mock('@/features/connectivity/connectivity-context', () => ({
  useConnectivity: () => ({ isOnline: mockOnline }),
}));

jest.mock('@/features/receipts', () => {
  const actual = jest.requireActual('@/features/receipts');
  return {
    ...actual,
    linkReceiptsToTransaction: jest.fn(async () => 0),
  };
});

jest.mock('@/features/transactions/api', () => {
  const actual = jest.requireActual('@/features/transactions/api');
  return {
    ...actual,
    createTransaction: jest.fn(),
    updateTransaction: jest.fn(),
    getTransaction: jest.fn(),
    listTransactions: jest.fn(async () => []),
    listCategories: jest.fn(async () => [
      {
        id: 'cat-1',
        name: 'Makanan',
        icon: 'restaurant',
        kind: 'expense',
        isSystem: true,
      },
    ]),
    listWalletOptions: jest.fn(async () => [
      {
        id: 'wallet-1',
        name: 'BCA',
        type: 'bank',
        openingBalance: 0,
        archivedAt: null,
      },
    ]),
    lastUsedWalletId: jest.fn(async () => null),
  };
});

const api = require('@/features/transactions/api') as {
  createTransaction: jest.Mock;
  updateTransaction: jest.Mock;
  getTransaction: jest.Mock;
};

function input(overrides: Partial<SaveInput> = {}): SaveInput {
  return {
    userId: 'user-1',
    walletId: 'wallet-1',
    categoryId: 'cat-1',
    counterpartyWalletId: null,
    type: 'expense',
    amount: 25_000,
    occurredAt: new Date('2026-10-22T03:00:00.000Z'),
    note: 'kopi',
    idempotencyKey: 'key-1',
    receiptIds: [],
    ...overrides,
  };
}

let mockSave: ((next: SaveInput) => Promise<{ queued: boolean }>) | undefined;
let mockRemove: ((id: string) => Promise<void>) | undefined;
let mockUndoDelete: (() => Promise<void>) | undefined;
let mockUndoQueuedSave: ((id: string) => Promise<void>) | undefined;
let mockLoad: ((id: string) => Promise<Transaction | null>) | undefined;

function Probe() {
  const value = useTransactions();
  useEffect(() => {
    mockSave = value.save;
    mockRemove = value.remove;
    mockUndoDelete = value.undoDelete;
    mockUndoQueuedSave = value.undoQueuedSave;
    mockLoad = value.loadTransaction;
  }, [
    value.save,
    value.remove,
    value.undoDelete,
    value.undoQueuedSave,
    value.loadTransaction,
  ]);
  return (
    <>
      <Text testID="probe-count">{value.transactions.length}</Text>
      <Text testID="probe-pending">
        {String(value.transactions[0]?.pending ?? false)}
      </Text>
      <Text testID="probe-label">
        {value.lastSaved?.queued ? 'queued' : 'saved'}
      </Text>
      <Text testID="probe-deleted-pending">
        {String(Boolean(value.lastDeleted?.pendingRow))}
      </Text>
    </>
  );
}

async function renderProvider() {
  render(
    <OutboxProvider>
      <TransactionsProvider>
        <Probe />
      </TransactionsProvider>
    </OutboxProvider>,
  );
  await waitFor(() => {
    expect(screen.getByTestId('probe-count').props.children).toBe(0);
  });
}

function getSave() {
  return mockSave!;
}

function getRemove() {
  return mockRemove!;
}

function getUndoDelete() {
  return mockUndoDelete!;
}

function getUndoQueuedSave() {
  return mockUndoQueuedSave!;
}

function getLoad() {
  return mockLoad!;
}

beforeEach(() => {
  mockOnline = false;
  setOutboxDatabaseForTests(createMemoryOutboxDb());
  api.createTransaction.mockReset();
  api.updateTransaction.mockReset();
  api.getTransaction.mockReset();
});

afterEach(() => {
  resetOutboxDatabaseForTests();
});

describe('Add transaction offline queue', () => {
  it('queues an offline create and merges the pending row into History', async () => {
    await renderProvider();

    let result: { queued: boolean } | undefined;
    await act(async () => {
      result = await getSave()(input());
    });

    expect(result).toEqual({ queued: true, queuedId: 'key-1' });
    expect(api.createTransaction).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(screen.getByTestId('probe-count').props.children).toBe(1);
    });
    expect(screen.getByTestId('probe-pending').props.children).toBe('true');
    expect(screen.getByTestId('probe-label').props.children).toBe('queued');
  });

  it('queues an online create when the server is 5xx', async () => {
    mockOnline = true;
    api.createTransaction.mockRejectedValue({ status: 503 });
    await renderProvider();

    let result: { queued: boolean } | undefined;
    await act(async () => {
      result = await getSave()(input());
    });

    expect(result).toEqual({ queued: true, queuedId: 'key-1' });
    expect(api.createTransaction).toHaveBeenCalledTimes(1);
    await waitFor(() => {
      expect(screen.getByTestId('probe-pending').props.children).toBe('true');
    });
  });

  it('surfaces a 4xx validation refusal instead of queueing it', async () => {
    mockOnline = true;
    api.createTransaction.mockRejectedValue({ status: 400 });
    await renderProvider();

    await expect(
      act(async () => {
        await getSave()(input());
      }),
    ).rejects.toBeTruthy();
    expect(screen.getByTestId('probe-count').props.children).toBe(0);
  });

  it('coalesces an edit into the existing queue row without a server call', async () => {
    await renderProvider();
    await act(async () => {
      await getSave()(input());
    });
    mockOnline = true;

    let result: { queued: boolean; queuedId?: string } | undefined;
    await act(async () => {
      result = await getSave()(
        input({
          id: 'key-1',
          queuedId: 'key-1',
          amount: 40_000,
          note: 'kopi susu',
        }),
      );
    });

    expect(result).toEqual({ queued: true, queuedId: 'key-1' });
    expect(api.updateTransaction).not.toHaveBeenCalled();
    expect(api.createTransaction).not.toHaveBeenCalled();
    const rows = await listOutbox('user-1');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: 'key-1',
      status: 'waiting',
      payload: { amount: 40_000, note: 'kopi susu' },
    });
  });

  it('refuses to edit a queue row that is already sending', async () => {
    await renderProvider();
    await act(async () => {
      await getSave()(input());
    });
    await updateOutboxStatus({
      userId: 'user-1',
      id: 'key-1',
      status: 'sending',
    });

    await expect(
      act(async () => {
        await getSave()(input({ id: 'key-1', queuedId: 'key-1', amount: 40_000 }));
      }),
    ).rejects.toThrow(/terkirim/i);
  });

  it('deletes a queued row locally and restores it on undo', async () => {
    await renderProvider();
    await act(async () => {
      await getSave()(input());
    });

    await act(async () => {
      await getRemove()('key-1');
    });
    await waitFor(() => {
      expect(screen.getByTestId('probe-count').props.children).toBe(0);
    });
    expect(screen.getByTestId('probe-deleted-pending').props.children).toBe(
      'true',
    );
    expect(await listOutbox('user-1')).toEqual([]);

    await act(async () => {
      await getUndoDelete()();
    });
    await waitFor(() => {
      expect(screen.getByTestId('probe-count').props.children).toBe(1);
    });
    expect(await listOutbox('user-1')).toHaveLength(1);
  });

  it('cancels a queued save from its snackbar window', async () => {
    await renderProvider();
    await act(async () => {
      await getSave()(input());
    });

    await act(async () => {
      await getUndoQueuedSave()('key-1');
    });

    await waitFor(() => {
      expect(screen.getByTestId('probe-count').props.children).toBe(0);
    });
    expect(await listOutbox('user-1')).toEqual([]);
  });

  it('loads a queued row with its local photos and failure reason', async () => {
    await renderProvider();
    await act(async () => {
      await getSave()(
        input({
          receiptIds: ['receipt-1'],
          receiptPaths: ['/local/struk.jpg'],
        }),
      );
    });
    await updateOutboxStatus({
      userId: 'user-1',
      id: 'key-1',
      status: 'failed',
      errorKind: 'server',
      errorMessage: 'invalid_data',
    });

    let row!: Transaction | null;
    await act(async () => {
      row = await getLoad()('key-1');
    });

    expect(api.getTransaction).not.toHaveBeenCalled();
    expect(row).toMatchObject({
      id: 'key-1',
      amount: 25_000,
      pending: true,
      pendingError: 'invalid_data',
      pendingReceiptIds: ['receipt-1'],
      pendingReceiptPaths: ['/local/struk.jpg'],
    });
  });

  it('falls through to the server for a committed row', async () => {
    api.getTransaction.mockResolvedValue({
      id: 'tx-1',
      type: 'expense',
      amount: 10_000,
      currencyCode: 'IDR',
      occurredAt: '2026-10-20T03:00:00.000Z',
      note: null,
      categoryId: 'cat-1',
      categoryName: 'Makanan',
      categoryIcon: 'restaurant',
      walletId: 'wallet-1',
      walletName: 'BCA',
      counterpartyWalletId: null,
      counterpartyWalletName: null,
    });
    await renderProvider();

    let row!: Transaction | null;
    await act(async () => {
      row = await getLoad()('tx-1');
    });

    expect(api.getTransaction).toHaveBeenCalledWith('tx-1');
    expect(row?.id).toBe('tx-1');
    expect(row?.pending).toBeUndefined();
  });

  it('keeps server edits working when SQLite is unavailable', async () => {
    setOutboxDatabaseForTests(null);
    api.getTransaction.mockResolvedValue({
      id: 'tx-1',
      type: 'expense',
      amount: 10_000,
      currencyCode: 'IDR',
      occurredAt: '2026-10-20T03:00:00.000Z',
      note: null,
      categoryId: 'cat-1',
      categoryName: 'Makanan',
      categoryIcon: 'restaurant',
      walletId: 'wallet-1',
      walletName: 'BCA',
      counterpartyWalletId: null,
      counterpartyWalletName: null,
    });
    await renderProvider();

    let row!: Transaction | null;
    await act(async () => {
      row = await getLoad()('tx-1');
    });

    expect(api.getTransaction).toHaveBeenCalledWith('tx-1');
    expect(row?.id).toBe('tx-1');
  });

  it('blocks an offline edit of a server row', async () => {
    await renderProvider();

    await expect(
      act(async () => {
        await getSave()(input({ id: 'tx-1', idempotencyKey: 'edit-key' }));
      }),
    ).rejects.toThrow(/koneksi/i);
    expect(api.updateTransaction).not.toHaveBeenCalled();
    expect(screen.getByTestId('probe-count').props.children).toBe(0);
  });
});
