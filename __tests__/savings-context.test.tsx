/**
 * SavingsProvider tests (SV2): goals are derived from wallet rows at render
 * time (active list vs archived count), `goalForWallet` still finds a goal on
 * an archived wallet, sign-out purges the rows, and concurrent refreshes
 * share one request.
 */
import { act, render, waitFor } from '@testing-library/react-native';
import { Text } from 'react-native';

import { SavingsProvider, useSavings } from '@/features/savings';

jest.mock('@/supabase', () => ({
  onLocalDataPurge: (listener: () => void) => {
    const store = globalThis as { __savingsPurge?: (() => void)[] };
    store.__savingsPurge = [...(store.__savingsPurge ?? []), listener];
    return () => {};
  },
}));

jest.mock('@/features/wallets/wallets-context', () => ({
  useWallets: () =>
    (globalThis as { __savingsWallets?: unknown }).__savingsWallets,
}));

jest.mock('@/features/savings/api', () => ({
  listSavingsGoals: jest.fn(),
  createSavingsGoal: jest.fn(),
  updateSavingsGoal: jest.fn(),
  deleteSavingsGoal: jest.fn(),
  SavingsApiError: class SavingsApiError extends Error {},
}));

const api = jest.requireMock('@/features/savings/api');
const listSavingsGoals = api.listSavingsGoals as jest.Mock;

const activeWallet = {
  id: 'w1',
  name: 'Bank',
  type: 'bank',
  openingBalance: 0,
  balance: 500_000,
  transactionCount: 2,
  archivedAt: null,
};

const archivedWallet = {
  id: 'w2',
  name: 'Lama',
  type: 'cash',
  openingBalance: 0,
  balance: 100_000,
  transactionCount: 1,
  archivedAt: '2026-10-01T00:00:00.000Z',
};

const freeWallet = {
  id: 'w3',
  name: 'Cash',
  type: 'cash',
  openingBalance: 0,
  balance: 0,
  transactionCount: 0,
  archivedAt: null,
};

const goalRows = [
  {
    id: 'g1',
    userId: 'u1',
    walletId: 'w1',
    name: 'Dana darurat',
    targetAmount: 1_000_000,
    targetDate: '2026-12-01',
    createdAt: '2026-10-01T00:00:00.000Z',
  },
  {
    id: 'g2',
    userId: 'u1',
    walletId: 'w2',
    name: 'Liburan',
    targetAmount: 500_000,
    targetDate: null,
    createdAt: '2026-10-02T00:00:00.000Z',
  },
];

type Ctx = ReturnType<typeof useSavings>;

function renderHarness() {
  let latest: Ctx | null = null;
  function Probe() {
    latest = useSavings();
    return <Text testID="goal-count">{String(latest.goals.length)}</Text>;
  }
  render(
    <SavingsProvider>
      <Probe />
    </SavingsProvider>,
  );
  return {
    latest: (): Ctx => {
      if (!latest) throw new Error('provider belum mount');
      return latest;
    },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  (globalThis as { __savingsPurge?: (() => void)[] }).__savingsPurge = [];
  (globalThis as { __savingsWallets?: unknown }).__savingsWallets = {
    wallets: [activeWallet, freeWallet],
    archivedWallets: [archivedWallet],
  };
  listSavingsGoals.mockResolvedValue(goalRows);
});

describe('SavingsProvider', () => {
  it('menurunkan goals aktif dari saldo dompet + hidden count arsip', async () => {
    const harness = renderHarness();

    await waitFor(() => {
      expect(harness.latest().loading).toBe(false);
    });

    const ctx = harness.latest();
    expect(ctx.goals.map((goal) => goal.id)).toEqual(['g1']);
    expect(ctx.goals[0].walletName).toBe('Bank');
    expect(ctx.goals[0].balance).toBe(500_000);
    expect(ctx.hiddenGoalCount).toBe(1);
    expect(ctx.availableWallets.map((wallet) => wallet.id)).toEqual(['w3']);
  });

  it('goalForWallet tetap menemukan target Dompet arsip (guard hapus)', async () => {
    const harness = renderHarness();
    await waitFor(() => {
      expect(harness.latest().loading).toBe(false);
    });

    expect(harness.latest().goalForWallet('w2')?.id).toBe('g2');
    expect(harness.latest().goalForWallet('w3')).toBeNull();
  });

  it('purge sign-out mengosongkan rows', async () => {
    const harness = renderHarness();
    await waitFor(() => {
      expect(harness.latest().loading).toBe(false);
    });
    expect(harness.latest().goals).toHaveLength(1);

    const listeners =
      (globalThis as { __savingsPurge?: (() => void)[] }).__savingsPurge ?? [];
    await act(async () => {
      for (const listener of listeners) listener();
    });

    expect(harness.latest().goals).toHaveLength(0);
    expect(harness.latest().goalForWallet('w2')).toBeNull();
  });

  it('dua refresh bersamaan berbagi satu fetch', async () => {
    const harness = renderHarness();
    await waitFor(() => {
      expect(harness.latest().loading).toBe(false);
    });
    const before = listSavingsGoals.mock.calls.length;

    await act(async () => {
      await Promise.all([
        harness.latest().refresh(),
        harness.latest().refresh(),
      ]);
    });

    expect(listSavingsGoals.mock.calls.length).toBe(before + 1);
  });
});
