/**
 * Analytics domain tests — the Jest seam for ticket #7 (Epic D "Financial
 * Intelligence"). Everything here is pure: range windows, donut folding/arc
 * filtering, bar gap-filling/heights, and delta formatting (the `null` →
 * dash rule that keeps `NaN`/`Infinity` off the screen).
 */
import {
  CUSTOM_MAX_MONTHS,
  CUSTOM_RANGE,
  DONUT_TOP_N,
  MIN_ARC_SHARE,
  OTHER_LABEL,
  RANGE_PRESETS,
  bucketRange,
  deltaTone,
  donutSegmentSliceIndices,
  enumerateBuckets,
  formatCustomLabel,
  formatDateKey,
  formatDelta,
  isAnalyticsRange,
  isDailyCustom,
  isDailyRange,
  isEmptyRange,
  isRangePreset,
  rangeLabel,
  rangeLabels,
  resolveCustomRange,
  resolveRange,
  sliceIndexAtTurn,
  toArcOffsets,
  toAnomalies,
  toBars,
  toDonutSlices,
  toDrivers,
  toFullSlices,
  toInsightSummary,
  toRunRate,
  toNetPoints,
  arcGradientVector,
  roundCapSpan,
  shouldRoundCaps,
  toSparklines,
  type AnalyticsOverview,
  type CategoryBreakdown,
  type DateRange,
  type SeriesBucket,
} from '@/features/analytics';

function breakdown(partial: Partial<CategoryBreakdown>): CategoryBreakdown {
  return {
    categoryId: partial.categoryId ?? 'c1',
    categoryName: partial.categoryName ?? 'Makanan',
    categoryIcon: partial.categoryIcon ?? 'restaurant',
    totalExpense: partial.totalExpense ?? 100_000,
    transactionCount: partial.transactionCount ?? 1,
    share: partial.share ?? 0.5,
  };
}

function bucket(partial: Partial<SeriesBucket>): SeriesBucket {
  return {
    bucket: partial.bucket ?? '2026-09-05',
    totalExpense: partial.totalExpense ?? 0,
    totalIncome: partial.totalIncome ?? 0,
    net: partial.net ?? 0,
  };
}

describe('range presets', () => {
  it('exposes every AC range with a label', () => {
    expect(RANGE_PRESETS).toEqual(['1M', '3M', '6M', '1Y', 'ALL']);
    for (const preset of RANGE_PRESETS) {
      expect(rangeLabels[preset]).toBeTruthy();
    }
  });

  it('recognises only known presets', () => {
    expect(isRangePreset('1M')).toBe(true);
    expect(isRangePreset('ALL')).toBe(true);
    expect(isRangePreset('2M')).toBe(false);
    expect(isRangePreset(null)).toBe(false);
  });

  it('localises range labels with id defaults (C6)', () => {
    expect(rangeLabel('1M')).toBe('1B');
    expect(rangeLabel('ALL')).toBe('Semua');
    expect(rangeLabel('1M', 'en')).toBe('1M');
    expect(rangeLabel('ALL', 'en')).toBe('All');
  });

  it('only 1M uses daily buckets; everything longer is monthly', () => {
    expect(isDailyRange('1M')).toBe(true);
    for (const preset of ['3M', '6M', '1Y', 'ALL'] as const) {
      expect(isDailyRange(preset)).toBe(false);
    }
  });
});

describe('resolveRange', () => {
  const now = new Date('2026-09-18T10:00:00+07:00');

  it('1M starts at the first of the current month (month-to-date)', () => {
    const range = resolveRange('1M', now);
    expect(range.start.getFullYear()).toBe(2026);
    expect(range.start.getMonth()).toBe(8); // September (0-indexed)
    expect(range.start.getDate()).toBe(1);
    expect(range.end.getTime()).toBe(now.getTime());
  });

  it('1M previous window is the whole month before, equal length', () => {
    const range = resolveRange('1M', now);
    expect(range.previousStart.getMonth()).toBe(7); // August
    expect(range.previousStart.getDate()).toBe(1);
    expect(range.previousEnd.getTime()).toBe(range.start.getTime());
  });

  it('3M/6M/1Y include the current month and step back N-1 months', () => {
    expect(resolveRange('3M', now).start.getMonth()).toBe(6); // July
    expect(resolveRange('6M', now).start.getMonth()).toBe(3); // April
    expect(resolveRange('1Y', now).start.getMonth()).toBe(9); // October
    expect(resolveRange('1Y', now).start.getFullYear()).toBe(2025);
  });

  it('ALL starts at the epoch with an empty previous window', () => {
    const range = resolveRange('ALL', now);
    expect(range.start.getTime()).toBe(0);
    expect(range.previousStart.getTime()).toBe(0);
    expect(range.previousEnd.getTime()).toBe(0);
  });

  it('never mutates the injected now', () => {
    const frozen = new Date('2026-09-18T10:00:00+07:00');
    const before = frozen.getTime();
    resolveRange('3M', frozen);
    expect(frozen.getTime()).toBe(before);
  });
});

