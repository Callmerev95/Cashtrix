/**
 * OB1 save path behind the Add form: offline creates queue, failed online
 * creates queue only on transport/5xx errors, and edits stay blocked until
 * OB2 can address a server row.
 */
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import { OutboxProvider } from '@/features/outbox';
import {
  resetOutboxDatabaseForTests,
  setOutboxDatabaseForTests,
} from '@/features/outbox/db';
import {
  TransactionsProvider,
  useTransactions,
  type SaveInput,
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

function Probe() {
  const value = useTransactions();
  useEffect(() => {
    mockSave = value.save;
  }, [value.save]);
  return (
    <>
      <Text testID="probe-count">{value.transactions.length}</Text>
      <Text testID="probe-pending">
        {String(value.transactions[0]?.pending ?? false)}
      </Text>
      <Text testID="probe-label">
        {value.lastSaved?.queued ? 'queued' : 'saved'}
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

beforeEach(() => {
  mockOnline = false;
  setOutboxDatabaseForTests(createMemoryOutboxDb());
  api.createTransaction.mockReset();
  api.updateTransaction.mockReset();
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

    expect(result).toEqual({ queued: true });
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

    expect(result).toEqual({ queued: true });
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

  it('blocks an offline edit (OB1 has no queued update target)', async () => {
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
