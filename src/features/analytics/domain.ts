/**
 * Analytics domain — pure functions only (no bridge, no network).
 *
 * This is the Jest seam for T6 (Epic D "Financial Intelligence"). The *money*
 * aggregation itself never happens here: every total, delta and share arrives
 * pre-computed from Postgres (`analytics_overview`, PRD §4.2). What lives here
 * is the presentation math that must be correct and is easy to get wrong:
 *
 *  - turning a range preset (`1M`/`3M`/`6M`/`1Y`/`ALL`) into a concrete
 *    `[start, end)` window plus the equal-length previous window for the delta;
 *  - the donut: top-8 categories, the rest folded into "Other", and dropping
 *    arcs thinner than 0.5% so the wheel does not render invisible slivers;
 *  - the bar chart: gap-filling empty days/months with a zero bucket so the
 *    axis is uniform, then normalising heights to the tallest bar;
 *  - formatting a delta `%` when the previous period was zero (the DB sends
 *    `null` — this must never render `NaN`/`Infinity`, AC #7).
 */

// ---------------------------------------------------------------------------
// Types (mirror the `analytics_overview` JSON payload)
// ---------------------------------------------------------------------------

export type MoneyTotals = {
  expense: number;
  income: number;
  net: number;
};

export type MoneyDelta = {
  expense: number | null;
  income: number | null;
  net: number | null;
};

export type CategoryBreakdown = {
  categoryId: string;
  categoryName: string;
  categoryIcon: string;
  totalExpense: number;
  transactionCount: number;
  /** 0..1 fraction of the range's total expense. */
  share: number;
};

export type SeriesBucket = {
  /** `YYYY-MM-DD` (daily) or first-of-month (monthly). */
  bucket: string;
  totalExpense: number;
  totalIncome: number;
  net: number;
};

export type AnalyticsOverview = {
  range: { start: string; end: string };
  totals: MoneyTotals;
  previous: MoneyTotals;
  delta: MoneyDelta;
  breakdown: CategoryBreakdown[];
  series: SeriesBucket[];
};

// ---------------------------------------------------------------------------
// Range presets
// ---------------------------------------------------------------------------

export const RANGE_PRESETS = ['1M', '3M', '6M', '1Y', 'ALL'] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export function isRangePreset(value: unknown): value is RangePreset {
  return (
    typeof value === 'string' &&
    (RANGE_PRESETS as readonly string[]).includes(value)
  );
}

/** Human label for the segmented control. */
export const rangeLabels: Record<RangePreset, string> = {
  '1M': '1B',
  '3M': '3B',
  '6M': '6B',
  '1Y': '1T',
  ALL: 'Semua',
};

/** Months spanned by each preset; `ALL` is unbounded. */
const PRESET_MONTHS: Record<Exclude<RangePreset, 'ALL'>, number> = {
  '1M': 1,
  '3M': 3,
  '6M': 6,
  '1Y': 12,
};

export type DateRange = {
  /** Inclusive start instant. */
  start: Date;
  /** Exclusive end instant. */
  end: Date;
  /** Equal-length window immediately before `start` (for the delta). */
  previousStart: Date;
  previousEnd: Date;
};

/**
 * Resolves a preset into `[start, end)` plus the equal-length previous window.
 *
 * `1M` is the *calendar* month-to-date — it starts at the first of the current
 * month in the device's local time (the tz the transaction dates were entered
 * in), not a rolling 30 days, so the label means what the user expects. `ALL`
 * starts at the epoch (Postgres has no rows before the user existed) and the
 * previous window is empty — the delta then comes back `null`, which the KPI
 * renders as a dash.
 *
 * `now` is injectable so the boundary math is testable without freezing the
 * clock.
 */
export function resolveRange(
  preset: RangePreset,
  now: Date = new Date(),
): DateRange {
  const end = new Date(now.getTime());

  if (preset === 'ALL') {
    const start = new Date(0);
    // A zero-length previous window is deliberate: there is nothing before the
    // beginning of time, so every delta is `null` → rendered as a dash.
    return { start, end, previousStart: new Date(0), previousEnd: new Date(0) };
  }

  const months = PRESET_MONTHS[preset];
  // `N` months ending with the current month: the first month is
  // `now - (N - 1)`, so `1M` starts at the first of *this* month (month-to-date)
  // and `3M` starts at the first of two months ago.
  const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1);
  const previousEnd = new Date(start.getTime());
  const previousStart = new Date(
    start.getFullYear(),
    start.getMonth() - months,
    1,
  );

  return { start, end, previousStart, previousEnd };
}

