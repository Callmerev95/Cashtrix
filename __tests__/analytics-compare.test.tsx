/**
 * L4b "Bandingkan Dompet" card — presentational contract.
 *
 * The screen owns selection/sorting and the provider owns the payload; this
 * suite locks the card's own job: chips reflect `selectedIds`, the toggle
 * reports the picked metric, rows drill with their own row, and the three
 * state branches (loading / error+retry / empty mode) stay honest.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { WalletCompareCard } from '@/features/analytics';
import type { Sparkline, WalletCompareRow } from '@/features/analytics';

function row(partial: Partial<WalletCompareRow>): WalletCompareRow {
  return {
    walletId: partial.walletId ?? 'bca',
    name: partial.name ?? 'BCA',
    totals: partial.totals ?? { expense: 300_000, income: 0 },
    previous: partial.previous ?? { expense: 0, income: 0 },
    delta: partial.delta ?? { expense: 75, income: null },
    share: partial.share ?? { expense: 0.6364, income: 0 },
    series: partial.series ?? [],
  };
}

const BCA = row({ walletId: 'bca', name: 'BCA' });
const CASH = row({
  walletId: 'cash',
  name: 'Cash',
  totals: { expense: 100_000, income: 500_000 },
  delta: { expense: null, income: 10 },
  share: { expense: 0.2121, income: 0.5 },
});
const GOPAY = row({
  walletId: 'gopay',
  name: 'GoPay',
  totals: { expense: 0, income: 0 },
  delta: { expense: -100, income: null },
  share: { expense: 0, income: 0 },
});

function renderCard(
  overrides: Partial<React.ComponentProps<typeof WalletCompareCard>> = {},
) {
  const props: React.ComponentProps<typeof WalletCompareCard> = {
    wallets: [BCA, CASH, GOPAY],
    rows: [BCA, CASH],
    sparks: [
      { id: 'bca', values: [0, 1] },
      { id: 'cash', values: [1, 0] },
    ] as Sparkline[],
    mode: 'expense',
    selectedIds: ['bca', 'cash'],
    onModeChange: jest.fn(),
    onToggle: jest.fn(),
    onSelectRow: jest.fn(),
    onRetry: jest.fn(),
    ...overrides,
  };
  render(<WalletCompareCard {...props} />);
  return props;
}

describe('WalletCompareCard (L4b)', () => {
  it('renders the card, both metric options and one chip per active wallet', async () => {
    renderCard();
    expect(await screen.findByTestId('wallet-compare')).toBeTruthy();
    expect(screen.getByTestId('wallet-compare-mode-expense')).toBeTruthy();
    expect(screen.getByTestId('wallet-compare-mode-income')).toBeTruthy();
    expect(screen.getByTestId('wallet-compare-chip-bca')).toBeTruthy();
    expect(screen.getByTestId('wallet-compare-chip-cash')).toBeTruthy();
    expect(screen.getByTestId('wallet-compare-chip-gopay')).toBeTruthy();
    expect(
      screen.getByTestId('wallet-compare-mode-expense').props
        .accessibilityState,
    ).toEqual({ selected: true });
    expect(
      screen.getByTestId('wallet-compare-chip-bca').props.accessibilityState,
    ).toEqual({ selected: true });
    expect(
      screen.getByTestId('wallet-compare-chip-gopay').props.accessibilityState,
    ).toEqual({ selected: false });
  });

  it('reports the picked metric and toggled chip', async () => {
    const props = renderCard();
    fireEvent.press(await screen.findByTestId('wallet-compare-mode-income'));
    expect(props.onModeChange).toHaveBeenCalledWith('income');
    fireEvent.press(screen.getByTestId('wallet-compare-chip-gopay'));
    expect(props.onToggle).toHaveBeenCalledWith('gopay');
  });

  it('shows the minimum hint below two picks and the maximum hint at the cap', async () => {
    const { rerender } = render(
      <WalletCompareCard
        wallets={[BCA, CASH, GOPAY]}
        rows={[BCA]}
        mode="expense"
        selectedIds={['bca']}
        onModeChange={jest.fn()}
        onToggle={jest.fn()}
        onSelectRow={jest.fn()}
        onRetry={jest.fn()}
      />,
    );
    expect(await screen.findByTestId('wallet-compare-hint')).toHaveTextContent(
      'Pilih minimal dua dompet untuk dibandingkan.',
    );
    const five = [BCA, CASH, GOPAY, row({ walletId: 'd', name: 'D' }), row({ walletId: 'e', name: 'E' })];
    rerender(
      <WalletCompareCard
        wallets={five}
        rows={five.slice(0, 4)}
        mode="expense"
        selectedIds={['bca', 'cash', 'gopay', 'd']}
        onModeChange={jest.fn()}
        onToggle={jest.fn()}
        onSelectRow={jest.fn()}
        onRetry={jest.fn()}
      />,
    );
    expect(screen.getByTestId('wallet-compare-hint')).toHaveTextContent(
      'Maksimal empat dompet sekaligus.',
    );
  });

  it('renders the ranked rows with amount, delta, share and spark', async () => {
    renderCard();
    expect(await screen.findByTestId('wallet-compare-row-bca')).toBeTruthy();
    expect(screen.getByTestId('wallet-compare-row-cash')).toBeTruthy();
    expect(screen.queryByTestId('wallet-compare-row-gopay')).toBeNull();
    expect(screen.getByText('Rp 300.000')).toBeTruthy();
    expect(screen.getByText(/\+75,0%/)).toBeTruthy();
    expect(screen.getByText(/64%/)).toBeTruthy();
    expect(screen.getByTestId('wallet-compare-spark-bca')).toBeTruthy();
    expect(screen.getByLabelText('Lihat transaksi BCA')).toBeTruthy();
  });

  it('drills with the tapped row', async () => {
    const props = renderCard();
    fireEvent.press(await screen.findByTestId('wallet-compare-row-cash'));
    expect(props.onSelectRow).toHaveBeenCalledWith(CASH);
  });

  it('explains an empty active metric instead of rendering a flat chart', async () => {
    renderCard({ rows: [GOPAY], selectedIds: ['gopay'] });
    expect(await screen.findByTestId('wallet-compare-empty')).toBeTruthy();
    expect(screen.queryByTestId('wallet-compare-row-gopay')).toBeNull();
  });

  it('surfaces the error with a retry and never skips the state for stale rows', async () => {
    const props = renderCard({ error: 'offline' });
    expect(await screen.findByTestId('wallet-compare-retry')).toBeTruthy();
    fireEvent.press(screen.getByTestId('wallet-compare-retry'));
    expect(props.onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('wallet-compare-row-bca')).toBeNull();
  });

  it('shows the skeleton while loading', async () => {
    renderCard({ loading: true });
    expect(await screen.findByTestId('wallet-compare-loading')).toBeTruthy();
    expect(screen.queryByTestId('wallet-compare-row-bca')).toBeNull();
  });
});
