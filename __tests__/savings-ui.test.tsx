/**
 * Savings UI wiring (SV3) — the component/screen lock for #107.
 *
 * Pure maths live in `savings-domain`; this file checks what the user sees:
 * the ring/card follow the shared eye, the dashboard summary is one primary
 * target plus an honest "N lain" count, and every card action pushes the
 * route that actually funds/edits the goal.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { StyleSheet } from 'react-native';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { SavingsGoalCard } from '@/features/savings/components/savings-goal-card';
import { SavingsSummaryCard } from '@/features/savings/components/savings-summary-card';
import type { SavingsGoalView } from '@/features/savings';
import {
  BALANCE_HIDDEN_KEY,
  MASKED_BALANCE_ROW,
  resetBalanceVisibilityForTests,
  setBalanceHidden,
  type Wallet,
} from '@/features/wallets';
import { colors } from '@/theme';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  router: {
    push: (...args: unknown[]) => mockPush(...args),
    back: jest.fn(),
    replace: jest.fn(),
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

jest.mock('@/features/connectivity/connectivity-context', () => ({
  useConnectivity: () => ({ isOnline: true }),
}));

// The pull wrapper is a reanimated twin; its static passthrough is enough for
// a wiring test and keeps the native module out of Jest.
jest.mock('@/components/pull-refresh', () => ({
  PullGesture: ({ children }: { children: unknown }) => children,
  PullHeader: () => null,
  usePullRefresh: () => ({ refreshing: false, onRefresh: jest.fn() }),
}));

let mockSavingsValue: Record<string, unknown>;
let mockWalletsValue: Record<string, unknown>;

jest.mock('@/features/savings', () => {
  const actual = jest.requireActual('@/features/savings');
  return { ...actual, useSavings: () => mockSavingsValue };
});

jest.mock('@/features/wallets', () => {
  const actual = jest.requireActual('@/features/wallets');
  return { ...actual, useWallets: () => mockWalletsValue };
});

const SavingsScreen = require('../app/savings').default;

function futureKey(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

const goal: SavingsGoalView = {
  id: 'g1',
  userId: 'u1',
  walletId: 'w1',
  name: 'Liburan',
  targetAmount: 1_000_000,
  targetDate: futureKey(90),
  createdAt: '2026-10-01T00:00:00.000Z',
  walletName: 'BCA',
  walletArchived: false,
  balance: 250_000,
};

const wallet = (id: string, name: string): Wallet => ({
  id,
  name,
  type: 'bank',
  openingBalance: 0,
  balance: 0,
  transactionCount: 0,
  archivedAt: null,
});

beforeEach(async () => {
  resetBalanceVisibilityForTests();
  await AsyncStorage.removeItem(BALANCE_HIDDEN_KEY);
  mockPush.mockClear();
  mockSavingsValue = {
    goals: [goal],
    hiddenGoalCount: 0,
    availableWallets: [wallet('w2', 'Cash')],
    loading: false,
    error: null,
    refresh: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    remove: jest.fn(),
    goalForWallet: jest.fn(),
  };
  mockWalletsValue = {
    wallets: [wallet('w1', 'BCA'), wallet('w2', 'Cash')],
    refresh: jest.fn(),
  };
});

describe('SavingsGoalCard', () => {
  it('menampilkan saldo, target, status, estimasi dan meneruskan aksi', () => {
    const onEdit = jest.fn();
    const onAddFunds = jest.fn();
    render(
      <SavingsGoalCard
        goal={goal}
        canAddFunds
        onEdit={onEdit}
        onAddFunds={onAddFunds}
      />,
    );

    expect(screen.getByText('Liburan')).toBeTruthy();
    expect(screen.getByText('BCA')).toBeTruthy();
    expect(screen.getByText('Rp 250.000')).toBeTruthy();
    expect(screen.getByText('Target Rp 1.000.000')).toBeTruthy();
    expect(screen.getByText('25%')).toBeTruthy();
    expect(screen.getByTestId('savings-goal-status-g1')).toHaveTextContent(
      'Aktif',
    );
    expect(
      StyleSheet.flatten(screen.getByText('Aktif').props.style).color,
    ).toBe(colors.textSecondary);
    expect(screen.getByText(/Sisihkan/)).toBeTruthy();
    expect(screen.getByTestId('savings-ring').props.accessibilityValue).toEqual({
      min: 0,
      max: 100,
      now: 25,
    });

    fireEvent.press(screen.getByTestId('savings-goal-open-g1'));
    fireEvent.press(screen.getByTestId('savings-add-funds-g1'));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onAddFunds).toHaveBeenCalledTimes(1);
  });

  it('pill status memakai tone per status', () => {
    const { rerender } = render(
      <SavingsGoalCard
        goal={{ ...goal, balance: 2_000_000 }}
        canAddFunds
        onEdit={jest.fn()}
        onAddFunds={jest.fn()}
      />,
    );
    expect(
      StyleSheet.flatten(screen.getByText('Tercapai').props.style).color,
    ).toBe(colors.accent);

    rerender(
      <SavingsGoalCard
        goal={{ ...goal, targetDate: futureKey(-1) }}
        canAddFunds
        onEdit={jest.fn()}
        onAddFunds={jest.fn()}
      />,
    );
    expect(
      StyleSheet.flatten(screen.getByText('Lewat target').props.style).color,
    ).toBe(colors.budgetWarning);
  });

  it('eye menyembunyikan saldo, persen, status, estimasi — target tetap', async () => {
    render(
      <SavingsGoalCard
        goal={goal}
        canAddFunds
        onEdit={jest.fn()}
        onAddFunds={jest.fn()}
      />,
    );
    await screen.findByText('Rp 250.000');

    act(() => setBalanceHidden(true));

    await waitFor(() => {
      expect(screen.getByText(MASKED_BALANCE_ROW)).toBeTruthy();
    });
    expect(screen.queryByText('Rp 250.000')).toBeNull();
    expect(screen.queryByText('25%')).toBeNull();
    expect(screen.queryByText('Aktif')).toBeNull();
    expect(screen.queryByTestId('savings-goal-status-g1')).toBeNull();
    expect(screen.queryByText(/Sisihkan/)).toBeNull();
    expect(screen.getByText('Target Rp 1.000.000')).toBeTruthy();
    expect(screen.getByText('••%')).toBeTruthy();
    expect(
      screen.getByTestId('savings-goal-open-g1').props.accessibilityLabel,
    ).toBe('Liburan, progres disembunyikan');
    expect(
      screen.getByTestId('savings-ring').props.accessibilityValue,
    ).toBeUndefined();
  });

  it('tidak memotong nama, dompet, nominal, atau target yang panjang', () => {
    const longName = 'T'.repeat(60);
    const longWallet = 'W'.repeat(60);
    const huge = 999_999_999_999;
    render(
      <SavingsGoalCard
        goal={{
          ...goal,
          name: longName,
          walletName: longWallet,
          balance: huge,
          targetAmount: huge,
        }}
        canAddFunds
        onEdit={jest.fn()}
        onAddFunds={jest.fn()}
      />,
    );

    expect(screen.getByText(longName).props.numberOfLines).toBeUndefined();
    expect(screen.getByText(longWallet).props.numberOfLines).toBeUndefined();
    expect(
      screen.getByText('Rp 999.999.999.999').props.numberOfLines,
    ).toBeUndefined();
    expect(
      screen.getByText('Target Rp 999.999.999.999').props.numberOfLines,
    ).toBeUndefined();
    expect(screen.getByText(/· \d+ hari lagi/).props.numberOfLines).toBeUndefined();
  });

  it('add funds disabled saat hanya ada satu dompet aktif', () => {
    render(
      <SavingsGoalCard
        goal={goal}
        canAddFunds={false}
        onEdit={jest.fn()}
        onAddFunds={jest.fn()}
      />,
    );

    expect(
      screen.getByTestId('savings-add-funds-g1').props.accessibilityState,
    ).toEqual({ disabled: true });
  });
});

describe('SavingsSummaryCard', () => {
  it('empty state membuka form target pertama', () => {
    render(
      <SavingsSummaryCard
        goal={null}
        otherCount={0}
        loading={false}
        error={null}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByTestId('dashboard-savings-empty')).toBeTruthy();
    fireEvent.press(screen.getByTestId('dashboard-savings-create'));
    expect(mockPush).toHaveBeenCalledWith('/savings-form');
  });

  it('kartu utama menghitung target lain dan membuka daftar', () => {
    render(
      <SavingsSummaryCard
        goal={goal}
        otherCount={2}
        loading={false}
        error={null}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByTestId('dashboard-savings')).toBeTruthy();
    expect(screen.getByText('2 target lain')).toBeTruthy();
    expect(screen.getByText('BCA · Rp 250.000')).toBeTruthy();
    expect(screen.getByText('Target Rp 1.000.000')).toBeTruthy();
    expect(screen.getByTestId('dashboard-savings-status')).toHaveTextContent(
      'Aktif',
    );
    fireEvent.press(
      screen.getByLabelText('Target Liburan, 25%. Buka daftar target.'),
    );
    expect(mockPush).toHaveBeenCalledWith('/savings');
  });

  it('tidak memotong nama, dompet, nominal, target, tanggal, atau estimasi panjang', () => {
    const longName = 'T'.repeat(60);
    const longWallet = 'W'.repeat(60);
    render(
      <SavingsSummaryCard
        goal={{
          ...goal,
          name: longName,
          walletName: longWallet,
          balance: 0,
          targetAmount: 999_999_999_999,
        }}
        otherCount={0}
        loading={false}
        error={null}
        onRetry={jest.fn()}
      />,
    );

    expect(screen.getByText(longName).props.numberOfLines).toBeUndefined();
    expect(
      screen.getByText(`${longWallet} · Rp 0`).props.numberOfLines,
    ).toBeUndefined();
    expect(
      screen.getByText('Target Rp 999.999.999.999').props.numberOfLines,
    ).toBeUndefined();
    expect(
      screen.getByText(/· \d+ hari lagi/).props.numberOfLines,
    ).toBeUndefined();
    expect(
      screen.getByText(/Sisihkan/).props.numberOfLines,
    ).toBeUndefined();
  });

  it('eye menyembunyikan angka di kartu dashboard', async () => {
    render(
      <SavingsSummaryCard
        goal={goal}
        otherCount={0}
        loading={false}
        error={null}
        onRetry={jest.fn()}
      />,
    );
    expect(screen.getByText(/BCA · Rp 250\.000/)).toBeTruthy();

    act(() => setBalanceHidden(true));

    await waitFor(() => {
      expect(screen.getByText(/Rp ••••/)).toBeTruthy();
    });
    expect(screen.queryByText(/Rp 250\.000/)).toBeNull();
    expect(screen.queryByText('25%')).toBeNull();
    expect(screen.queryByText('Aktif')).toBeNull();
    expect(screen.queryByTestId('dashboard-savings-status')).toBeNull();
    expect(screen.queryByText(/Sisihkan/)).toBeNull();
  });

  it('error state menawarkan retry', () => {
    const onRetry = jest.fn();
    render(
      <SavingsSummaryCard
        goal={null}
        otherCount={0}
        loading={false}
        error="Gagal memuat target tabungan"
        onRetry={onRetry}
      />,
    );

    fireEvent.press(screen.getByTestId('dashboard-savings-error-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('SavingsScreen', () => {
  it('menampilkan hitungan, banner arsip, dan meneruskan aksi kartu', () => {
    mockSavingsValue = {
      ...mockSavingsValue,
      hiddenGoalCount: 1,
    };
    render(<SavingsScreen />);

    expect(screen.getByTestId('savings-count')).toHaveTextContent(
      '1 target aktif',
    );
    expect(screen.getByTestId('savings-hidden')).toBeTruthy();
    expect(screen.getByText('1 target di dompet arsip')).toBeTruthy();

    fireEvent.press(screen.getByTestId('savings-add-funds-g1'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/add-transaction',
      params: { type: 'transfer', to: 'w1' },
    });

    fireEvent.press(screen.getByTestId('savings-goal-open-g1'));
    expect(mockPush).toHaveBeenLastCalledWith({
      pathname: '/savings-form',
      params: { id: 'g1' },
    });
  });

  it('empty state menjelaskan saat belum ada dompet aktif', () => {
    mockSavingsValue = {
      ...mockSavingsValue,
      goals: [],
      availableWallets: [],
    };
    mockWalletsValue = { ...mockWalletsValue, wallets: [] };
    render(<SavingsScreen />);

    expect(screen.getByTestId('savings-empty')).toBeTruthy();
    expect(screen.queryByTestId('savings-empty-action')).toBeNull();
    expect(screen.getByText('Buat dompet dulu lewat halaman Dompet.')).toBeTruthy();
  });

  it('error state memakai refresh layar, bukan kartu kosong', () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    mockSavingsValue = {
      ...mockSavingsValue,
      goals: [],
      error: 'Gagal memuat target tabungan',
      refresh,
    };
    render(<SavingsScreen />);

    expect(screen.getByTestId('savings-error')).toBeTruthy();
    expect(screen.queryByTestId('savings-empty')).toBeNull();
    fireEvent.press(screen.getByTestId('savings-error-retry'));
    return waitFor(() => expect(refresh).toHaveBeenCalled());
  });
});