/**
 * Whether the bar chart should aggregate by day rather than month: ranges of
 * one month or less (PRD §2.3 Epic D — "harian (range 1M) atau bulanan
 * (range >1M)").
 */
export function isDailyRange(preset: RangePreset): boolean {
  return preset === '1M';
}

// ---------------------------------------------------------------------------
// Donut
// ---------------------------------------------------------------------------

/** The "Other" slice is real once there are more than 8 categories. */
export const DONUT_TOP_N = 8;
export const OTHER_LABEL = 'Other';
export const OTHER_ICON = 'more_horiz';

/**
 * Minimum share (as a fraction) an arc must have to be drawn: "sudut 0.5%
 * baru dirender" (PRD §2.3 Epic D). Below this the slice is dropped from the
 * wheel, but its value stays inside the "Other" bucket so the center total is
 * still complete.
 */
export const MIN_ARC_SHARE = 0.005;

export type DonutSlice = {
  /** Stable React key: category id, or `__other__`. */
  id: string;
  label: string;
  icon: string;
  value: number;
  share: number;
};

/**
 * Folds a full breakdown into the wheel's slices: the top `DONUT_TOP_N`
 * categories, plus a single "Other" slice for the tail. Slices thinner than
 * `MIN_ARC_SHARE` are filtered out of the *rendered* wheel; "Other" is kept as
 * long as its value is non-zero so the legend stays honest.
 *
 * The DB already returns the breakdown sorted by expense desc, so this only
 * splits and sums — it never re-sorts, which would make the wheel and the
 * breakdown rows disagree.
 */
export function toDonutSlices(breakdown: CategoryBreakdown[]): DonutSlice[] {
  const head = breakdown.slice(0, DONUT_TOP_N).map((item) => ({
    id: item.categoryId,
    label: item.categoryName,
    icon: item.categoryIcon,
    value: item.totalExpense,
    share: item.share,
  }));

  const tail = breakdown.slice(DONUT_TOP_N);
  if (tail.length > 0) {
    const otherValue = tail.reduce((sum, item) => sum + item.totalExpense, 0);
    const otherShare = tail.reduce((sum, item) => sum + item.share, 0);
    head.push({
      id: '__other__',
      label: OTHER_LABEL,
      icon: OTHER_ICON,
      value: otherValue,
      share: otherShare,
    });
  }

  return head.filter((slice) => slice.share >= MIN_ARC_SHARE);
}

/**
 * Cumulative `[startFraction, endFraction)` offsets for each slice, in the
 * incoming order. Used to lay the arcs out around the wheel without the
 * component having to accumulate as it renders.
 */
export function toArcOffsets(
  slices: Pick<DonutSlice, 'share'>[],
): { start: number; end: number }[] {
  const total = slices.reduce((sum, slice) => sum + slice.share, 0);
  if (total <= 0) return slices.map(() => ({ start: 0, end: 0 }));

  let cursor = 0;
  return slices.map((slice) => {
    const width = slice.share / total;
    const start = cursor;
    cursor += width;
    return { start, end: cursor };
  });
}

// ---------------------------------------------------------------------------
// Bar chart
// ---------------------------------------------------------------------------

export type BarDatum = {
  /** `YYYY-MM-DD` bucket the server returned. */
  bucket: string;
  value: number;
  /** 0..1 height fraction relative to the tallest bar. */
  height: number;
  /** Short axis label (`5` for a day, `Sep` for a month). */
  label: string;
};

/**
 * Turns the sparse server series into a dense, axis-aligned list of bars.
 *
 * The server only returns buckets that actually have transactions (cheap
 * query); the chart needs every bucket in the window so gaps read as zero
 * rather than as a compressed axis. `daily` mirrors the RPC's granularity.
 *
 * Heights are relative to the tallest bar; when every value is zero the
 * heights are all zero (no divide-by-zero, no NaN → AC #7).
 */
export function toBars(
  series: SeriesBucket[],
  range: DateRange,
  daily: boolean,
  tz: string = 'Asia/Jakarta',
): BarDatum[] {
  const buckets = enumerateBuckets(range, daily, tz);
  const byKey = new Map(series.map((item) => [item.bucket, item.totalExpense]));

  const values = buckets.map((bucket) => byKey.get(bucket) ?? 0);
  const max = values.reduce((peak, value) => (value > peak ? value : peak), 0);

  return buckets.map((bucket, index) => ({
    bucket,
    value: values[index] ?? 0,
    height: max > 0 ? (values[index] ?? 0) / max : 0,
    label: daily ? dayLabel(bucket) : monthLabel(bucket),
  }));
}

