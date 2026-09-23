/**
 * Bulk select tests — the Jest seam for ticket #47 (A4 "bulk edit kategori").
 * Pure gate: transfers can never enter the set, a second kind can never join
 * (first checked row locks), and unchecking the last row releases the lock.
 * The row's check-circle contract rides along.
 */
import { render, screen } from '@testing-library/react-native';

import {
  TransactionRow,
  bulkSelectionFor,
  toggleBulkRow,
  type Transaction,
} from '@/features/transactions';

function row(partial: Partial<Transaction> = {}): Transaction {
  return {
    id: partial.id ?? 'tx-1',
    type: partial.type ?? 'expense',
    amount: partial.amount ?? 25_000,
    currencyCode: 'IDR',
    occurredAt: '2026-09-20T10:00:00+07:00',
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

describe('bulkSelectionFor', () => {
  const rows = [row({ id: 'a' }), row({ id: 'b', type: 'income' })];

  it('kosong → kind null', () => {
    expect(bulkSelectionFor([], rows)).toEqual({ ids: [], kind: null });
  });

  it('kind = baris pertama yang cocok', () => {
    expect(bulkSelectionFor(['b', 'a'], rows).kind).toBe('expense');
  });

  it('id basi (keluar halaman) diabaikan untuk kind', () => {
    expect(bulkSelectionFor(['gone'], rows)).toEqual({
      ids: ['gone'],
      kind: null,
    });
  });
});

describe('toggleBulkRow', () => {
  it('centang pertama mengunci (tanpa penolakan)', () => {
    expect(
      toggleBulkRow([], { id: 'a', type: 'expense' }, null),
    ).toEqual({ ids: ['a'], rejected: null });
  });

  it('tap ulang melepas; terakhir dilepas membuka kunci', () => {
    const off = toggleBulkRow(['a'], { id: 'a', type: 'expense' }, 'expense');
    expect(off).toEqual({ ids: [], rejected: null });
    expect(bulkSelectionFor(off.ids, [row({ id: 'a' })]).kind).toBeNull();
  });

  it('sejenis menumpuk', () => {
    expect(
      toggleBulkRow(['a'], { id: 'b', type: 'expense' }, 'expense'),
    ).toEqual({ ids: ['a', 'b'], rejected: null });
  });

  it('beda jenis ditolak, daftar tidak berubah', () => {
    expect(
      toggleBulkRow(['a'], { id: 'b', type: 'income' }, 'expense'),
    ).toEqual({ ids: ['a'], rejected: 'kind' });
  });

  it('transfer tidak pernah masuk', () => {
    expect(
      toggleBulkRow([], { id: 't', type: 'transfer' }, null),
    ).toEqual({ ids: [], rejected: 'transfer' });
    expect(
      toggleBulkRow(['a'], { id: 't', type: 'transfer' }, 'expense'),
    ).toEqual({ ids: ['a'], rejected: 'transfer' });
  });
});

describe('TransactionRow select mode', () => {
  it('tanpa selecting: well ikon, tanpa centang', () => {
    render(<TransactionRow testID="row-1" transaction={row()} />);
    expect(screen.queryByTestId('row-1-check')).toBeNull();
  });

  it('selecting: lingkaran centang, terisi saat selected', () => {
    const { rerender } = render(
      <TransactionRow testID="row-1" transaction={row()} selecting />,
    );
    expect(screen.getByTestId('row-1-check')).toBeTruthy();
    expect(
      screen.getByTestId('row-1-check').props.accessibilityState,
    ).toEqual({ checked: false, disabled: false });

    rerender(
      <TransactionRow testID="row-1" transaction={row()} selecting selected />,
    );
    expect(
      screen.getByTestId('row-1-check').props.accessibilityState,
    ).toEqual({ checked: true, disabled: false });
  });
});
