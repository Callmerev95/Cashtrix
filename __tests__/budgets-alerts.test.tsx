/**
 * Budget alert evaluation regression (V6 follow-up, issue #35) — the
 * reported device bug: no notification ever fired, even past the limit.
 *
 * Root cause: `evaluateAndAlert({ userId })` evaluated the *cached* list,
 * which at every call site is still the pre-commit truth (the caller just
 * wrote the crossing transaction). The crossing was invisible, so
 * `recordAlert` never ran and neither the banner nor the push ever fired.
 *
 * Uses the real BudgetsProvider with only the server API + push mocked:
 * evaluation without explicit rows must re-read the server first.
 */
import { render, screen, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import {
  BudgetsProvider,
  useBudgets,
} from '@/features/budgets/budgets-context';
import type { BudgetStatus } from '@/features/budgets/domain';

jest.mock('@/features/budgets/api', () => {
  const actual = jest.requireActual('@/features/budgets/api');
  return {
    ...actual,
    fetchTimezone: jest.fn().mockResolvedValue('Asia/Jakarta'),
    fetchCurrentMonth: jest.fn().mockResolvedValue('2026-09-01'),
    listBudgetStatus: jest.fn(),
    recordAlert: jest.fn(),
  };
});

jest.mock('@/features/budgets/notifications', () => {
  const actual = jest.requireActual('@/features/budgets/notifications');
  return {
    ...actual,
    installNotificationHandler: jest.fn(),
    sendBudgetAlert: jest.fn().mockResolvedValue(true),
  };
});

jest.mock('@/features/observability', () => ({
  budgetThresholdEvent: jest.fn((input: unknown) => input),
  trackEvent: jest.fn(),
}));

const budgetsApi = jest.requireMock('@/features/budgets/api');
const notifications = jest.requireMock('@/features/budgets/notifications');

const MONTH = '2026-09-01';

function row(overrides: Partial<BudgetStatus> = {}): BudgetStatus {
  return {
    budgetId: 'b-1',
    categoryId: 'cat-makan',
    categoryName: 'Makanan',
    categoryIcon: 'restaurant',
    month: MONTH,
    amountLimit: 100_000,
    spent: 10_000,
    percent: 10,
    state: 'ok',
    ...overrides,
  };
}

const CROSSED: BudgetStatus = row({
  spent: 85_000,
  percent: 85,
  state: 'warning',
});

type Ctx = ReturnType<typeof useBudgets>;

function renderHarness() {
  let latest: Ctx | null = null;
  function Probe({ onMount }: { onMount: (ctx: Ctx) => void }) {
    const ctx = useBudgets();
    useEffect(() => {
      onMount(ctx);
    }, [ctx, onMount]);
    return <Text testID="alert-count">{String(ctx.recentAlerts.length)}</Text>;
  }
  render(
    <BudgetsProvider>
      <Probe onMount={(ctx) => { latest = ctx; }} />
    </BudgetsProvider>,
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
  budgetsApi.fetchTimezone.mockResolvedValue('Asia/Jakarta');
  budgetsApi.fetchCurrentMonth.mockResolvedValue(MONTH);
  budgetsApi.recordAlert.mockResolvedValue(true);
  notifications.sendBudgetAlert.mockResolvedValue(true);
});

describe('evaluasi alert budget (V6)', () => {
  it('membaca server dulu — persilangan yang baru tersimpan ikut pecah telur', async () => {
    // Cache (mount): masih ok. Server (saat evaluasi): sudah warning.
    budgetsApi.listBudgetStatus.mockResolvedValueOnce([row()]);
    const { latest } = renderHarness();
    await waitFor(() => expect(budgetsApi.listBudgetStatus).toHaveBeenCalled());

    budgetsApi.listBudgetStatus.mockResolvedValue([CROSSED]);
    await latest().evaluateAndAlert({ userId: 'user-1' });

    await waitFor(() =>
      expect(budgetsApi.recordAlert).toHaveBeenCalledWith({
        userId: 'user-1',
        categoryId: 'cat-makan',
        month: MONTH,
        threshold: 'warning_80',
      }),
    );
    expect(notifications.sendBudgetAlert).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(screen.getByTestId('alert-count').props.children).toBe('1'),
    );
  });

  it('rows eksplisit tetap dipakai tanpa baca ulang server', async () => {
    budgetsApi.listBudgetStatus.mockResolvedValue([row()]);
    const { latest } = renderHarness();
    await waitFor(() => expect(budgetsApi.listBudgetStatus).toHaveBeenCalled());
    const callsAfterMount = budgetsApi.listBudgetStatus.mock.calls.length;

    await latest().evaluateAndAlert({ userId: 'user-1', rows: [CROSSED] });

    expect(budgetsApi.listBudgetStatus.mock.calls.length).toBe(callsAfterMount);
    await waitFor(() =>
      expect(budgetsApi.recordAlert).toHaveBeenCalledWith(
        expect.objectContaining({ threshold: 'warning_80' }),
      ),
    );
  });

  it('dedup: threshold yang sudah tercatat tidak ber-banner/push lagi', async () => {
    budgetsApi.listBudgetStatus.mockResolvedValue([CROSSED]);
    budgetsApi.recordAlert.mockResolvedValue(false);
    const { latest } = renderHarness();
    await waitFor(() => expect(budgetsApi.listBudgetStatus).toHaveBeenCalled());

    await latest().evaluateAndAlert({ userId: 'user-1' });

    await waitFor(() => expect(budgetsApi.recordAlert).toHaveBeenCalled());
    expect(notifications.sendBudgetAlert).not.toHaveBeenCalled();
    expect(screen.getByTestId('alert-count').props.children).toBe('0');
  });
});
