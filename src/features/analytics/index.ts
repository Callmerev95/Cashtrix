export { AnalyticsProvider, useAnalytics } from './analytics-context';
export {
  fetchCategorySeries,
  fetchMonthlySummary,
  fetchOverview,
  fetchTimezone,
  listWalletFilters,
} from './api';
export type { CategorySparkRow, FetchOverviewInput, FetchSeriesInput } from './api';
export {
  DONUT_SEGMENTS,
  DONUT_TOP_N,
  MIN_ARC_SHARE,
  OTHER_ICON,
  OTHER_LABEL,
  RANGE_PRESETS,
  TREND_MODES,
  arcGradientVector,
  roundCapSpan,
  shouldRoundCaps,
  deltaTone,
  donutSegmentSliceIndices,
  enumerateBuckets,
  formatDateKey,
  formatDelta,
  formatMonthTitle,
  isDailyRange,
  isEmptyMonthly,
  isEmptyRange,
  isRangePreset,
  monthKeyInTz,
  monthlyDelta,
  prevMonthKey,
  rangeLabel,
  rangeLabels,
  resolveRange,
  sliceIndexAtTurn,
  toArcOffsets,
  toBars,
  toDonutSlices,
  toInsightSummary,
  toMonthlyComparison,
  toNetPoints,
  toSparklines,
} from './domain';
export type {
  AnalyticsOverview,
  ArcGradientVector,
  BarDatum,
  CategoryBreakdown,
  DateRange,
  DeltaTone,
  DonutSlice,
  InsightInput,
  InsightSummary,
  MoneyDelta,
  MoneyTotals,
  MonthlyComparison,
  MonthlyTotals,
  NetPoint,
  NetSeries,
  RangePreset,
  SeriesBucket,
  Sparkline,
  TrendMode,
} from './domain';
export { DonutChart } from './components/donut-chart';
export { BarChart } from './components/bar-chart';
export { ChartTooltip } from './components/chart-tooltip';
export { NetAreaChart } from './components/net-area-chart';
export { InsightCard } from './components/insight-card';
export { KpiHeader } from './components/kpi-header';
export { MonthlySummaryCard } from './components/monthly-summary-card';
export { BreakdownList } from './components/breakdown-list';
export { AnalyticsEmptyState } from './components/empty-state';
export {
  RangeSegmentedControl,
  WalletFilterChips,
} from './components/range-segmented-control';
