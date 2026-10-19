/**
 * Search tests — the Jest seam for ticket #46 (A3 "cari & filter riwayat").
 * Pure parts: the `*…*` pattern builder (structural chars stripped so a paste
 * can never break the PostgREST `or()` grammar), the idle-vs-active gate, and
 * the kind control's render contract (four static testIDs incl. `all`).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  EMPTY_SEARCH_FILTERS,
  KIND_FILTER_OPTIONS,
  SEARCH_DEBOUNCE_MS,
  SearchKindControl,
  buildSearchPattern,
  drillParams,
  hasSearchFilters,
  isSearchActive,
  kindFilterLabel,
  parseKindFilter,
  parseSearchFilters,
  searchFilterKey,
} from '@/features/transactions';

describe('buildSearchPattern', () => {
  it('membungkus teks menjadi pola contains', () => {
    expect(buildSearchPattern('kopi')).toBe('*kopi*');
    expect(buildSearchPattern('  kopi susu  ')).toBe('*kopi susu*');
  });

  it('kosong/blank → null (layar tetap idle)', () => {
    expect(buildSearchPattern('')).toBeNull();
    expect(buildSearchPattern('   ')).toBeNull();
  });

  it('menanggalkan karakter struktural or() agar paste tidak merusak query', () => {
    expect(buildSearchPattern('a,b(c)d"e')).toBe('*abcde*');
    expect(buildSearchPattern(',,,')).toBeNull();
  });
});

describe('isSearchActive', () => {
  it('idle bila teks kosong dan kind Semua', () => {
    expect(isSearchActive('', 'all')).toBe(false);
    expect(isSearchActive('   ', 'all')).toBe(false);
  });

  it('aktif bila ada teks atau kind menyempit', () => {
    expect(isSearchActive('kopi', 'all')).toBe(true);
    expect(isSearchActive('', 'expense')).toBe(true);
    expect(isSearchActive('', 'transfer')).toBe(true);
  });
});

describe('search constants', () => {
  it('debounce 300ms', () => {
    expect(SEARCH_DEBOUNCE_MS).toBe(300);
  });

  it('empat opsi kind diawali Semua', () => {
    expect(KIND_FILTER_OPTIONS.map((option) => option.value)).toEqual([
      'all',
      'expense',
      'income',
      'transfer',
    ]);
  });

  it('label kind mengikuti bahasa aktif (C6)', () => {
    expect(kindFilterLabel('all')).toBe('Semua');
    expect(kindFilterLabel('expense', 'en')).toBe('Expense');
    expect(kindFilterLabel('all', 'en')).toBe('All');
  });
});

describe('drill-down filters (L4a)', () => {
  it('parseSearchFilters menormalkan params rute (array → string pertama)', () => {
    expect(parseSearchFilters({})).toEqual(EMPTY_SEARCH_FILTERS);
    expect(
      parseSearchFilters({
        categoryId: 'cat-1',
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-02T00:00:00.000Z',
        walletId: ['w-1', 'w-2'],
        label: 'Makanan · 1B',
      }),
    ).toEqual({
      categoryId: 'cat-1',
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-02T00:00:00.000Z',
      walletId: 'w-1',
      label: 'Makanan · 1B',
    });
  });

  it('hasSearchFilters mengabaikan label (presentasional)', () => {
    expect(hasSearchFilters(EMPTY_SEARCH_FILTERS)).toBe(false);
    expect(
      hasSearchFilters({ ...EMPTY_SEARCH_FILTERS, label: 'Makanan' }),
    ).toBe(false);
    expect(
      hasSearchFilters({ ...EMPTY_SEARCH_FILTERS, categoryId: 'cat-1' }),
    ).toBe(true);
    expect(hasSearchFilters({ ...EMPTY_SEARCH_FILTERS, from: 'x' })).toBe(true);
    expect(hasSearchFilters({ ...EMPTY_SEARCH_FILTERS, to: 'x' })).toBe(true);
    expect(
      hasSearchFilters({ ...EMPTY_SEARCH_FILTERS, walletId: 'w-1' }),
    ).toBe(true);
  });

  it('isSearchActive ikut menyala saat hanya filter terstruktur yang diisi', () => {
    expect(isSearchActive('', 'all', EMPTY_SEARCH_FILTERS)).toBe(false);
    expect(
      isSearchActive('', 'all', { ...EMPTY_SEARCH_FILTERS, categoryId: 'cat-1' }),
    ).toBe(true);
  });

  it('searchFilterKey stabil dan berbeda per isi', () => {
    expect(searchFilterKey(EMPTY_SEARCH_FILTERS)).toBe('|||');
    expect(
      searchFilterKey({
        categoryId: 'cat-1',
        from: 'a',
        to: 'b',
        walletId: 'w-1',
        label: 'x',
      }),
    ).toBe('cat-1|a|b|w-1');
  });

  it('parseKindFilter hanya menerima kind yang sah', () => {
    expect(parseKindFilter(undefined)).toBe('all');
    expect(parseKindFilter('')).toBe('all');
    expect(parseKindFilter('bogus')).toBe('all');
    expect(parseKindFilter('all')).toBe('all');
    expect(parseKindFilter('expense')).toBe('expense');
    expect(parseKindFilter(['transfer'])).toBe('transfer');
  });

  it('drillParams selalu membawa from/to + label, kategori/dompet opsional', () => {
    expect(
      drillParams({
        kind: 'expense',
        from: '2026-10-01T00:00:00.000Z',
        to: '2026-10-02T00:00:00.000Z',
        label: 'Makanan · 1B',
      }),
    ).toEqual({
      kind: 'expense',
      from: '2026-10-01T00:00:00.000Z',
      to: '2026-10-02T00:00:00.000Z',
      label: 'Makanan · 1B',
    });

    expect(
      drillParams({
        kind: 'all',
        from: 'a',
        to: 'b',
        categoryId: 'cat-1',
        walletId: 'w-1',
        label: 'Net · Semua',
      }),
    ).toEqual({
      kind: 'all',
      from: 'a',
      to: 'b',
      categoryId: 'cat-1',
      walletId: 'w-1',
      label: 'Net · Semua',
    });
  });
});

describe('SearchKindControl', () => {
  it('merender empat segmen dengan testID statis', () => {
    render(<SearchKindControl value="all" onChange={jest.fn()} />);

    expect(screen.getByTestId('search-kind-all')).toBeTruthy();
    expect(screen.getByTestId('search-kind-expense')).toBeTruthy();
    expect(screen.getByTestId('search-kind-income')).toBeTruthy();
    expect(screen.getByTestId('search-kind-transfer')).toBeTruthy();
  });

  it('memanggil onChange dengan kind yang ditekan', () => {
    const onChange = jest.fn();
    render(<SearchKindControl value="all" onChange={onChange} />);

    fireEvent.press(screen.getByTestId('search-kind-expense'));
    expect(onChange).toHaveBeenCalledWith('expense');
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('menandai segmen aktif untuk aksesibilitas', () => {
    render(<SearchKindControl value="income" onChange={jest.fn()} />);

    expect(
      screen.getByTestId('search-kind-income').props.accessibilityState,
    ).toEqual({ selected: true });
    expect(
      screen.getByTestId('search-kind-all').props.accessibilityState,
    ).toEqual({ selected: false });
  });
});
