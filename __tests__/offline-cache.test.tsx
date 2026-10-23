/**
 * OB1 read cache — the last successful feed/categories/wallets payload is the
 * only thing an offline launch may paint. These tests run the real
 * TransactionsProvider with a failing API and an in-memory SQLite adapter.
 */
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useEffect } from 'react';

import { readCache, writeCache } from '@/features/outbox';
import {
  resetOutboxDatabaseForTests,
  setOutboxDatabaseForTests,
} from '@/features/outbox/db';
import { TransactionsProvider, useTransactions } from '@/features/transactions';
import { WalletsProvider, useWallets } from '@/features/wallets';
import { createMemoryOutboxDb } from './helpers/outbox-db';

jest.mock('@/features/auth', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));

jest.mock('@/features/connectivity/connectivity-context', () => ({
  useConnectivity: () => ({ isOnline: false }),
}));

jest.mock('@/features/outbox', () => {
  const actual = jest.requireActual('@/features/outbox');
  return {
    ...actual,
    useOutbox: () => ({
      pendingRows: [],
      pendingCount: 0,
      available: true,
      refreshPending: async () => undefined,
      enqueue: async () => {
        throw new Error('not used');
      },
      drop: async () => undefined,
    }),
  };
});

jest.mock('@/features/transactions/api', () => {
  const actual = jest.requireActual('@/features/transactions/api');
  return {
    ...actual,
    listTransactions: jest.fn(),
    listCategories: jest.fn(),
    listWalletOptions: jest.fn(),
    lastUsedWalletId: jest.fn(async () => null),
  };
});

const api = require('@/features/transactions/api') as {
  listTransactions: jest.Mock;
  listCategories: jest.Mock;
  listWalletOptions: jest.Mock;
};

jest.mock('@/features/wallets/api', () => ({
  listWallets: jest.fn(),
}));

const walletsApi = require('@/features/wallets/api') as {
  listWallets: jest.Mock;
};

const transaction = {
  id: 'tx-cached',
  type: 'expense',
  amount: 25_000,
  currencyCode: 'IDR',
  occurredAt: '2026-10-22T03:00:00.000Z',
  note: 'kopi',
  categoryId: 'cat-1',
  categoryName: 'Makanan',
  categoryIcon: 'restaurant',
  walletId: 'wallet-1',
  walletName: 'BCA',
  counterpartyWalletId: null,
  counterpartyWalletName: null,
};

const category = {
  id: 'cat-1',
  name: 'Makanan',
  icon: 'restaurant',
  kind: 'expense',
  isSystem: true,
};

const wallet = {
  id: 'wallet-1',
  name: 'BCA',
  type: 'bank',
  openingBalance: 0,
  archivedAt: null,
};

type TransactionsContextValue = ReturnType<typeof useTransactions>;

let latest: TransactionsContextValue | null = null;

function Probe() {
  const value = useTransactions();
  useEffect(() => {
    latest = value;
  });
  return (
    <>
      <Text testID="probe-loading">{String(value.loading)}</Text>
      <Text testID="probe-count">{value.transactions.length}</Text>
      <Text testID="probe-cache">{String(value.cacheUsed)}</Text>
      <Text testID="probe-error">{value.error ?? 'none'}</Text>
      <Text testID="probe-category">{value.categories[0]?.name ?? 'none'}</Text>
      <Text testID="probe-wallet">{value.wallets[0]?.name ?? 'none'}</Text>
    </>
  );
}

beforeEach(() => {
  setOutboxDatabaseForTests(createMemoryOutboxDb());
  api.listTransactions.mockReset();
  api.listCategories.mockReset();
  api.listWalletOptions.mockReset();
  walletsApi.listWallets.mockReset();
});

afterEach(() => {
  resetOutboxDatabaseForTests();
});