describe('toDonutSlices', () => {
  it('keeps the top 8 and folds the tail into a single Other slice', () => {
    const items = Array.from({ length: 10 }, (_, index) =>
      breakdown({
        categoryId: `c${index}`,
        categoryName: `Kategori ${index}`,
        totalExpense: 1000 - index * 10,
        share: 0.1,
      }),
    );

    const slices = toDonutSlices(items);
    expect(slices).toHaveLength(DONUT_TOP_N + 1);
    expect(slices[DONUT_TOP_N]?.label).toBe(OTHER_LABEL);
    expect(slices[DONUT_TOP_N]?.id).toBe('__other__');
    // Other sums the two tail items (index 8 → 920, index 9 → 910).
    expect(slices[DONUT_TOP_N]?.value).toBe(920 + 910);
  });

  it('adds no Other slice when there are 8 or fewer categories', () => {
    const slices = toDonutSlices([breakdown({ share: 1 })]);
    expect(slices).toHaveLength(1);
    expect(slices[0]?.label).toBe('Makanan');
  });

  it('drops arcs thinner than 0.5% but keeps the center total intact', () => {
    const slices = toDonutSlices([
      breakdown({ categoryId: 'big', share: 0.994 }),
      breakdown({ categoryId: 'sliver', share: 0.006 }),
      breakdown({ categoryId: 'invisible', share: 0.004 }),
    ]);

    const ids = slices.map((slice) => slice.id);
    expect(ids).toContain('big');
    expect(ids).toContain('sliver');
    // 0.004 < MIN_ARC_SHARE (0.005) → not drawn.
    expect(ids).not.toContain('invisible');
    expect(MIN_ARC_SHARE).toBe(0.005);
  });

  it('preserves the DB ordering (never re-sorts)', () => {
    const slices = toDonutSlices([
      breakdown({ categoryId: 'a', totalExpense: 300, share: 0.6 }),
      breakdown({ categoryId: 'b', totalExpense: 200, share: 0.4 }),
    ]);
    expect(slices.map((slice) => slice.id)).toEqual(['a', 'b']);
  });
});

describe('toArcOffsets', () => {
  it('produces contiguous, non-overlapping offsets covering the whole wheel', () => {
    const offsets = toArcOffsets([{ share: 0.5 }, { share: 0.3 }, { share: 0.2 }]);
    expect(offsets[0]).toEqual({ start: 0, end: 0.5 });
    expect(offsets[1]).toEqual({ start: 0.5, end: 0.8 });
    expect(offsets[2]).toEqual({ start: 0.8, end: 1 });
  });

  it('normalises shares that do not sum to exactly 1', () => {
    const offsets = toArcOffsets([{ share: 1 }, { share: 1 }]);
    expect(offsets[0]).toEqual({ start: 0, end: 0.5 });
    expect(offsets[1]).toEqual({ start: 0.5, end: 1 });
  });

  it('returns zero-width offsets rather than dividing by zero', () => {
    const offsets = toArcOffsets([{ share: 0 }, { share: 0 }]);
    expect(offsets).toEqual([
      { start: 0, end: 0 },
      { start: 0, end: 0 },
    ]);
  });
});

describe('donut segment → slice mapping', () => {
  it('sends a turn to the slice that owns that sector', () => {
    const slices = [{ share: 0.6 }, { share: 0.4 }];
    expect(sliceIndexAtTurn(slices, 0.1)).toBe(0);
    expect(sliceIndexAtTurn(slices, 0.59)).toBe(0);
    expect(sliceIndexAtTurn(slices, 0.7)).toBe(1);
    expect(sliceIndexAtTurn(slices, 0.99)).toBe(1);
  });

  it('returns -1 for an empty wheel', () => {
    expect(sliceIndexAtTurn([], 0.5)).toBe(-1);
  });

  it('maps every rendered segment to a real slice', () => {
    const owners = donutSegmentSliceIndices([
      { share: 0.5 },
      { share: 0.5 },
    ]);
    expect(owners).toHaveLength(60);
    expect(owners.every((index) => index === 0 || index === 1)).toBe(true);
    expect(owners.filter((index) => index === 0).length).toBe(30);
  });
});

