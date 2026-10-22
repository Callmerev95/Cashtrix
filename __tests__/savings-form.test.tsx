/**
 * Savings form wiring (SV3) — the create/edit/delete paths for #107.
 *
 * Pure validation lives in `savings-domain`; here we lock the screen's job:
 * default wallet, error rendering, duplicate-wallet mapping, the locked
 * wallet on edit, and delete via the destructive sheet. A past target date is
 * allowed to survive an edit (the domain seam owns the rule).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { SavingsApiError, type SavingsGoalView } from '@/features/savings';

const mockBack = jest.fn();
let mockParams: { id?: string } = {};

jest.mock('expo-router', () => ({
  router: { back: (...args: unknown[]) => mockBack(...args), push: jest.fn() },
  useLocalSearchParams: () => mockParams,
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

let mockSavingsValue: Record<string, unknown>;

jest.mock('@/features/savings', () => {
  const actual = jest.requireActual('@/features/savings');
  return { ...actual, useSavings: () => mockSavingsValue };
});

const SavingsFormScreen = require('../app/savings-form').default;

const goal: SavingsGoalView = {
  id: 'g1',
  userId: 'u1',
  walletId: 'w1',
  name: 'Liburan',
  targetAmount: 1_000_000,
  targetDate: null,
  createdAt: '2026-10-01T00:00:00.000Z',
  walletName: 'BCA',
  walletArchived: false,
  balance: 250_000,
};

function savingsValue(overrides: Record<string, unknown> = {}) {
  return {
    goals: [],
    hiddenGoalCount: 0,
    availableWallets: [
      { id: 'w1', name: 'BCA', type: 'bank', openingBalance: 0, balance: 0, transactionCount: 0, archivedAt: null },
      { id: 'w2', name: 'Cash', type: 'cash', openingBalance: 0, balance: 0, transactionCount: 0, archivedAt: null },
    ],
    loading: false,
    error: null,
    refresh: jest.fn(),
    create: jest.fn().mockResolvedValue(undefined),
    update: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
    goalForWallet: jest.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  mockParams = {};
  mockBack.mockClear();
  mockSavingsValue = savingsValue();
});

describe('create mode', () => {
  it('uses the first available wallet, validates the amount, then saves', async () => {
    render(<SavingsFormScreen />);

    expect(screen.getAllByText('Buat target').length).toBeGreaterThan(0);
    expect(
      screen.getByTestId('savings-wallet-w1').props.accessibilityState,
    ).toEqual({ selected: true });

    fireEvent.press(screen.getByTestId('savings-save'));
    expect(screen.getByTestId('savings-amount-error')).toHaveTextContent(
      'Nominal target wajib diisi',
    );
    expect(mockSavingsValue.create).not.toHaveBeenCalled();

    fireEvent.changeText(screen.getByTestId('savings-amount'), '1500000');
    fireEvent.press(screen.getByTestId('savings-save'));

    await waitFor(() =>
      expect(mockSavingsValue.create).toHaveBeenCalledWith({
        walletId: 'w1',
        name: null,
        targetAmount: 1_500_000,
        targetDate: null,
      }),
    );
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('a wallet chip overrides the default and duplicate maps to the wallet field', async () => {
    const create = jest
      .fn()
      .mockRejectedValueOnce(
        new SavingsApiError('duplicate_wallet', 'duplicate'),
      );
    mockSavingsValue = savingsValue({ create });
    render(<SavingsFormScreen />);

    fireEvent.press(screen.getByTestId('savings-wallet-w2'));
    fireEvent.changeText(screen.getByTestId('savings-amount'), '750000');
    fireEvent.press(screen.getByTestId('savings-save'));

    await waitFor(() =>
      expect(screen.getByTestId('savings-wallet-error')).toHaveTextContent(
        'Dompet ini sudah punya target',
      ),
    );
    expect(create).toHaveBeenCalledWith({
      walletId: 'w2',
      name: null,
      targetAmount: 750_000,
      targetDate: null,
    });
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('shows the no-wallet hint when every active wallet already has a goal', () => {
    mockSavingsValue = savingsValue({ availableWallets: [] });
    render(<SavingsFormScreen />);

    expect(screen.getByTestId('savings-no-wallets')).toBeTruthy();
    expect(
      screen.getByText('Semua dompet aktif sudah punya target.'),
    ).toBeTruthy();
  });
});

describe('edit mode', () => {
  it('locks the wallet, preloads the row, and saves an unchanged past date', async () => {
    const past = goal.targetDate;
    mockParams = { id: 'g1' };
    mockSavingsValue = savingsValue({
      goals: [{ ...goal, targetDate: past ?? '2020-01-01' }],
      availableWallets: [],
    });
    render(<SavingsFormScreen />);

    expect(screen.getByTestId('savings-wallet-locked')).toBeTruthy();
    expect(screen.getByText('BCA')).toBeTruthy();
    expect(screen.getByText('Ubah target')).toBeTruthy();
    expect(screen.getByTestId('savings-amount').props.value).toBe('1.000.000');
    expect(screen.getByTestId('savings-date-calendar')).toBeTruthy();

    fireEvent.press(screen.getByTestId('savings-save'));

    await waitFor(() =>
      expect(mockSavingsValue.update).toHaveBeenCalledWith('g1', {
        name: 'Liburan',
        targetAmount: 1_000_000,
        targetDate: '2020-01-01',
      }),
    );
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('deletes through the confirm sheet only', async () => {
    mockParams = { id: 'g1' };
    mockSavingsValue = savingsValue({ goals: [goal], availableWallets: [] });
    render(<SavingsFormScreen />);

    fireEvent.press(screen.getByTestId('savings-delete'));
    expect(screen.getByTestId('savings-delete-sheet')).toBeTruthy();
    expect(mockSavingsValue.remove).not.toHaveBeenCalled();

    fireEvent.press(screen.getByTestId('savings-delete-sheet-confirm'));

    await waitFor(() =>
      expect(mockSavingsValue.remove).toHaveBeenCalledWith('g1'),
    );
    expect(mockBack).toHaveBeenCalledTimes(1);
  });

  it('a missing row disables save and shows the edit-load error', () => {
    mockParams = { id: 'gone' };
    mockSavingsValue = savingsValue({ goals: [] });
    render(<SavingsFormScreen />);

    expect(screen.getByTestId('savings-form-missing')).toBeTruthy();
    expect(
      screen.getByTestId('savings-save').props.accessibilityState.disabled,
    ).toBe(true);
  });
});
