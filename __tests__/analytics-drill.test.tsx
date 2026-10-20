/**
 * L4a drill-down — the Analytics screen wiring lock.
 *
 * PRD R14 / roadmap §6.6: every chart surface is scoped to an instant window,
 * so tapping it must open `/search` showing *exactly* the rows behind it:
 * a KPI = the whole range, a donut slice / breakdown row = one category,
 * a bar = one bucket. The `__other__` tail aggregates unnamed categories, so
 * it deliberately has no drill (same rule as `toAnomalies`).
 *
 * The pure seams (`drillParams`, `bucketRange`, `parseSearchFilters`) are
 * covered in `transaction-search` / `analytics-domain`; this file locks the
 * screen's decision of *what* to push.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { router } from 'expo-router';

import {
  bucketRange,
  enumerateBuckets,
  resolveRange,
  useAnalytics,
} from '@/features/analytics';

jest.mock('expo-router', () => ({
  router: { push: jest.fn(), replace: jest.fn(), back: jest.fn() },
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
}));

// The pull-to-refresh wrapper is a reanimated twin; its static fallback is
// enough for a wiring test, and stubbing it keeps reanimated out of Jest
// (P1b lesson: the module loads but its hooks are undefined).
jest.mock('@/components/pull-refresh', () => ({
  PullGesture: ({ children }: { children: unknown }) => children,
  PullHeader: () => null,
  usePullRefresh: () => ({ refreshing: false, onRefresh: jest.fn() }),
}));

let mockAnalyticsValue: ReturnType<typeof useAnalytics>;

jest.mock('@/features/analytics', () => {
  const actual = jest.requireActual('@/features/analytics');
  return { ...actual, useAnalytics: () => mockAnalyticsValue };
});

jest.mock('@/features/budgets', () => {
  const actual = jest.requireActual('@/features/budgets');
  return {
    ...actual,
    useBudgets: () => ({ unreadCount: 0, budgets: [], month: null }),
  };
});

jest.mock('@/features/profile', () => {
  const actual = jest.requireActual('@/features/profile');
  return {
    ...actual,
    useProfile: () => ({
      profile: { timezone: 'Asia/Jakarta' },
      avatarSignedUrl: null,
    }),
  };
});

const AnalyticsScreen = require('../app/(tabs)/analytics').default;
const push = router.push as unknown as jest.Mock;

const TZ = 'Asia/Jakarta';
const CATEGORY_IDS = [
  'c1',
  'c2',
  'c3',
  'c4',
  'c5',
  'c6',
  'c7',
  'c8',
  'c9',
  'c10',
] as const;

/** The first bucket of the current 1M range — a day key, never a hardcoded date. */
function firstBucket() {
  return enumerateBuckets(resolveRange('1M'), true, TZ)[0];
}

/**
 * Ten categories so `toDonutSlices` folds a tail into `__other__` — the
 * no-drill case needs the aggregate to exist for real.
 */
function makeOverview() {
  const window = resolveRange('1M');
  return {
    range: { start: window.start.toISOString(), end: window.end.toISOString() },
    totals: { expense: 900_000, income: 5_000_000, net: 4_100_000 },
    previous: { expense: 0, income: 0, net: 0 },
    delta: { expense: 12.5, income: null, net: null },
    breakdown: CATEGORY_IDS.map((id, index) => ({
      categoryId: id,
      categoryName: `Kategori ${index + 1}`,
      categoryIcon: 'restaurant',
      totalExpense: 300_000 - index * 25_000,
      transactionCount: 1,
      share: 0.33,
    })),
    prevBreakdown: [],
    series: [
      { bucket: firstBucket(), totalExpense: 300_000, totalIncome: 0, net: -300_000 },
    ],
  };
}

function analyticsValue(
  overrides: Partial<ReturnType<typeof useAnalytics>> = {},
) {
  return {
    range: '1M' as const,
    setRange: jest.fn(),
    customRange: null,
    setCustomRange: jest.fn(),
    wallets: [],
    walletId: null,
    setWalletId: jest.fn(),
    overview: makeOverview(),
    loading: false,
    error: null,
    isEmpty: false,
    monthly: null,
    sparks: [],
    compare: [],
    compareLoading: false,
    compareError: null,
    refresh: jest.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useAnalytics>;
}

function renderScreen() {
  return render(
    <SafeAreaProvider
      initialMetrics={{
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 0, left: 0, right: 0, bottom: 0 },
      }}
    >
      <AnalyticsScreen />
    </SafeAreaProvider>,
  );
}

/** The single `router.push` payload, unwrapped from the RN call shape. */
function lastPush() {
  const call = push.mock.calls.at(-1)?.[0] as {
    pathname: string;
    params: Record<string, string>;
  };
  return call;
}

beforeEach(() => {
  push.mockReset();
  mockAnalyticsValue = analyticsValue();
});