/**
 * Every bucket key between `range.start` and `range.end`, inclusive of the
 * first and last partial buckets. Days/months are computed in `tz` so the axis
 * agrees with the server's tz-aware bucketing (a WIB user's "1 Sep" is not a
 * UTC day). Uses `Intl` with the given timezone rather than manual offsets.
 */
export function enumerateBuckets(
  range: DateRange,
  daily: boolean,
  tz: string = 'Asia/Jakarta',
): string[] {
  const keys: string[] = [];
  if (daily) {
    const cursor = startOfDayInTz(range.start, tz);
    const last = startOfDayInTz(new Date(range.end.getTime() - 1), tz);
    while (cursor.getTime() <= last.getTime()) {
      keys.push(formatDateKey(cursor, tz));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return keys;
  }

  const cursor = startOfMonthInTz(range.start, tz);
  const last = startOfMonthInTz(new Date(range.end.getTime() - 1), tz);
  while (cursor.getTime() <= last.getTime()) {
    keys.push(formatDateKey(cursor, tz));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return keys;
}

/** `YYYY-MM-DD` of an instant as seen in `tz`. */
export function formatDateKey(date: Date, tz: string = 'Asia/Jakarta'): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? '01';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** UTC midnight of the tz-local day `date` falls in — a stable iteration key. */
function startOfDayInTz(date: Date, tz: string): Date {
  const [year, month, day] = formatDateKey(date, tz).split('-').map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, day));
}

/** UTC midnight of the first of the tz-local month `date` falls in. */
function startOfMonthInTz(date: Date, tz: string): Date {
  const [year, month] = formatDateKey(date, tz).split('-').map(Number);
  return new Date(Date.UTC(year, (month ?? 1) - 1, 1));
}

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'Mei',
  'Jun',
  'Jul',
  'Agu',
  'Sep',
  'Okt',
  'Nov',
  'Des',
];

function dayLabel(bucket: string): string {
  return String(Number(bucket.slice(8, 10)));
}

function monthLabel(bucket: string): string {
  return MONTH_SHORT[Number(bucket.slice(5, 7)) - 1] ?? '';
}

// ---------------------------------------------------------------------------
// Delta formatting
// ---------------------------------------------------------------------------

/**
 * The KPI delta string: `+12,3%` / `-4,1%` (id-ID decimal comma), or an em
 * dash when the previous period had no data (the API sends `null`). Never
 * returns `NaN`/`Infinity`/`undefined` (AC #7).
 */
export function formatDelta(delta: number | null | undefined): string {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) {
    return '—';
  }

  const rounded = Math.abs(delta) < 0.05 ? 0 : delta;
  const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : '';
  const magnitude = Math.abs(rounded).toFixed(1).replace('.', ',');
  return `${sign}${magnitude}%`;
}

export type DeltaTone = 'up' | 'down' | 'flat';

/**
 * Delta direction. "Up" renders gold and "down" muted grey — **never red**
 * (DESIGN.md §1: there are no error reds in charts). A flat/`null` delta is
 * `flat`.
 */