describe('TransactionsProvider offline cache', () => {
  it('falls back to the last successful feed/categories/wallets', async () => {
    await writeCache('user-1', 'feed', [transaction]);
    await writeCache('user-1', 'categories', [category]);
    await writeCache('user-1', 'wallet-options', [wallet]);
    const stored = await readCache<(typeof transaction)[]>('user-1', 'feed');

    api.listTransactions.mockRejectedValue(new Error('offline'));
    api.listCategories.mockRejectedValue(new Error('offline'));
    api.listWalletOptions.mockRejectedValue(new Error('offline'));

    render(
      <TransactionsProvider>
        <Probe />
      </TransactionsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('probe-loading').props.children).toBe('false');
    });

    expect(screen.getByTestId('probe-count').props.children).toBe(1);
    expect(screen.getByTestId('probe-cache').props.children).toBe('true');
    expect(screen.getByTestId('probe-error').props.children).toBe('none');
    expect(screen.getByTestId('probe-category').props.children).toBe('Makanan');
    expect(screen.getByTestId('probe-wallet').props.children).toBe('BCA');
    expect(stored?.fetchedAt).toEqual(expect.any(String));
  });

  it('keeps live rows without claiming cache after a failed refresh', async () => {
    api.listTransactions.mockResolvedValue([transaction]);
    api.listCategories.mockResolvedValue([category]);
    api.listWalletOptions.mockResolvedValue([wallet]);

    render(
      <TransactionsProvider>
        <Probe />
      </TransactionsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('probe-cache').props.children).toBe('false');
      expect(screen.getByTestId('probe-count').props.children).toBe(1);
    });

    api.listTransactions.mockRejectedValue(new Error('network blip'));
    api.listCategories.mockRejectedValue(new Error('network blip'));
    api.listWalletOptions.mockRejectedValue(new Error('network blip'));

    await act(async () => {
      await latest?.refresh();
    });

    expect(screen.getByTestId('probe-count').props.children).toBe(1);
    expect(screen.getByTestId('probe-cache').props.children).toBe('false');
  });

  it('writes a successful live read through to the cache', async () => {
    api.listTransactions.mockResolvedValue([transaction]);
    api.listCategories.mockResolvedValue([category]);
    api.listWalletOptions.mockResolvedValue([wallet]);

    render(
      <TransactionsProvider>
        <Probe />
      </TransactionsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('probe-count').props.children).toBe(1);
    });
    expect(screen.getByTestId('probe-cache').props.children).toBe('false');

    await waitFor(async () => {
      const feed = await readCache<(typeof transaction)[]>('user-1', 'feed');
      expect(feed?.data[0]?.id).toBe('tx-cached');
    });
  });

  it('shows the offline empty-state copy when there is no cache', async () => {
    api.listTransactions.mockRejectedValue(new Error('offline'));
    api.listCategories.mockRejectedValue(new Error('offline'));
    api.listWalletOptions.mockRejectedValue(new Error('offline'));

    render(
      <TransactionsProvider>
        <Probe />
      </TransactionsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('probe-loading').props.children).toBe('false');
    });
    expect(screen.getByTestId('probe-count').props.children).toBe(0);
    expect(screen.getByTestId('probe-error').props.children).not.toBe('none');
  });
});


type WalletsContextValue = ReturnType<typeof useWallets>;

let latestWallets: WalletsContextValue | null = null;

function WalletsProbe() {
  const value = useWallets();
  useEffect(() => {
    latestWallets = value;
  });
  return (
    <>
      <Text testID="wallets-count">{value.wallets.length}</Text>
      <Text testID="wallets-name">{value.wallets[0]?.name ?? 'none'}</Text>
      <Text testID="wallets-cache">{String(value.cacheUsed)}</Text>
    </>
  );
}

describe('WalletsProvider offline cache', () => {
  const cachedWallet = { ...wallet, id: 'wallet-old', name: 'Dompet Lama' };
  const liveWallet = { ...wallet, id: 'wallet-live', name: 'Dompet Baru' };

  it('uses the cached list when the first read fails', async () => {
    await writeCache('user-1', 'wallets', [cachedWallet]);
    walletsApi.listWallets.mockRejectedValue(new Error('offline'));

    render(
      <WalletsProvider>
        <WalletsProbe />
      </WalletsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('wallets-cache').props.children).toBe('true');
    });
    expect(screen.getByTestId('wallets-name').props.children).toBe('Dompet Lama');
  });

  it('keeps live wallets when a later refresh fails', async () => {
    walletsApi.listWallets.mockResolvedValue([liveWallet]);

    render(
      <WalletsProvider>
        <WalletsProbe />
      </WalletsProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('wallets-name').props.children).toBe('Dompet Baru');
    });

    await writeCache('user-1', 'wallets', [cachedWallet]);
    walletsApi.listWallets.mockRejectedValue(new Error('network blip'));
    await act(async () => {
      await latestWallets?.refresh();
    });

    expect(screen.getByTestId('wallets-name').props.children).toBe('Dompet Baru');
    expect(screen.getByTestId('wallets-cache').props.children).toBe('false');
  });
});
