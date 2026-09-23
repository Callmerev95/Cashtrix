/**
 * Search tests — the Jest seam for ticket #46 (A3 "cari & filter riwayat").
 * Pure parts: the `*…*` pattern builder (structural chars stripped so a paste
 * can never break the PostgREST `or()` grammar), the idle-vs-active gate, and
 * the kind control's render contract (four static testIDs incl. `all`).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import {
  KIND_FILTER_OPTIONS,
  SEARCH_DEBOUNCE_MS,
  SearchKindControl,
  buildSearchPattern,
  isSearchActive,
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