describe('enumerateBuckets (tz-aware axis)', () => {
  it('fills every day of a 1M window', () => {
    const range: DateRange = {
      start: new Date('2026-09-01T00:00:00+07:00'),
      end: new Date('2026-09-04T00:00:00+07:00'),
      previousStart: new Date('2026-08-01T00:00:00+07:00'),
      previousEnd: new Date('2026-09-01T00:00:00+07:00'),
    };
    expect(enumerateBuckets(range, true)).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
    ]);
  });

  it('fills every month of a longer window', () => {
    const range: DateRange = {
      start: new Date('2026-07-01T00:00:00+07:00'),
      end: new Date('2026-10-01T00:00:00+07:00'),
      previousStart: new Date('2026-04-01T00:00:00+07:00'),
      previousEnd: new Date('2026-07-01T00:00:00+07:00'),
    };
    expect(enumerateBuckets(range, false)).toEqual([
      '2026-07-01',
      '2026-08-01',
      '2026-09-01',
    ]);
  });

  it('assigns a WIB instant to the WIB day, not the UTC day', () => {
    // 2026-10-01 00:30 WIB is still 2026-09-30 17:30 UTC.
    const instant = new Date('2026-09-30T17:30:00Z');
    expect(formatDateKey(instant, 'Asia/Jakarta')).toBe('2026-10-01');
    expect(formatDateKey(instant, 'UTC')).toBe('2026-09-30');
  });

  it('handles a single-day window without emitting an empty axis', () => {
    const range: DateRange = {
      start: new Date('2026-09-01T00:00:00+07:00'),
      end: new Date('2026-09-02T00:00:00+07:00'),
      previousStart: new Date('2026-08-01T00:00:00+07:00'),
      previousEnd: new Date('2026-09-01T00:00:00+07:00'),
    };
    expect(enumerateBuckets(range, true)).toEqual(['2026-09-01']);
  });
});

describe('toBars', () => {
  const range: DateRange = {
    start: new Date('2026-09-01T00:00:00+07:00'),
    end: new Date('2026-09-04T00:00:00+07:00'),
    previousStart: new Date('2026-08-01T00:00:00+07:00'),
    previousEnd: new Date('2026-09-01T00:00:00+07:00'),
  };

  it('fills gaps with a zero bar so the axis is uniform', () => {
    const bars = toBars(
      [bucket({ bucket: '2026-09-02', totalExpense: 50_000 })],
      range,
      true,
    );
    expect(bars.map((bar) => bar.bucket)).toEqual([
      '2026-09-01',
      '2026-09-02',
      '2026-09-03',
    ]);
    expect(bars.map((bar) => bar.value)).toEqual([0, 50_000, 0]);
  });

  it('normalises heights to the tallest bar', () => {
    const bars = toBars(
      [
        bucket({ bucket: '2026-09-01', totalExpense: 25_000 }),
        bucket({ bucket: '2026-09-02', totalExpense: 100_000 }),
      ],
      range,
      true,
    );
    expect(bars[0]?.height).toBe(0.25);
    expect(bars[1]?.height).toBe(1);
  });

  it('returns all-zero heights (no NaN) when there is no spend', () => {
    const bars = toBars([], range, true);
    expect(bars.every((bar) => bar.value === 0)).toBe(true);
    expect(bars.every((bar) => bar.height === 0)).toBe(true);
    expect(bars.every((bar) => Number.isFinite(bar.height))).toBe(true);
  });

  it('labels days with the day number and months with a short name', () => {
    const dailyBars = toBars([], range, true);
    expect(dailyBars[0]?.label).toBe('1');

    const monthlyBars = toBars(
      [],
      {
        start: new Date('2026-07-01T00:00:00+07:00'),
        end: new Date('2026-10-01T00:00:00+07:00'),
        previousStart: new Date('2026-04-01T00:00:00+07:00'),
        previousEnd: new Date('2026-07-01T00:00:00+07:00'),
      },
      false,
    );
    expect(monthlyBars.map((bar) => bar.label)).toEqual(['Jul', 'Agu', 'Sep']);
  });

  it('localises month labels in English (C6, R10)', () => {
    const monthlyBars = toBars(
      [],
      {
        start: new Date('2026-07-01T00:00:00+07:00'),
        end: new Date('2026-10-01T00:00:00+07:00'),
        previousStart: new Date('2026-04-01T00:00:00+07:00'),
        previousEnd: new Date('2026-07-01T00:00:00+07:00'),
      },
      false,
      'Asia/Jakarta',
      'en',
    );
    expect(monthlyBars.map((bar) => bar.label)).toEqual(['Jul', 'Aug', 'Sep']);
  });
});