export function deltaTone(delta: number | null | undefined): DeltaTone {
  if (delta === null || delta === undefined || !Number.isFinite(delta)) {
    return 'flat';
  }
  if (delta > 0) return 'up';
  if (delta < 0) return 'down';
  return 'flat';
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

/** `true` means "render the empty state" rather than the charts (AC #7). */
export function isEmptyRange(overview: AnalyticsOverview | null): boolean {
  if (!overview) return true;
  return (
    overview.totals.expense === 0 &&
    overview.totals.income === 0 &&
    overview.breakdown.length === 0 &&
    overview.series.length === 0
  );
}

// ---------------------------------------------------------------------------
// Distance to previous month (for the "no data yet" copy) — kept tiny
// ---------------------------------------------------------------------------

/** Number of ring segments the donut renders; the angle→slice map is pure. */
export const DONUT_SEGMENTS = 60;

/** Index of the slice that owns the angular sector at `turn` (0..1). */
export function sliceIndexAtTurn(
  slices: Pick<DonutSlice, 'share'>[],
  turn: number,
): number {
  const total = slices.reduce((sum, slice) => sum + slice.share, 0);
  if (total <= 0 || slices.length === 0) return -1;

  let cursor = 0;
  for (let index = 0; index < slices.length; index += 1) {
    const share = (slices[index]?.share ?? 0) / total;
    if (turn < cursor + share || index === slices.length - 1) {
      return index;
    }
    cursor += share;
  }
  return slices.length - 1;
}

/**
 * For each of `DONUT_SEGMENTS` evenly-spaced turns, the slice index that owns
 * it (or -1 when the wheel is empty). The component renders one tick per
 * entry; keeping this pure means the wheel's geometry is unit-tested rather
 * than eyeballed on a device.
 */
export function donutSegmentSliceIndices(
  slices: Pick<DonutSlice, 'share'>[],
  segments: number = DONUT_SEGMENTS,
): number[] {
  return Array.from({ length: segments }, (_, index) =>
    sliceIndexAtTurn(slices, (index + 0.5) / segments),
  );
}

// ---------------------------------------------------------------------------
// Monthly summary (A6 — "ringkasan bulan lalu" on the Dashboard)
// ---------------------------------------------------------------------------

/**
 * One month of server-aggregated totals, as read from `v_monthly_summary`.
 * `month` is the first-of-month key (`YYYY-MM-01`) in the user's timezone —
 * the same grain the view groups by, so the client never re-derives a month
 * boundary (PRD §4.2).
 */
export type MonthlyTotals = {
  month: string;
  income: number;
  expense: number;
  net: number;
};

/** Current calendar month next to the one before it (both server rows). */
export type MonthlyComparison = {
  current: MonthlyTotals;
  previous: MonthlyTotals;
};

const ZERO_MONTH = (month: string): MonthlyTotals => ({
  month,
  income: 0,
  expense: 0,
  net: 0,
});

/**
 * First-of-month key (`YYYY-MM-01`) of the month `now` falls in, as seen in
 * `tz`. Reuses `formatDateKey` so the WIB/UTC boundary behaves exactly like
 * the server's `month` column (a 1 Okt 00:30 WIB transaction belongs to
 * October, not September).
 */
export function monthKeyInTz(now: Date = new Date(), tz: string = 'Asia/Jakarta'): string {
  return `${formatDateKey(now, tz).slice(0, 7)}-01`;
}

/** First-of-month key of the month immediately before `monthKey`. */
export function prevMonthKey(monthKey: string): string {
  const year = Number(monthKey.slice(0, 4));
  const month = Number(monthKey.slice(5, 7));
  if (month <= 1) return `${year - 1}-12-01`;
  return `${year}-${String(month - 1).padStart(2, '0')}-01`;
}

/** `September 2026` — the card title for a month key (id-ID). */
export function formatMonthTitle(monthKey: string): string {
  const date = new Date(`${monthKey}T00:00:00`);
  const formatted = date.toLocaleDateString('id-ID', {
    month: 'long',
    year: 'numeric',
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

/**
 * Folds `v_monthly_summary` rows into the current/previous pair. A month with
 * no row means "no transactions that month", so it zero-fills — the card
 * renders zeros with an invitation, never a hole.
 */
export function toMonthlyComparison(
  rows: { month: string; income: number; expense: number; net: number }[],
  currKey: string,
  prevKey: string,
): MonthlyComparison {
  const byMonth = new Map(rows.map((row) => [row.month, row]));
  const current = byMonth.get(currKey) ?? ZERO_MONTH(currKey);
  const previous = byMonth.get(prevKey) ?? ZERO_MONTH(prevKey);
  return {
    current: { ...current, month: currKey },
    previous: { ...previous, month: prevKey },
  };
}

/**
 * Month-over-month delta in percent: `(current - previous) / |previous| * 100`,
 * or `null` when the previous month was zero (the KPI renders `—`). The
 * absolute denominator mirrors the server's net-delta formula in
 * `analytics_overview`; for income/expense the previous total is never
 * negative, so this agrees with the plain formula there too. Never returns
 * `NaN`/`Infinity` — like `formatDelta`, this is presentation math over server
 * aggregates, not aggregation itself (cf. `toBars` heights).
 */
export function monthlyDelta(current: number, previous: number): number | null {
  if (previous === 0) return null;
  const value = ((current - previous) / Math.abs(previous)) * 100;
  return Number.isFinite(value) ? value : null;
}

/** `true` when neither month has any movement — the card shows the invite. */
export function isEmptyMonthly(comparison: MonthlyComparison | null): boolean {
  if (!comparison) return true;
  const { current, previous } = comparison;
  return (
    current.income === 0 &&
    current.expense === 0 &&
    previous.income === 0 &&
    previous.expense === 0
  );
}
