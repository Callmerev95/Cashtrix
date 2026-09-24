/**
 * Monthly summary tests — the Jest seam for ticket #45 (A6 "ringkasan bulan
 * lalu"). Everything money-related arrives pre-aggregated from
 * `v_monthly_summary`; what is locked here is the month-key math in the
 * user's timezone, the current/previous folding, the MoM delta rule
 * (`null` → dash, never NaN/Infinity), and the card's render contract
 * (`testID="dashboard-monthly-summary"`, tap → Analytics).
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { View } from 'react-native';

import {
  MonthlySummaryCard,
  formatMonthTitle,
  isEmptyMonthly,
  monthKeyInTz,
  monthlyDelta,
  prevMonthKey,
  toMonthlyComparison,
  type MonthlyComparison,
} from '@/features/analytics';

function comparison(): MonthlyComparison {
  return {
    current: { month: '2026-09-01', income: 5_000_000, expense: 500_000, net: 4_500_000 },
    previous: { month: '2026-08-01', income: 4_000_000, expense: 250_000, net: 3_750_000 },
  };
}

describe('month keys (tz-aware)', () => {
  it('bulan berjalan = tanggal-1 di tz user', () => {
    // 15 Sep 2026 10:00 WIB.
    expect(monthKeyInTz(new Date('2026-09-15T03:00:00Z'), 'Asia/Jakarta')).toBe(
      '2026-09-01',
    );
  });

  it('boundary WIB: 1 Okt 00:30 WIB masuk Oktober', () => {
    // 30 Sep 2026 17:30 UTC = 1 Okt 00:30 WIB.
    expect(monthKeyInTz(new Date('2026-09-30T17:30:00Z'), 'Asia/Jakarta')).toBe(
      '2026-10-01',
    );
  });

  it('boundary WIB: 30 Sep 23:59 WIB tetap September', () => {
    // 30 Sep 2026 16:59 UTC = 30 Sep 23:59 WIB.
    expect(monthKeyInTz(new Date('2026-09-30T16:59:00Z'), 'Asia/Jakarta')).toBe(
      '2026-09-01',
    );
  });

  it('bulan sebelumnya mundur tepat satu bulan, termasuk Januari', () => {
    expect(prevMonthKey('2026-09-01')).toBe('2026-08-01');
    expect(prevMonthKey('2026-01-01')).toBe('2025-12-01');
  });

  it('judul bulan id-ID', () => {
    expect(formatMonthTitle('2026-09-01')).toBe('September 2026');
    expect(formatMonthTitle('2026-01-01')).toBe('Januari 2026');
  });

  it('judul bulan mengikuti bahasa aktif (C6, R10)', () => {
    expect(formatMonthTitle('2026-01-01', 'en')).toBe('January 2026');
    expect(formatMonthTitle('2026-09-01', 'en')).toBe('September 2026');
  });
});

describe('toMonthlyComparison', () => {
  it('memetakan dua baris view ke current/previous', () => {
    const result = toMonthlyComparison(
      [
        { month: '2026-08-01', income: 4_000_000, expense: 250_000, net: 3_750_000 },
        { month: '2026-09-01', income: 5_000_000, expense: 500_000, net: 4_500_000 },
      ],
      '2026-09-01',
      '2026-08-01',
    );
    expect(result.current.expense).toBe(500_000);
    expect(result.previous.expense).toBe(250_000);
  });

  it('bulan tanpa baris terisi nol (bukan lubang)', () => {
    const result = toMonthlyComparison([], '2026-09-01', '2026-08-01');
    expect(result.current).toEqual({
      month: '2026-09-01',
      income: 0,
      expense: 0,
      net: 0,
    });
    expect(result.previous.month).toBe('2026-08-01');
  });

  it('baris bulan lain diabaikan', () => {
    const result = toMonthlyComparison(
      [{ month: '2026-07-01', income: 1, expense: 1, net: 0 }],
      '2026-09-01',
      '2026-08-01',
    );
    expect(isEmptyMonthly(result)).toBe(true);
  });
});

describe('monthlyDelta', () => {
  it('null bila bulan lalu nol (tidak pernah NaN/Infinity)', () => {
    expect(monthlyDelta(500_000, 0)).toBeNull();
    expect(monthlyDelta(0, 0)).toBeNull();
  });

  it('persen perubahan biasa', () => {
    expect(monthlyDelta(500_000, 250_000)).toBe(100);
    expect(monthlyDelta(125_000, 250_000)).toBe(-50);
  });

  it('net negatif memakai penyebut absolut seperti server', () => {
    // Bulan lalu net -100rb, bulan ini +100rb → (+100k-(-100k))/|-100k| = +200%.
    expect(monthlyDelta(100_000, -100_000)).toBe(200);
  });
});

describe('MonthlySummaryCard', () => {
  it('menampilkan judul bulan + tiga angka + delta', () => {
    render(
      <MonthlySummaryCard
        summary={comparison()}
        loading={false}
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByTestId('dashboard-monthly-summary')).toBeTruthy();
    expect(screen.getByText('September 2026')).toBeTruthy();
    // KpiHeader: "Rp {formatGrouped}".
    expect(screen.getByText('Rp 500.000')).toBeTruthy();
    expect(screen.getByText('Rp 5.000.000')).toBeTruthy();
    // Delta expense (500-250)/250 = +100%; income (5-4)/4 = +25%.
    expect(screen.getByText('+100,0%')).toBeTruthy();
    expect(screen.getByText('+25,0%')).toBeTruthy();
  });

  it('menampilkan strip saat bulan lalu kosong', () => {
    render(
      <MonthlySummaryCard
        summary={{
          current: { month: '2026-09-01', income: 0, expense: 300_000, net: -300_000 },
          previous: { month: '2026-08-01', income: 0, expense: 0, net: 0 },
        }}
        loading={false}
        onPress={jest.fn()}
      />,
    );

    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  it('bulan kosong menampilkan ajakan, bukan hilang', () => {
    render(
      <MonthlySummaryCard
        summary={toMonthlyComparison([], '2026-09-01', '2026-08-01')}
        loading={false}
        onPress={jest.fn()}
      />,
    );

    expect(screen.getByTestId('dashboard-monthly-summary')).toBeTruthy();
    expect(
      screen.getByText(/Belum ada transaksi bulan ini/),
    ).toBeTruthy();
  });

  it('loading tanpa data menampilkan skeleton', () => {
    const { UNSAFE_getByType } = render(
      <MonthlySummaryCard summary={null} loading onPress={jest.fn()} />,
    );

    // Skeleton primitive renders (raw View blocks — no readable copy).
    expect(screen.getByTestId('dashboard-monthly-summary')).toBeTruthy();
    expect(UNSAFE_getByType(View)).toBeTruthy();
  });

  it('tap kartu memanggil onPress (menuju Analytics)', () => {
    const onPress = jest.fn();
    render(
      <MonthlySummaryCard
        summary={comparison()}
        loading={false}
        onPress={onPress}
      />,
    );

    fireEvent.press(screen.getByTestId('dashboard-monthly-summary'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