describe('formatDelta', () => {
  it('renders positive and negative deltas with id-ID decimal comma', () => {
    expect(formatDelta(12.34)).toBe('+12,3%');
    expect(formatDelta(-4.06)).toBe('-4,1%');
  });

  it('renders a dash for null/undefined/non-finite (never NaN or Infinity)', () => {
    expect(formatDelta(null)).toBe('—');
    expect(formatDelta(undefined)).toBe('—');
    expect(formatDelta(Number.NaN)).toBe('—');
    expect(formatDelta(Number.POSITIVE_INFINITY)).toBe('—');
  });

  it('treats a near-zero delta as flat with no sign', () => {
    expect(formatDelta(0)).toBe('0,0%');
    expect(formatDelta(0.01)).toBe('0,0%');
  });

  it('uses a dot decimal in English (C6, R10)', () => {
    expect(formatDelta(12.34, 'en')).toBe('+12.3%');
    expect(formatDelta(-4.06, 'en')).toBe('-4.1%');
    expect(formatDelta(null, 'en')).toBe('—');
  });
});

describe('deltaTone', () => {
  it('maps direction to the two allowed tones (up=gold, down=grey)', () => {
    expect(deltaTone(5)).toBe('up');
    expect(deltaTone(-5)).toBe('down');
    expect(deltaTone(0)).toBe('flat');
    expect(deltaTone(null)).toBe('flat');
    expect(deltaTone(Number.NaN)).toBe('flat');
  });
});

describe('isEmptyRange', () => {
  const base: AnalyticsOverview = {
    range: { start: '2026-09-01T00:00:00Z', end: '2026-09-30T00:00:00Z' },
    totals: { expense: 0, income: 0, net: 0 },
    previous: { expense: 0, income: 0, net: 0 },
    delta: { expense: null, income: null, net: null },
    breakdown: [],
    series: [],
  };

  it('treats a null overview as empty', () => {
    expect(isEmptyRange(null)).toBe(true);
  });

  it('is empty when there are no totals, categories or buckets', () => {
    expect(isEmptyRange(base)).toBe(true);
  });

  it('is not empty as soon as any money exists', () => {
    expect(
      isEmptyRange({ ...base, totals: { expense: 1, income: 0, net: -1 } }),
    ).toBe(false);
    expect(
      isEmptyRange({ ...base, breakdown: [breakdown({})] }),
    ).toBe(false);
    expect(
      isEmptyRange({ ...base, series: [bucket({ totalExpense: 1 })] }),
    ).toBe(false);
  });
});

describe('toInsightSummary (2.1.0 deterministic insight)', () => {
  const monthlyOf = (current: number, previous: number) => ({
    current: { month: '2026-10-01', income: 0, expense: current, net: -current },
    previous: { month: '2026-09-01', income: 0, expense: previous, net: -previous },
  });
  const slicesOf = (shares: number[]) =>
    shares.map((share, i) => ({
      id: `c${i}`,
      label: `Cat${i}`,
      icon: 'restaurant',
      value: share * 1000,
      share,
    }));

  it('narrates a month-over-month rise with delta + concentration + surplus', () => {
    const summary = toInsightSummary({
      totals: { expense: 300000, income: 500000, net: 200000 },
      monthly: monthlyOf(300000, 200000),
      slices: slicesOf([0.6, 0.3]),
    });
    expect(summary.title).toBe('Ringkasan');
    expect(summary.lines).toHaveLength(3);
    expect(summary.lines[0]).toContain('naik');
    expect(summary.lines[0]).toContain('+50,0%');
    expect(summary.lines[1]).toContain('Cat0');
    expect(summary.lines[2]).toContain('sisa');
  });

  it('narrates a fall and a top-pair when no single slice dominates', () => {
    const summary = toInsightSummary({
      totals: { expense: 300000, income: 100000, net: -200000 },
      monthly: monthlyOf(150000, 300000),
      slices: slicesOf([0.3, 0.25, 0.2]),
    });
    expect(summary.lines[0]).toContain('turun');
    expect(summary.lines[1]).toContain('Cat0');
    expect(summary.lines[1]).toContain('Cat1');
    expect(summary.lines[2]).toContain('melebihi');
  });

  it('welcomes the first recorded month and skips empty months entirely', () => {
    const first = toInsightSummary({
      totals: { expense: 50000, income: 0, net: -50000 },
      monthly: monthlyOf(50000, 0),
      slices: slicesOf([0.4, 0.3]),
    });
    expect(first.lines[0]).toContain('pertama');

    const empty = toInsightSummary({
      totals: { expense: 0, income: 0, net: 0 },
      monthly: monthlyOf(0, 0),
      slices: [],
    });
    expect(empty.lines).toEqual([]);
  });

  it('renders English copy when asked', () => {
    const summary = toInsightSummary({
      totals: { expense: 100000, income: 100000, net: 0 },
      monthly: monthlyOf(100000, 100000),
      slices: slicesOf([0.9]),
      lang: 'en',
    });
    expect(summary.title).toBe('Summary');
    expect(summary.lines[0]).toContain('matches');
  });
});

