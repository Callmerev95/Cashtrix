/**
 * 2.1.0 Analytics Overhaul — svg parity lock (PR1, static only).
 *
 * The donut/bar/ring moved from View stacks to `react-native-svg`, but the
 * contract is unchanged: same testIDs the Maestro static check counts, one
 * slice node per rendered category, the empty note instead of flat bars,
 * and the ring percent/state centre. The svg bridge itself is a host-View
 * stand-in in Jest (`__tests__/mocks/react-native-svg.js`), so these assert
 * structure, not pixels — pixels are the device gate's job.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';

import { DonutChart } from '@/features/analytics/components/donut-chart';
import { BarChart } from '@/features/analytics/components/bar-chart';
import { BudgetRing } from '@/features/budgets/components/budget-ring';
import { BreakdownList } from '@/features/analytics/components/breakdown-list';
import { InsightCard } from '@/features/analytics/components/insight-card';
import { toInsightSummary } from '@/features/analytics';

const SLICES = [
  { id: 'c1', label: 'Makanan', value: 300000, share: 0.75 },
  { id: 'c2', label: 'Transport', value: 100000, share: 0.25 },
];

describe('DonutChart (svg)', () => {
  it('renders the wheel, one node per slice, and the expense total', async () => {
    render(<DonutChart slices={SLICES} total={400000} />);
    expect(await screen.findByTestId('analytics-donut')).toBeTruthy();
    expect(screen.getByTestId('analytics-donut-slice-c1')).toBeTruthy();
    expect(screen.getByTestId('analytics-donut-slice-c2')).toBeTruthy();
    expect(screen.getByTestId('analytics-donut-total')).toBeTruthy();
  });

  it('renders an empty wheel without slices when the breakdown is empty', async () => {
    render(<DonutChart slices={[]} total={0} />);
    expect(await screen.findByTestId('analytics-donut')).toBeTruthy();
    expect(screen.queryByTestId('analytics-donut-slice-c1')).toBeNull();
  });
});

describe('BarChart (svg)', () => {
  const bars = [
    { bucket: '2026-09-01', value: 50000, height: 1, label: '1' },
    { bucket: '2026-09-02', value: 0, height: 0, label: '2' },
  ];

  it('renders the plot when at least one bucket has value', async () => {
    render(<BarChart bars={bars} />);
    expect(await screen.findByTestId('analytics-bars')).toBeTruthy();
    // Axis labels render before the first layout pass (the svg plot needs
    // a measured width, which Jest never provides).
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.queryByTestId('analytics-bars-empty')).toBeNull();
  });

  it('renders the empty note instead of flat bars when all buckets are zero', async () => {
    const zeros = bars.map((bar) => ({ ...bar, value: 0, height: 0 }));
    render(<BarChart bars={zeros} />);
    expect(await screen.findByTestId('analytics-bars-empty')).toBeTruthy();
  });
});

describe('BudgetRing (svg)', () => {
  it('renders the fill arc and the percent centre', async () => {
    render(<BudgetRing percent={80} state="warning" />);
    expect(await screen.findByTestId('budget-ring')).toBeTruthy();
    expect(screen.getByTestId('budget-ring-fill')).toBeTruthy();
    expect(screen.getByTestId('budget-ring-percent')).toBeTruthy();
  });

  it('renders no fill arc at zero percent', async () => {
    render(<BudgetRing percent={0} state="ok" />);
    expect(await screen.findByTestId('budget-ring')).toBeTruthy();
    expect(screen.queryByTestId('budget-ring-fill')).toBeNull();
  });
});

describe('PR2 selection + insight', () => {
  const slices = [
    { id: 'c1', label: 'Makanan', icon: 'restaurant', value: 300000, share: 0.75 },
    { id: 'c2', label: 'Transport', icon: 'directions_bus', value: 100000, share: 0.25 },
  ];

  it('tapping a breakdown row reports the toggle contract', async () => {
    const onSelect = jest.fn();
    render(
      <BreakdownList slices={slices} selectedId={null} onSelect={onSelect} />,
    );
    fireEvent.press(await screen.findByTestId('analytics-breakdown-row-c1'));
    expect(onSelect).toHaveBeenCalledWith('c1');
  });

  it('tapping the selected row clears the selection', async () => {
    const onSelect = jest.fn();
    render(
      <BreakdownList slices={slices} selectedId="c1" onSelect={onSelect} />,
    );
    fireEvent.press(await screen.findByTestId('analytics-breakdown-row-c1'));
    expect(onSelect).toHaveBeenCalledWith(null);
  });

  it('renders the deterministic insight card with one line per sentence', async () => {
    const summary = toInsightSummary({
      totals: { expense: 300000, income: 500000, net: 200000 },
      monthly: {
        current: { month: '2026-10-01', income: 0, expense: 300000, net: -300000 },
        previous: { month: '2026-09-01', income: 0, expense: 200000, net: -200000 },
      },
      slices,
    });
    render(<InsightCard summary={summary} />);
    expect(await screen.findByTestId('analytics-insight')).toBeTruthy();
    expect(screen.getByTestId('analytics-insight-line-0')).toBeTruthy();
  });

  it('hides the insight card when there is nothing to say', async () => {
    const summary = toInsightSummary({
      totals: { expense: 0, income: 0, net: 0 },
      monthly: null,
      slices: [],
    });
    const { toJSON } = render(<InsightCard summary={summary} />);
    expect(toJSON()).toBeNull();
  });
});

describe('AnimatedNumber (P1a static fallback)', () => {
  it('renders the exact formatted value without the native bridge', async () => {
    const { AnimatedNumber } = require('@/features/analytics/components/animated-number');
    render(
      <AnimatedNumber
        value={248590.4}
        format={(n: number) => `Rp ${n}`}
        testID="anim-number"
      />,
    );
    expect(await screen.findByTestId('anim-number')).toBeTruthy();
    expect(screen.getByText('Rp 248590.4')).toBeTruthy();
  });
});