describe('L4a — KPI drill', () => {
  it('pushes the whole range for an expense KPI', async () => {
    renderScreen();
    fireEvent.press(await screen.findByTestId('analytics-kpi-expense'));

    const window = resolveRange('1M');
    const { pathname, params } = lastPush();
    expect(pathname).toBe('/search');
    expect(params.kind).toBe('expense');
    expect(params.label).toBe('Pengeluaran · 1B');
    expect(params.from).toBe(window.start.toISOString());
    // `window.end` is "now", re-read a few ms later at render time.
    expect(
      Math.abs(new Date(params.to).getTime() - window.end.getTime()),
    ).toBeLessThan(5_000);
  });

  it('spans every kind for the Net KPI (net includes transfers)', async () => {
    renderScreen();
    fireEvent.press(await screen.findByTestId('analytics-kpi-net'));

    expect(lastPush().params.kind).toBe('all');
  });

  it('appends the active wallet to the chip label', async () => {
    mockAnalyticsValue = analyticsValue({
      walletId: 'w1',
      wallets: [{ id: 'w1', name: 'BCA' }],
    });
    renderScreen();
    fireEvent.press(await screen.findByTestId('analytics-kpi-income'));

    const { params } = lastPush();
    expect(params.kind).toBe('income');
    expect(params.walletId).toBe('w1');
    expect(params.label).toBe('Pemasukan · 1B · BCA');
  });
});

describe('L4a — slice drill', () => {
  it('offers a drill only after a named category is selected', async () => {
    renderScreen();
    expect(await screen.findByTestId('analytics-donut')).toBeTruthy();
    expect(screen.queryByTestId('analytics-drill-slice')).toBeNull();

    fireEvent.press(screen.getByTestId('analytics-breakdown-row-c1'));

    fireEvent.press(await screen.findByTestId('analytics-drill-slice'));
    const { params } = lastPush();
    expect(params.kind).toBe('expense');
    expect(params.categoryId).toBe('c1');
    expect(params.label).toBe('Kategori 1 · 1B');
  });

  it('never offers the drill for the __other__ tail', async () => {
    renderScreen();
    fireEvent.press(await screen.findByTestId('analytics-breakdown-row-__other__'));

    await waitFor(() =>
      expect(
        screen.getByTestId('analytics-breakdown-row-__other__'),
      ).toBeTruthy(),
    );
    expect(screen.queryByTestId('analytics-drill-slice')).toBeNull();
  });
});

describe('L4a — bucket drill', () => {
  it('scopes the push to the tapped bucket only', async () => {
    renderScreen();
    const bucket = firstBucket();
    const dayLabel = String(Number(bucket.slice(8, 10)));

    // The x-axis labels are day pressables sharing the bars' toggle.
    fireEvent.press(await screen.findByLabelText(new RegExp(`^${dayLabel},`)));
    fireEvent.press(await screen.findByTestId('analytics-drill-bucket'));

    const sub = bucketRange(bucket, true);
    expect(sub).not.toBeNull();
    const { params } = lastPush();
    expect(params.kind).toBe('expense');
    expect(params.from).toBe(sub!.from.toISOString());
    expect(params.to).toBe(sub!.to.toISOString());
    // A bucket window is one day — narrower than the KPI's whole range.
    expect(
      new Date(params.to).getTime() - new Date(params.from).getTime(),
    ).toBe(86_400_000);
  });

  it('hides the barrel drill until a bucket is selected', async () => {
    renderScreen();
    await screen.findByTestId('analytics-bars');
    expect(screen.queryByTestId('analytics-drill-bucket')).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });
});

describe('L4b — wallet compare', () => {
  const compareRows = [
    {
      walletId: 'w-bca',
      name: 'BCA',
      totals: { expense: 300_000, income: 0 },
      previous: { expense: 0, income: 0 },
      delta: { expense: null, income: null },
      share: { expense: 0.75, income: 0 },
      series: [],
    },
    {
      walletId: 'w-cash',
      name: 'Cash',
      totals: { expense: 100_000, income: 500_000 },
      previous: { expense: 0, income: 0 },
      delta: { expense: null, income: 100 },
      share: { expense: 0.25, income: 1 },
      series: [],
    },
  ];

  it('renders the ranked card and drills a row with its own wallet', async () => {
    mockAnalyticsValue = analyticsValue({ compare: compareRows });
    renderScreen();

    expect(await screen.findByTestId('wallet-compare')).toBeTruthy();
    expect(
      screen.getByTestId('wallet-compare-chip-w-bca').props.accessibilityState,
    ).toEqual({ selected: true });

    fireEvent.press(screen.getByTestId('wallet-compare-row-w-bca'));
    const { params } = lastPush();
    expect(params.kind).toBe('expense');
    expect(params.walletId).toBe('w-bca');
    expect(params.label).toBe('BCA · 1B');
  });

  it('follows the active metric for both rerank and drill kind', async () => {
    mockAnalyticsValue = analyticsValue({ compare: compareRows });
    renderScreen();

    fireEvent.press(await screen.findByTestId('wallet-compare-mode-income'));
    // Domain sorting is locked separately; here the screen must re-sort and
    // drill the metric, not the stale expense mode.
    fireEvent.press(await screen.findByTestId('wallet-compare-row-w-cash'));
    const { params } = lastPush();
    expect(params.kind).toBe('income');
    expect(params.walletId).toBe('w-cash');
  });

  it('hides the card while a single wallet filter is active', async () => {
    mockAnalyticsValue = analyticsValue({
      compare: compareRows,
      walletId: 'w-bca',
      wallets: [{ id: 'w-bca', name: 'BCA' }],
    });
    renderScreen();

    await screen.findByTestId('analytics-donut');
    expect(screen.queryByTestId('wallet-compare')).toBeNull();
  });
});