describe('L2 drivers + anomalies (pure seam)', () => {
  const slice = (id: string, label: string, value: number) => ({
    id,
    label,
    icon: 'restaurant',
    value,
    share: 0,
  });
  const curr = [
    slice('makan', 'Makanan', 400000),
    slice('transport', 'Transportasi', 100000),
  ];
  const prev = [slice('makan', 'Makanan', 200000)];

  it('toDrivers: strongest absolute move first, cap 2, __other__ skipped', () => {
    const drivers = toDrivers(curr, prev);
    expect(drivers.map((d) => d.id)).toEqual(['makan', 'transport']);
    expect(drivers[0]).toMatchObject({ delta: 200000 });
    expect(drivers[1]).toMatchObject({ delta: 100000 });
    const withOther = toDrivers(
      [...curr, slice('__other__', 'Lainnya', 999999)],
      prev,
    );
    expect(withOther.find((d) => d.id === '__other__')).toBeUndefined();
    expect(toDrivers(curr, curr)).toEqual([]);
  });

  it('toAnomalies: new-from-zero + surge, floor kills noise, __other__ skipped', () => {
    const anomalies = toAnomalies(curr, prev);
    // transport 0 -> 100k = new; makan 200k -> 400k = 2x spike.
    expect(anomalies.map((a) => `${a.id}:${a.kind}`)).toEqual([
      'makan:spike',
      'transport:new',
    ]);
    // Below floor even at 10x: noise, not insight.
    expect(toAnomalies([slice('kopi', 'Kopi', 15000)], [])).toEqual([]);
    expect(
      toAnomalies(
        [...curr, slice('__other__', 'Lainnya', 500000)],
        prev,
      ).find((a) => a.id === '__other__'),
    ).toBeUndefined();
    // Below multiple, above floor: no anomaly.
    expect(
      toAnomalies([slice('makan', 'Makanan', 250000)], prev),
    ).toEqual([]);
  });

  it('toFullSlices: no top-cut, no arc filter (honest prev)', () => {
    const tiny = {
      categoryId: 'kecil',
      categoryName: 'Kecil',
      categoryIcon: 'restaurant',
      totalExpense: 100,
      transactionCount: 1,
      share: 0.001,
    };
    expect(toFullSlices([tiny])).toEqual([
      { id: 'kecil', label: 'Kecil', icon: 'restaurant', value: 100, share: 0.001 },
    ]);
  });

  it('composition: driver takes concentration slot, anomaly closes, cap 4', () => {
    const summary = toInsightSummary({
      totals: { expense: 500000, income: 600000, net: 100000 },
      monthly: {
        current: { month: '2026-10-01', income: 600000, expense: 500000, net: 100000 },
        previous: { month: '2026-09-01', income: 0, expense: 200000, net: -200000 },
      },
      slices: [
        { id: 'makan', label: 'Makanan', icon: 'restaurant', value: 400000, share: 0.8 },
      ],
      prevSlices: prev,
    });
    // mom + driver + coverage + anomaly(spike makan) = 4, no concentration.
    expect(summary.lines).toHaveLength(4);
    expect(summary.lines[1]).toContain('Makanan');
    expect(summary.lines[1]).toContain('pendorong');
    expect(summary.lines[3]).toContain('Janggal');
    expect(summary.lines[3]).toContain('Makanan');
  });

  it('without prevSlices the output is bit-identical L1', () => {
    const base = {
      totals: { expense: 300000, income: 500000, net: 200000 },
      monthly: {
        current: { month: '2026-10-01', income: 500000, expense: 300000, net: 200000 },
        previous: { month: '2026-09-01', income: 0, expense: 200000, net: -200000 },
      },
      slices: [
        { id: 'c0', label: 'Cat0', icon: 'restaurant', value: 600, share: 0.6 },
      ],
    };
    expect(toInsightSummary({ ...base, prevSlices: [] })).toEqual(
      toInsightSummary(base),
    );
    expect(toInsightSummary(base).lines).toHaveLength(3);
  });
});

