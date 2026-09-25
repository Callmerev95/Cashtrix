/**
 * Save-success proof (S1 follow-up). Two seams: the pure label (mirrors
 * `deletedTransactionLabel` without the delete) and the `SavedSnackbar`
 * timer contract — 6 s, informational only, no action button. Boundaries
 * derive from `SAVED_SNACKBAR_MS` so the test locks the contract, not a
 * magic number.
 */
import { act, render, screen } from '@testing-library/react-native';

import {
  SAVED_SNACKBAR_MS,
  SavedSnackbar,
  savedTransactionLabel,
} from '@/features/transactions';

describe('savedTransactionLabel (S1 follow-up)', () => {
  it('names the category plus the grouped amount', () => {
    expect(
      savedTransactionLabel({
        type: 'expense',
        amount: 30000,
        categoryName: 'Makanan',
        counterpartyWalletName: null,
      }),
    ).toBe('Makanan · Rp 30.000 tersimpan');
  });

  it('names the destination wallet for a transfer', () => {
    expect(
      savedTransactionLabel({
        type: 'transfer',
        amount: 100000,
        categoryName: null,
        counterpartyWalletName: 'Bank',
      }),
    ).toBe('Transfer ke Bank · Rp 100.000 tersimpan');
  });

  it('falls back instead of rendering blank', () => {
    expect(
      savedTransactionLabel({
        type: 'expense',
        amount: 5000,
        categoryName: null,
        counterpartyWalletName: null,
      }),
    ).toBe('Transaksi · Rp 5.000 tersimpan');
    expect(
      savedTransactionLabel(
        {
          type: 'expense',
          amount: 5000,
          categoryName: null,
          counterpartyWalletName: null,
        },
        'en',
      ),
    ).toBe('Transaction · Rp 5,000 saved');
  });
});

const SNACK = {
  label: 'Makanan · Rp 30.000 tersimpan',
  createdAt: 1_700_000_000_000,
};

describe('SavedSnackbar', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders nothing without a snack', () => {
    render(<SavedSnackbar snack={null} onDismiss={jest.fn()} />);
    expect(screen.queryByTestId('saved-snackbar')).toBeNull();
  });

  it('shows the label with a check and no action button', () => {
    render(<SavedSnackbar snack={SNACK} onDismiss={jest.fn()} />);

    expect(screen.getByTestId('saved-snackbar')).toBeTruthy();
    expect(screen.getByText(SNACK.label)).toBeTruthy();
    expect(screen.queryByTestId('undo-button')).toBeNull();
  });

  it('dismisses itself exactly at 6 s', () => {
    const onDismiss = jest.fn();
    render(<SavedSnackbar snack={SNACK} onDismiss={onDismiss} />);

    act(() => {
      jest.advanceTimersByTime(SAVED_SNACKBAR_MS - 1);
    });
    expect(onDismiss).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it('is not pressable (informational only — the timer is the only exit)', () => {
    render(<SavedSnackbar snack={SNACK} onDismiss={jest.fn()} />);

    expect(
      screen.getByTestId('saved-snackbar').props.onPress,
    ).toBeUndefined();
  });
});
