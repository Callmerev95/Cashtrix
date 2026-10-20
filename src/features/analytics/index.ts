export { AnalyticsProvider, useAnalytics } from './analytics-context';
export {
  fetchCategorySeries,
  fetchMonthlySummary,
  fetchOverview,
  fetchTimezone,
  fetchWalletCompare,
  listWalletFilters,
} from './api';
export type {
  CategorySparkRow,
  FetchOverviewInput,
  FetchSeriesInput,
  FetchWalletCompareInput,
} from './api';
export {
  ANOMALY_FLOOR,
  ANOMALY_MULTIPLE,
  CUSTOM_MAX_MONTHS,
  CUSTOM_RANGE,
  COMPARE_MAX_WALLETS,
  COMPARE_MIN_WALLETS,
  DONUT_SEGMENTS,
  DONUT_TOP_N,
  INSIGHT_TOP_DRIVERS,
  MIN_ARC_SHARE,
  OTHER_ICON,
  OTHER_LABEL,
  RANGE_PRESETS,
  TREND_MODES,
  arcGradientVector,
  roundCapSpan,
  shouldRoundCaps,
  bucketRange,
  defaultCompareSelection,
  deltaTone,
  donutSegmentSliceIndices,
  enumerateBuckets,
  formatCustomLabel,
  formatDateKey,
  formatDelta,
  formatMonthTitle,
  formatShare,
  isAnalyticsRange,
  isDailyCustom,
  isDailyRange,
  isEmptyCompareMode,
  isEmptyMonthly,
  isEmptyRange,
  isRangePreset,
  monthKeyInTz,
  monthlyDelta,
  prevMonthKey,
  rangeLabel,
  rangeLabels,
  resolveCustomRange,
  resolveRange,
  sliceIndexAtTurn,
  sortCompareRows,
  toArcOffsets,
  toAnomalies,
  toBars,
  toCategoryDeltas,
  toDonutSlices,
  toDrivers,
  toFullSlices,
  toInsightSummary,
  toRunRate,
  toMonthlyComparison,
  toNetPoints,
  toSparklines,
  toWalletSparklines,
  toggleCompareWallet,
} from './domain';
export type {
  AnalyticsOverview,
  AnalyticsRange,
  AnomalyKind,
  ArcGradientVector,
  BarDatum,
  CategoryAnomaly,
  CategoryBreakdown,
  CategoryDelta,
  CustomRange,
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
  RunRateAlert,
  RunRateBudget,
  SeriesBucket,
  Sparkline,
  TrendMode,
  WalletCompareBucket,
  WalletCompareMode,
  WalletCompareRow,
} from './domain';
export { DonutChart } from './components/donut-chart';
export { BarChart } from './components/bar-chart';
export { ChartTooltip } from './components/chart-tooltip';
export { NetAreaChart } from './components/net-area-chart';
export { InsightCard } from './components/insight-card';
export type { InsightAiState } from './components/insight-card';
export {
  hasInsightConsent,
  INSIGHT_CONSENT_KEY,
  requestInsight,
  setInsightConsent,
  shouldAutoRefine,
} from './insight';
export type { InsightAiOutcome, InsightLang } from './insight';
export {
  getInsightConsentSnapshot,
  setInsightConsented,
  subscribeInsightConsent,
} from './insight-consent';
export {
  getCachedInsightAi,
  resetInsightAiCacheForTests,
  setCachedInsightAi,
} from './insight-cache';
export { KpiHeader } from './components/kpi-header';
export { CustomRangeSheet } from './components/custom-range-sheet';
export { MonthlySummaryCard } from './components/monthly-summary-card';
export { BreakdownList } from './components/breakdown-list';
export { WalletCompareCard } from './components/wallet-compare-card';
export { AnalyticsEmptyState } from './components/empty-state';
export {
  RangeSegmentedControl,
  WalletFilterChips,
} from './components/range-segmented-control';
