/**
 * Inbox tests — the Jest seam for ticket #48 (A5 "inbox notifikasi").
 * Pure copy (row titles, unread filter) plus the provider wiring with the
 * server API mocked: the inbox list, the bell dot count, and both mark-read
 * paths. `read_at` itself lives in Postgres (pgTAP 16 + verify-a5).
 */
import { act, render, screen, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';

import {
  BudgetsProvider,
  useBudgets,
} from '@/features/budgets/budgets-context';
import {
  groupAlertsByMonth,
  inboxAlertTitle,
  unreadAlerts,
  type InboxAlert,
} from '@/features/budgets';

jest.mock('@/features/budgets/api', () => {
  const actual = jest.requireActual('@/features/budgets/api');
  return {
    ...actual,
    fetchTimezone: jest.fn().mockResolvedValue('Asia/Jakarta'),
    fetchCurrentMonth: jest.fn().mockResolvedValue('2026-09-01'),
    listBudgetStatus: jest.fn().mockResolvedValue([]),
    recordAlert: jest.fn().mockResolvedValue(false),
    listAlerts: jest.fn(),
    markAlertRead: jest.fn().mockResolvedValue(undefined),
    markAllAlertsRead: jest.fn().mockResolvedValue(undefined),
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

function alert(overrides: Partial<InboxAlert> = {}): InboxAlert {
  return {
    id: overrides.id ?? 'al-1',
    categoryId: 'cat-makan',
    categoryName: 'Makanan',
    categoryIcon: 'restaurant',
    month: '2026-09-01',
    threshold: 'warning_80',
    firedAt: '2026-09-20T10:00:00+07:00',
    readAt: null,
    ...overrides,
  };
}

describe('inbox copy', () => {
  it('judul per threshold', () => {
    expect(inboxAlertTitle('Makanan', 'warning_80')).toBe(
      'Makanan menyentuh 80% budget',
    );
    expect(inboxAlertTitle('Makanan', 'exceeded_100')).toBe(
      'Makanan melampaui 100% budget',
    );
  });

  it('unread = readAt null (termasuk baris pra-A5)', () => {
    const rows = [
      alert({ id: 'a' }),
      alert({ id: 'b', readAt: '2026-09-20T11:00:00+07:00' }),
    ];
    expect(unreadAlerts(rows).map((row) => row.id)).toEqual(['a']);
  });
});

describe('groupAlertsByMonth', () => {
  it('mengelompokkan per bulan, bulan terbaru dulu, baris tak diurut ulang', () => {
    const rows = [
      alert({ id: 's2', month: '2026-09-01' }),
      alert({ id: 's1', month: '2026-09-01' }),
      alert({ id: 'a1', month: '2026-08-01' }),
    ];
    const groups = groupAlertsByMonth(rows);
    expect(groups.map((group) => group.month)).toEqual([
      '2026-09-01',
      '2026-08-01',
    ]);
    expect(groups[0]?.alerts.map((row) => row.id)).toEqual(['s2', 's1']);
  });

  it('kosong → tanpa grup', () => {
    expect(groupAlertsByMonth([])).toEqual([]);
  });
});

describe('inbox provider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    budgetsApi.listAlerts.mockResolvedValue([
      alert({ id: 'a' }),
      alert({ id: 'b', readAt: '2026-09-20T11:00:00+07:00' }),
    ]);
  });

  function Probe() {
    const { alerts, unreadCount, markRead, markAllRead } = useBudgets();
    useEffect(() => {
      (globalThis as Record<string, unknown>).probe = {
        alerts,
        unreadCount,
        markRead,
        markAllRead,
      };
    });
    return <Text testID="probe">{`${alerts.length}/${unreadCount}`}</Text>;
  }

  function probe(): {
    alerts: InboxAlert[];
    unreadCount: number;
    markRead: (id: string) => Promise<void>;
    markAllRead: () => Promise<void>;
  } {
    return (globalThis as Record<string, unknown>).probe as never;
  }

  it('memuat inbox + menghitung belum dibaca untuk bel', async () => {
    render(
      <BudgetsProvider>
        <Probe />
      </BudgetsProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('probe')).toBeTruthy());
    await waitFor(() => expect(probe().alerts).toHaveLength(2));
    expect(probe().unreadCount).toBe(1);
  });

  it('markRead menulis server lalu memadamkan dot', async () => {
    render(
      <BudgetsProvider>
        <Probe />
      </BudgetsProvider>,
    );
    await waitFor(() => expect(probe().alerts).toHaveLength(2));

    await act(() => probe().markRead('a'));

    expect(budgetsApi.markAlertRead).toHaveBeenCalledWith('a');
    expect(probe().unreadCount).toBe(0);
  });

  it('markAllRead menandai semua yang belum dibaca', async () => {
    render(
      <BudgetsProvider>
        <Probe />
      </BudgetsProvider>,
    );
    await waitFor(() => expect(probe().alerts).toHaveLength(2));

    await act(() => probe().markAllRead());

    expect(budgetsApi.markAllAlertsRead).toHaveBeenCalledTimes(1);
    expect(probe().unreadCount).toBe(0);
  });
});