describe('L3 run-rate (pure seam)', () => {
  const budgets = [
    { categoryName: 'Makanan', spent: 400000, amountLimit: 500000, state: 'warning' as const },
    { categoryName: 'Transportasi', spent: 100000, amountLimit: 500000, state: 'ok' as const },
  ];

  it('projects the worst overshoot; null when honest to stay silent', () => {
    // 400k/14d × 31d = 885.714 → overrun 385.714.
    const alert = toRunRate(budgets, '2026-10-14', '2026-10-01');
    expect(alert).toEqual({ name: 'Makanan', overrun: (400000 / 14) * 31 - 500000 });
    // Day 1: too early to pace (would invent a scare).
    expect(toRunRate(budgets, '2026-10-01', '2026-10-01')).toBeNull();
    // Stale month, non-positive limit, empty: all null.
    expect(toRunRate(budgets, '2026-11-02', '2026-10-01')).toBeNull();
    expect(
      toRunRate(
        [{ categoryName: 'X', spent: 10, amountLimit: 0, state: 'ok' }],
        '2026-10-14',
        '2026-10-01',
      ),
    ).toBeNull();
    expect(toRunRate([], '2026-10-14', '2026-10-01')).toBeNull();
    // On track: projected under limit.
    expect(
      toRunRate(
        [{ categoryName: 'Y', spent: 100000, amountLimit: 900000, state: 'ok' }],
        '2026-10-14',
        '2026-10-01',
      ),
    ).toBeNull();
    // Exceeded already alerted: skipped, never double-alarmed.
    expect(
      toRunRate(
        [{ categoryName: 'Z', spent: 600000, amountLimit: 500000, state: 'exceeded' }],
        '2026-10-14',
        '2026-10-01',
      ),
    ).toBeNull();
  });

  it('composition: run-rate closes at 5, absent without budgets', () => {
    const runRate = {
      budgets,
      todayKey: '2026-10-14',
      monthKey: '2026-10-01',
    };
    const withRate = toInsightSummary({
      totals: { expense: 500000, income: 600000, net: 100000 },
      monthly: {
        current: { month: '2026-10-01', income: 600000, expense: 500000, net: 100000 },
        previous: { month: '2026-09-01', income: 0, expense: 200000, net: -200000 },
      },
      slices: [
        { id: 'makan', label: 'Makanan', icon: 'restaurant', value: 400000, share: 0.8 },
      ],
      prevSlices: [
        { id: 'makan', label: 'Makanan', icon: 'restaurant', value: 200000, share: 0 },
      ],
      runRate,
    });
    expect(withRate.lines).toHaveLength(5);
    expect(withRate.lines[4]).toContain('Makanan');
    expect(withRate.lines[4]).toContain('jebol');

    const withoutRate = toInsightSummary({
      totals: { expense: 500000, income: 600000, net: 100000 },
      monthly: {
        current: { month: '2026-10-01', income: 600000, expense: 500000, net: 100000 },
        previous: { month: '2026-09-01', income: 0, expense: 200000, net: -200000 },
      },
      slices: [
        { id: 'makan', label: 'Makanan', icon: 'restaurant', value: 400000, share: 0.8 },
      ],
      prevSlices: [
        { id: 'makan', label: 'Makanan', icon: 'restaurant', value: 200000, share: 0 },
      ],
    });
    expect(withoutRate.lines).toHaveLength(4);
  });
});
describe('P2a chart geometry (gradient, honest round caps)', () => {
  it('runs a gradient along the arc from its start to its tip', () => {
    // Quarter arc starting at the top, sweeping clockwise to 3 o'clock.
    const vector = arcGradientVector(104, 104, 92, -90, 90);
    expect(vector.x1).toBeCloseTo(104, 5);
    expect(vector.y1).toBeCloseTo(12, 5);
    expect(vector.x2).toBeCloseTo(196, 5);
    expect(vector.y2).toBeCloseTo(104, 5);
  });

  it('insets both ends past the cap overshoot (full stroke shorter)', () => {
    // 24dp stroke on a 578dp wheel: overshoot ≈ 7.46° per end.
    const span = roundCapSpan(0, 150, 24, 2 * Math.PI * 92);
    expect(span.rotation).toBeCloseTo(7.46, 1);
    // dash = (150 − 2×7.46)/360 × C.
    expect(span.dash).toBeCloseTo(((150 - 14.92) / 360) * (2 * Math.PI * 92), 0);
  });

  it('never goes negative on tiny sweeps (a dot survives)', () => {
    const span = roundCapSpan(0, 5, 24, 578);
    expect(span.dash).toBeGreaterThan(0);
  });

  it('rounds caps only on arcs long enough to carry them', () => {
    const C = 2 * Math.PI * 92;
    // 24dp stroke needs >= ~29.9 degrees; small slices stay flat.
    expect(shouldRoundCaps(150, 24, C)).toBe(true);
    expect(shouldRoundCaps(10, 24, C)).toBe(false);
    expect(shouldRoundCaps(0, 24, C)).toBe(false);
  });
});

