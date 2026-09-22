/**
 * Undo window regression (V6, issue #35) — `remove()` must open the undo
 * window once the soft-delete commits, and the window must survive the
 * post-delete refreshes (wallets/budgets/analytics) so the Dashboard
 * snackbar is actually reachable.
 *
 * Uses the real TransactionsProvider + the real UndoSnackbar with only the
 * server API mocked: if `lastDeleted` is cleared anywhere between commit
 * and paint, `undo-snackbar` never appears and this test fails.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { UndoSnackbar } from '@/features/transactions/components/undo-snackbar';
import {
  TransactionsProvider,
  useTransactions,
} from '@/features/transactions/transactions-context';
import type { Transaction } from '@/features/transactions/domain';

jest.mock('@/features/transactions/api', () => {
  const actual = jest.requireActual('@/features/transactions/api');
  return {
    ...actual,
    listTransactions: jest.fn(),
    listCategories: jest.fn().mockResolvedValue([]),
    listWalletOptions: jest.fn().mockResolvedValue([]),
    lastUsedWalletId: jest.fn().mockResolvedValue(null),
    softDeleteTransaction: jest.fn().mockResolvedValue(true),
    restoreTransaction: jest.fn().mockResolvedValue(true),
  };
});

const api = jest.requireMock('@/features/transactions/api');

const ROW: Transaction = {
  id: 'tx-undo-1',
  type: 'expense',
  amount: 50000,
  currencyCode: 'IDR',
  occurredAt: new Date().toISOString(),
  note: null,
  categoryId: 'cat-1',
  categoryName: 'Makanan',
  categoryIcon: 'restaurant',
  walletId: 'w-1',
  walletName: 'Cash',
  counterpartyWalletId: null,
  counterpartyWalletName: null,
};

function Harness() {
  const { remove, lastDeleted, undoDelete, dismissUndo } = useTransactions();
  return (
    <>
      <Pressable testID="delete-row" onPress={() => void remove(ROW.id)}>
        <Text>Hapus</Text>
      </Pressable>
      <UndoSnackbar snack={lastDeleted} onUndo={() => void undoDelete()} onDismiss={dismissUndo} />
    </>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  api.listTransactions.mockResolvedValue([ROW]);
});

describe('jendela undo (V6)', () => {
  it('remove() membuka snackbar setelah commit dan lolos refresh', async () => {
    render(
      <TransactionsProvider>
        <Harness />
      </TransactionsProvider>,
    );

    await waitFor(() => expect(api.listTransactions).toHaveBeenCalled());

    fireEvent.press(screen.getByTestId('delete-row'));

    // Snackbar appears once the delete commits …
    await waitFor(() => expect(screen.getByTestId('undo-snackbar')).toBeTruthy());
    expect(screen.getByTestId('undo-button')).toBeTruthy();

    // … and the post-delete refresh (which re-lists) does not close it.
    await waitFor(() => expect(api.listTransactions.mock.calls.length).toBeGreaterThan(1));
    expect(screen.queryByTestId('undo-snackbar')).toBeTruthy();
  });

  it('Urungkan memanggil restore lalu menutup snackbar', async () => {
    render(
      <TransactionsProvider>
        <Harness />
      </TransactionsProvider>,
    );

    await waitFor(() => expect(api.listTransactions).toHaveBeenCalled());
    fireEvent.press(screen.getByTestId('delete-row'));
    await waitFor(() => expect(screen.getByTestId('undo-button')).toBeTruthy());

    fireEvent.press(screen.getByTestId('undo-button'));

    await waitFor(() => expect(api.restoreTransaction).toHaveBeenCalledWith(ROW.id));
    await waitFor(() => expect(screen.queryByTestId('undo-snackbar')).toBeNull());
  });
});
