/**
 * Analytics domain tests — the Jest seam for ticket #7 (Epic D "Financial
 * Intelligence"). Everything here is pure: range windows, donut folding/arc
 * filtering, bar gap-filling/heights, and delta formatting (the `null` →
 * dash rule that keeps `NaN`/`Infinity` off the screen).
 */
import {
  DONUT_TOP_N,
  MIN_ARC_SHARE,
  OTHER_LABEL,
  RANGE_PRESETS,
  deltaTone,
  donutSegmentSliceIndices,
  enumerateBuckets,
  formatDateKey,
  formatDelta,
  isDailyRange,
  isEmptyRange,
  isRangePreset,
  rangeLabels,
  resolveRange,
  sliceIndexAtTurn,
  toArcOffsets,
  toBars,
  toDonutSlices,
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
