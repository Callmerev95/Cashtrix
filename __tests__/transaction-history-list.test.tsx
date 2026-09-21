/**
 * History list tests — the V5+ virtualization seam: day groups render as
 * `SectionList` sections (sticky headers), rows keep their `transaction-{id}`
 * testIDs, and paging/footer states survive the ScrollView → SectionList move.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { SectionList } from 'react-native';

import { TransactionHistoryList } from '@/features/transactions';
import type { Transaction } from '@/features/transactions';

function transaction(partial: Partial<Transaction>): Transaction {
  return {
    id: partial.id ?? 't1',
    type: partial.type ?? 'expense',
    amount: partial.amount ?? 10_000,
    currencyCode: 'IDR',
    occurredAt: partial.occurredAt ?? '2026-09-18T10:00:00+07:00',
    note: null,
    categoryId: 'c1',
    categoryName: 'Makanan',
    categoryIcon: 'restaurant',
    walletId: 'w1',
    walletName: 'Cash',
    counterpartyWalletId: null,
    counterpartyWalletName: null,
    ...partial,
  };
}

const TWO_DAYS = [
  transaction({ id: 't1', occurredAt: '2026-09-18T10:00:00+07:00' }),
  transaction({ id: 't2', occurredAt: '2026-09-18T12:00:00+07:00' }),
  transaction({ id: 't3', occurredAt: '2026-09-17T09:00:00+07:00' }),
];

describe('TransactionHistoryList (SectionList)', () => {
  it('me-render grup hari sebagai section dengan barisnya', () => {
    render(<TransactionHistoryList transactions={TWO_DAYS} />);

    expect(screen.getByTestId('transaction-history-day-2026-09-18')).toBeTruthy();
    expect(screen.getByTestId('transaction-history-day-2026-09-17')).toBeTruthy();
    expect(screen.getByTestId('transaction-t1')).toBeTruthy();
    expect(screen.getByTestId('transaction-t2')).toBeTruthy();
    expect(screen.getByTestId('transaction-t3')).toBeTruthy();
  });

  it('menampilkan empty state saat kosong dan teks muat saat loading', () => {
    const { rerender } = render(<TransactionHistoryList transactions={[]} />);
    expect(screen.getByTestId('transaction-history-empty')).toBeTruthy();

    rerender(<TransactionHistoryList transactions={[]} loading />);
    expect(screen.getByText('Memuat riwayat…')).toBeTruthy();
  });

  it('footer: spinner saat loadingMore, "Akhir riwayat" saat habis', () => {
    const { rerender } = render(
      <TransactionHistoryList transactions={TWO_DAYS} loadingMore hasMore />,
    );
    expect(screen.getByTestId('transaction-history-loading-more')).toBeTruthy();

    rerender(<TransactionHistoryList transactions={TWO_DAYS} hasMore={false} />);
    expect(screen.getByText('Akhir riwayat')).toBeTruthy();
  });

  it('meneruskan onEndReached ke SectionList (paging jalan)', () => {
    const onEndReached = jest.fn();
    render(
      <TransactionHistoryList transactions={TWO_DAYS} onEndReached={onEndReached} />,
    );

    const list = screen.UNSAFE_getByType(SectionList);
    expect(list.props.onEndReached).toBe(onEndReached);
    fireEvent(list, 'onEndReached');
    expect(onEndReached).toHaveBeenCalledTimes(1);
  });

  it('membuka form edit saat baris ditekan', () => {
    const onPressTransaction = jest.fn();
    render(
      <TransactionHistoryList
        transactions={TWO_DAYS}
        onPressTransaction={onPressTransaction}
      />,
    );

    fireEvent.press(screen.getByTestId('transaction-t1'));
    expect(onPressTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ id: 't1' }),
    );
  });
});