describe('P2b trend modes (bars + net area)', () => {
  const series = [
    { bucket: '2026-09-01', totalExpense: 100000, totalIncome: 400000, net: 300000 },
    { bucket: '2026-09-02', totalExpense: 500000, totalIncome: 100000, net: -400000 },
    { bucket: '2026-09-03', totalExpense: 0, totalIncome: 0, net: 0 },
  ];
  const range = {
    start: new Date('2026-09-01T00:00:00+07:00'),
    end: new Date('2026-09-04T00:00:00+07:00'),
    previousStart: new Date('2026-08-29T00:00:00+07:00'),
    previousEnd: new Date('2026-09-01T00:00:00+07:00'),
  };

  it('reads income buckets in income mode, expense by default', () => {
    const expense = toBars(series, range, true);
    const income = toBars(series, range, true, 'Asia/Jakarta', 'id', 'income');
    expect(expense.map((bar) => bar.value)).toEqual([100000, 500000, 0]);
    expect(income.map((bar) => bar.value)).toEqual([400000, 100000, 0]);
    expect(income[0]?.height).toBe(1);
  });

  it('keeps the sign of net points on one honest scale', () => {
    const net = toNetPoints(series, range, true);
    expect(net.points).toHaveLength(3);
    expect(net.points.map((point) => point.value)).toEqual([300000, -400000, 0]);
    // Span -400rb..300rb: zero line sits at 4/7 height, surplus above it.
    expect(net.zeroY).toBeCloseTo(4 / 7, 5);
    expect(net.points[0]?.y).toBeGreaterThan(net.zeroY);
    expect(net.points[1]?.y).toBeLessThan(net.zeroY);
    expect(net.points[0]?.x).toBe(0);
    expect(net.points[2]?.x).toBe(1);
  });

  it('flattens an all-zero window without NaN', () => {
    const net = toNetPoints([], range, true);
    expect(net.points.every((point) => Number.isFinite(point.y))).toBe(true);
    expect(Number.isFinite(net.zeroY)).toBe(true);
  });
});

describe('toSparklines (per-slice shapes, never money summed)', () => {
  const slices = [{ id: 'c1' }, { id: 'c2' }, { id: '__other__' }];
  const buckets = ['2026-09-01', '2026-09-02', '2026-09-03'];
  const rows = [
    { categoryId: 'c1', bucket: '2026-09-01', totalExpense: 100 },
    { categoryId: 'c1', bucket: '2026-09-03', totalExpense: 300 },
    { categoryId: 'c2', bucket: '2026-09-02', totalExpense: 50 },
  ];

  it('gap-fills, normalises per slice, and skips Other', () => {
    const sparks = toSparklines(rows, slices, buckets);
    expect(sparks.map((spark) => spark.id)).toEqual(['c1', 'c2']);
    expect(sparks[0]?.values).toEqual([100 / 300, 0, 1]);
    expect(sparks[1]?.values).toEqual([0, 1, 0]);
  });

  it('zero-fills a flat slice without NaN', () => {
    const sparks = toSparklines([], [{ id: 'c9' }], buckets);
    expect(sparks).toEqual([{ id: 'c9', values: [0, 0, 0] }]);
  });
});

describe('resolveCustomRange (L4c pick-any-window)', () => {
  const now = new Date(2026, 9, 14, 12, 0, 0);

  it('resolves a plain window with an exclusive end + equal previous', () => {
    const range = resolveCustomRange(
      { startKey: '2026-09-15', endKey: '2026-10-07' },
      now,
    );
    expect(range.start).toEqual(new Date(2026, 8, 15));
    // Exclusive end: midnight after the last picked day.
    expect(range.end).toEqual(new Date(2026, 9, 8));
    const span = range.end.getTime() - range.start.getTime();
    expect(range.previousEnd).toEqual(range.start);
    expect(range.previousStart.getTime()).toEqual(
      range.start.getTime() - span,
    );
  });

  it('swaps a reversed pick instead of rejecting it', () => {
    const range = resolveCustomRange(
      { startKey: '2026-10-07', endKey: '2026-09-15' },
      now,
    );
    expect(range.start).toEqual(new Date(2026, 8, 15));
    expect(range.end).toEqual(new Date(2026, 9, 8));
  });

  it('clamps a future end to today (no-future discipline)', () => {
    const range = resolveCustomRange(
      { startKey: '2026-10-10', endKey: '2026-12-31' },
      now,
    );
    expect(range.end).toEqual(new Date(2026, 9, 15));
    expect(range.start).toEqual(new Date(2026, 9, 10));
  });

  it('collapses a fully-future pick to a single today', () => {
    const range = resolveCustomRange(
      { startKey: '2026-11-01', endKey: '2026-11-30' },
      now,
    );
    expect(range.start).toEqual(new Date(2026, 9, 14));
    expect(range.end).toEqual(new Date(2026, 9, 15));
  });

  it('clamps a 3-year pick to the latest 12 months', () => {
    const range = resolveCustomRange(
      { startKey: '2023-01-01', endKey: '2026-10-07' },
      now,
    );
    // Latest-12-months mirror of the preset construction: first of Nov 2025.
    expect(range.start).toEqual(new Date(2025, 10, 1));
    expect(range.end).toEqual(new Date(2026, 9, 8));
  });

  it('rejects malformed and impossible calendar days', () => {
    expect(() =>
      resolveCustomRange({ startKey: '15-09-2026', endKey: '2026-10-07' }, now),
    ).toThrow();
    expect(() =>
      resolveCustomRange({ startKey: '2026-02-30', endKey: '2026-10-07' }, now),
    ).toThrow();
  });

  it('isAnalyticsRange accepts CUSTOM alongside the presets', () => {
    expect(isAnalyticsRange(CUSTOM_RANGE)).toBe(true);
    expect(isAnalyticsRange('1M')).toBe(true);
    expect(isAnalyticsRange('bogus')).toBe(false);
    expect(CUSTOM_MAX_MONTHS).toBe(12);
  });
});

describe('isDailyCustom + formatCustomLabel (L4c)', () => {
  const now = new Date(2026, 9, 14, 12, 0, 0);

  it('buckets short windows daily and long ones monthly', () => {
    const short = resolveCustomRange(
      { startKey: '2026-09-15', endKey: '2026-10-07' },
      now,
    );
    const long = resolveCustomRange(
      { startKey: '2026-01-01', endKey: '2026-10-07' },
      now,
    );
    expect(isDailyCustom(short)).toBe(true);
    expect(isDailyCustom(long)).toBe(false);
  });

  it('labels one year once, two years twice (id + en)', () => {
    expect(
      formatCustomLabel({ startKey: '2026-09-15', endKey: '2026-10-07' }, 'id'),
    ).toBe('15 Sep – 7 Okt 2026');
    expect(
      formatCustomLabel({ startKey: '2025-12-15', endKey: '2026-01-07' }, 'id'),
    ).toBe('15 Des 2025 – 7 Jan 2026');
    expect(
      formatCustomLabel({ startKey: '2026-09-15', endKey: '2026-10-07' }, 'en'),
    ).toBe('Sep 15 – Oct 7 2026');
  });
});

describe('bucketRange (L4a drill window)', () => {
  it('daily: one day, half-open [from, to)', () => {
    const range = bucketRange('2026-10-05', true);
    expect(range).not.toBeNull();
    expect(range!.from.getFullYear()).toBe(2026);
    expect(range!.from.getMonth()).toBe(9);
    expect(range!.from.getDate()).toBe(5);
    expect(range!.to.getDate()).toBe(6);
  });

  it('monthly: whole month, exclusive next first', () => {
    const range = bucketRange('2026-10-01', false);
    expect(range!.from.getDate()).toBe(1);
    expect(range!.from.getMonth()).toBe(9);
    expect(range!.to.getMonth()).toBe(10);
    expect(range!.to.getDate()).toBe(1);
  });

  it('daily across a month boundary rolls into the next month', () => {
    const range = bucketRange('2026-10-31', true);
    expect(range!.to.getMonth()).toBe(10);
    expect(range!.to.getDate()).toBe(1);
  });

  it('monthly December rolls into the next year', () => {
    const range = bucketRange('2026-12-01', false);
    expect(range!.to.getFullYear()).toBe(2027);
    expect(range!.to.getMonth()).toBe(0);
  });

  it('malformed keys → null (never a NaN date)', () => {
    expect(bucketRange('', true)).toBeNull();
    expect(bucketRange('nope', true)).toBeNull();
    expect(bucketRange('2026-13-01', true)).toBeNull();
    expect(bucketRange('2026-00-01', true)).toBeNull();
    expect(bucketRange('2026-10-00', false)).toBeNull();
    expect(bucketRange('2026-10-32', false)).toBeNull();
  });
});
