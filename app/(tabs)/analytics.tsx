/**
 * Analytics — "Financial Intelligence" (T6, issue #7).
 *
 * The screen is a thin renderer over `useAnalytics()`: it picks a range and an
 * optional wallet, then draws the KPI header, the donut, the bar chart and the
 * breakdown rows. It never computes money — every figure is a field of the
 * `analytics_overview` payload (PRD §4.2).
 *
 * A range with no transactions renders `AnalyticsEmptyState` instead of charts
 * (AC #7), so a new account never sees a NaN/Infinity axis.
 */
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

import { LinearGradient } from 'expo-linear-gradient';

import {
  AnalyticsEmptyState,
  BarChart,
  BreakdownList,
  CustomRangeSheet,
  DonutChart,
  InsightCard,
  KpiHeader,
  NetAreaChart,
  RangeSegmentedControl,
  WalletFilterChips,
  WalletCompareCard,
  CUSTOM_RANGE,
  bucketRange,
  defaultCompareSelection,
  enumerateBuckets,
  formatCustomLabel,
  formatDateKey,
  getCachedInsightAi,
  getInsightConsentSnapshot,
  isDailyCustom,
  isDailyRange,
  rangeLabel,
  requestInsight,
  resolveCustomRange,
  resolveRange,
  setCachedInsightAi,
  setInsightConsented,
  shouldAutoRefine,
  sortCompareRows,
  subscribeInsightConsent,
  toBars,
  toDonutSlices,
  toFullSlices,
  toInsightSummary,
  toRunRate,
  toNetPoints,
  toSparklines,
  toWalletSparklines,
  toggleCompareWallet,
  useAnalytics,
  type CustomRange,
  type InsightAiState,
  type TrendMode,
  type WalletCompareMode,
  type WalletCompareRow,
} from '@/features/analytics';
import { drillParams, type TransactionKindFilter } from '@/features/transactions';
import { insightAiEvent, trackEvent } from '@/features/observability';
import { Screen, AppHeader, ErrorStateCard, Skeleton, SkeletonBlock } from '@/components';
import { pressedFeedback } from '@/components/pressed';
import { PullGesture, PullHeader, usePullRefresh } from '@/components/pull-refresh';
import { useBudgets } from '@/features/budgets';
import { useProfile } from '@/features/profile';
import { dictionaryFor, fill, useLanguage } from '@/i18n';
import { colors, gradients, layout, radius, spacing, typography } from '@/theme';

export default function AnalyticsScreen() {
  const {
    range,
    setRange,
    customRange,
    setCustomRange,
    wallets,
    walletId,
    setWalletId,
    overview,
    loading,
    error,
    isEmpty,
    monthly,
    compare,
    compareLoading,
    compareError,
    sparks,
    refresh,
  } = useAnalytics();
  const { avatarSignedUrl, profile } = useProfile();
  const { unreadCount, budgets, month: budgetMonth } = useBudgets();
  const insets = useSafeAreaInsets();
  // C6: section copy + bar labels follow the OS language (ADR-0008, R10).
  const language = useLanguage();
  const t = dictionaryFor(language);
  const { refreshing, onRefresh } = usePullRefresh(refresh);
  // Timezone follows the profile (not a hardcoded default) so client
  // gap-filling agrees with the server's tz-aware bucketing.
  const tz = profile?.timezone ?? 'Asia/Jakarta';

  // 2.1.0 PR2: shared tap-selection (donut ↔ breakdown rows, bars stand
  // alone). Reset on filter change via render-adjust (V5 calendar pattern —
  // never setState synchronously in an effect).
  const customKey =
    range === CUSTOM_RANGE && customRange
      ? `${customRange.startKey}|${customRange.endKey}`
      : '';
  const filterKey = `${range}:${customKey}:${walletId ?? 'all'}`;
  const [filterKeySeen, setFilterKeySeen] = useState(filterKey);
  const [selectedSliceId, setSelectedSliceId] = useState<string | null>(null);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  // L4c: the custom-range sheet (controlled here so the control stays dumb).
  const [customOpen, setCustomOpen] = useState(false);
  // P2b: one trend card, three metrics (default Expense = previous pixels).
  const [trendMode, setTrendMode] = useState<TrendMode>('expense');
  // L4b: compare selection + metric live on the screen (like `trendMode`).
  // `null` = untouched → derived top-2 spenders from the payload order.
  const [compareMode, setCompareMode] = useState<WalletCompareMode>('expense');
  const [compareIds, setCompareIds] = useState<string[] | null>(null);
  if (filterKeySeen !== filterKey) {
    setFilterKeySeen(filterKey);
    setSelectedSliceId(null);
    setSelectedBucket(null);
  }
  // L4c: presets resolve as before; CUSTOM resolves through its own pure
  // function. A CUSTOM range without a picked window cannot happen via the
  // UI (the context guard rejects it), but the fallback keeps the types
  // honest: the trailing 30 days, ending today.
  const customForWindow: CustomRange =
    customRange ??
    (() => {
      const now = new Date();
      const from = new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate() - 29,
      );
      return {
        startKey: formatDateKey(from, tz),
        endKey: formatDateKey(now, tz),
      };
    })();
  const window =
    range === CUSTOM_RANGE
      ? resolveCustomRange(customForWindow)
      : resolveRange(range);
  const daily =
    range === CUSTOM_RANGE ? isDailyCustom(window) : isDailyRange(range);
  const slices = overview
    ? toDonutSlices(overview.breakdown, t.analytics.other)
    : [];
  const bars = overview
    ? toBars(
        overview.series,
        window,
        daily,
        tz,
        language,
        trendMode === 'net' ? 'expense' : trendMode,
      )
    : [];
  // Sparkline axis: identical inputs to the series RPC (same buckets).
  const sparkBuckets = enumerateBuckets(window, daily, tz);
  const sparkLines = toSparklines(sparks, slices, sparkBuckets);
  // L4b: selected rows sorted by the active metric; sparklines align with the
  // rows so each wallet is scaled to its own peak (never cross-wallet).
  const compareSelected =
    compareIds === null ? defaultCompareSelection(compare) : compareIds;
  const compareRows = sortCompareRows(
    compareSelected
      .map((id) => compare.find((row) => row.walletId === id))
      .filter((row): row is WalletCompareRow => row !== undefined),
    compareMode,
  );
  const compareSparks = toWalletSparklines(
    compare,
    compareRows.map((row) => row.walletId),
    sparkBuckets,
    compareMode,
  );
  // A single-wallet filter contradicts the card's job; below two wallets
  // there is nothing to rank. Loading/error stay visible so retry is reachable.
  const showCompare =
    walletId === null &&
    (compare.length >= 2 || compareLoading || compareError !== null);
  const net =
    overview && trendMode === 'net'
      ? toNetPoints(overview.series, window, daily, tz, language)
      : null;
  const insightRunRateInput = {
    budgets,
    todayKey: formatDateKey(new Date(), tz),
    monthKey: budgetMonth ?? '',
  };
  const insight =
    overview && monthly
      ? toInsightSummary({
          totals: overview.totals,
          monthly,
          slices,
          // L2, defensif: payload lama tanpa kunci ini -> [] -> baris L1,
          // bit-identik (kontrak anti-regresi).
          prevSlices: toFullSlices(overview.prevBreakdown ?? []),
          // L3: run-rate dari baris budget bulan berjalan (agregat
          // server) + hari-ini di tz user. Absen = output pra-L3.
          runRate: insightRunRateInput,
          lang: language,
        })
      : null;
  // Kartu bisa di-tap hanya bila membawa baris run-rate (affordance
  // eksplisit di kartu — tap tanpa tujuan adalah jebakan).
  const insightHasRunRate = Boolean(
    toRunRate(
      insightRunRateInput.budgets,
      insightRunRateInput.todayKey,
      insightRunRateInput.monthKey,
    ),
  );

  // L4a: drill-down into `/search`. Every surface is scoped to an instant
  // window, so the results are exactly the rows behind the tapped element:
  // a KPI = the whole range, a donut slice = one category, a bar = one bucket.
  const windowLabel =
    range === CUSTOM_RANGE
      ? formatCustomLabel(customForWindow, language)
      : rangeLabel(range, language);
  const selectedSlice =
    slices.find((slice) => slice.id === selectedSliceId) ?? null;
  const selectedBar =
    bars.find((bar) => bar.bucket === selectedBucket) ?? null;
  const walletName =
    walletId !== null
      ? wallets.find((wallet) => wallet.id === walletId)?.name ?? null
      : null;

  function drillToSearch(input: {
    kind: TransactionKindFilter;
    from: Date;
    to: Date;
    categoryId?: string | null;
    /** L4b compare rows drill into their own wallet, not the active filter. */
    walletId?: string;
    base: string;
  }) {
    const label = [input.base, walletName].filter(Boolean).join(' · ');
    router.push({
      pathname: '/search',
      params: drillParams({
        kind: input.kind,
        from: input.from.toISOString(),
        to: input.to.toISOString(),
        categoryId: input.categoryId ?? null,
        walletId: input.walletId ?? walletId,
        label,
      }),
    });
  }

  // The donut/breakdown are expense-only, so a slice drills expense rows. The
  // `__other__` tail is an aggregate — it cannot be named honestly, so it has
  // no drill (mirrors `toAnomalies` skipping it).
  function drillSlice() {
    if (!selectedSlice || selectedSlice.id === '__other__') return;
    drillToSearch({
      kind: 'expense',
      from: window.start,
      to: window.end,
      categoryId: selectedSlice.id,
      base: `${selectedSlice.label} · ${windowLabel}`,
    });
  }

  function drillBucket() {
    if (!selectedBucket || trendMode === 'net') return;
    const sub = bucketRange(selectedBucket, daily);
    if (!sub) return;
    drillToSearch({
      kind: trendMode,
      from: sub.from,
      to: sub.to,
      base: `${selectedBar?.label ?? selectedBucket} · ${windowLabel}`,
    });
  }

  // Net taps span every kind (net includes transfers), matching the KPI figure.
  function drillKpi(tone: 'expense' | 'income' | 'net') {
    drillToSearch({
      kind: tone === 'net' ? 'all' : tone,
      from: window.start,
      to: window.end,
      base: `${t.analytics.kpi[tone]} · ${windowLabel}`,
    });
  }

  // L4b: chips add/remove; the first tap materialises the derived default so
  // toggling off one of the top-2 never snaps back to the default selection.
  function toggleCompare(walletIdToToggle: string) {
    setCompareIds((previous) =>
      toggleCompareWallet(
        previous ?? defaultCompareSelection(compare),
        walletIdToToggle,
      ),
    );
  }

  function drillCompareRow(row: WalletCompareRow) {
    drillToSearch({
      kind: compareMode,
      from: window.start,
      to: window.end,
      walletId: row.walletId,
      base: `${row.name} · ${windowLabel}`,
    });
  }

  // L1: AI rephrase rides on top of the deterministic lines (never instead
  // of them). Stale AI clears via render-adjust when the input changes —
  // same pattern as the filter reset above, never setState in an effect.
  // L1 auto: consented users get ONE background fetch per distinct numbers
  // (session cache makes re-opens free); revoke clears immediately.
  const consented = useSyncExternalStore(
    subscribeInsightConsent,
    getInsightConsentSnapshot,
  );
  const [aiLines, setAiLines] = useState<string[] | null>(null);
  const [aiState, setAiState] = useState<InsightAiState>('idle');
  const [refineLines, setRefineLines] = useState<string[] | null>(null);
  const insightKey = insight ? insight.lines.join('\n') : '';
  const [insightKeySeen, setInsightKeySeen] = useState(insightKey);
  if (insightKeySeen !== insightKey) {
    setInsightKeySeen(insightKey);
    const hit = insight ? getCachedInsightAi(insightKey) : null;
    setAiLines(hit);
    setAiState(hit ? 'ai' : 'idle');
    setRefineLines(insight ? insight.lines : null);
  }
  if (!consented && (aiLines !== null || aiState !== 'idle')) {
    setAiLines(null);
    setAiState('idle');
  }

  const fetchGuard = useRef(false);
  // Fix loop-gagal (Okt 2026): auto-effect menembak lagi tiap state
  // kembali idle — kegagalan persisten = quota-burner diam-diam. Auto
  // hanya sekali per angka; retry manual (tombol) selalu boleh.
  const attempted = useRef(new Set<string>());
  const runRefine = useCallback(async () => {
    if (!refineLines || refineLines.length === 0 || aiState === 'loading') {
      return;
    }
    if (fetchGuard.current) return;
    fetchGuard.current = true;
    setAiState('loading');
    try {
      const outcome = await requestInsight({
        lines: refineLines,
        lang: language,
      });
      if (outcome.status === 'ok') {
        setCachedInsightAi(insightKeySeen, outcome.lines);
        setAiLines(outcome.lines);
        setAiState('ai');
        trackEvent(insightAiEvent({ ok: true }));
      } else if (outcome.status === 'rate_limited') {
        setAiState('rate_limited');
        trackEvent(insightAiEvent({ ok: false }));
      } else if (outcome.status === 'quota_exceeded') {
        setAiState('quota_exceeded');
        trackEvent(insightAiEvent({ ok: false }));
      } else {
        // empty/offline: stay deterministic silently (fail-open, pola AI4).
        setAiState('idle');
      }
    } finally {
      fetchGuard.current = false;
    }
  }, [refineLines, aiState, language, insightKeySeen]);

  useEffect(() => {
    if (
      !shouldAutoRefine({
        consented,
        aiState,
        hasLines: (refineLines?.length ?? 0) > 0,
      })
    ) {
      return;
    }
    if (attempted.current.has(insightKeySeen)) return;
    attempted.current.add(insightKeySeen);
    void runRefine();
  }, [consented, aiState, refineLines, runRefine, insightKeySeen]);

  async function onRefinePress() {
    if (aiState === 'loading') return;
    if (consented) {
      await runRefine();
      return;
    }
    const ti = t.analytics.insight;
    Alert.alert(ti.consentTitle, ti.consentBody, [
      { text: t.common.cancel, style: 'cancel' },
      {
        text: ti.consentSend,
        onPress: () => {
          void (async () => {
            await setInsightConsented(true);
            await runRefine();
          })();
        },
      },
    ]);
  }

  return (
    <Screen
      style={[styles.frame, { paddingTop: insets.top + spacing.xl }]}
      testID="analytics-screen"
    >
      <AppHeader
        avatarUri={avatarSignedUrl}
        bell={{
          unread: unreadCount > 0,
          accessibilityLabel:
            unreadCount > 0
              ? fill(t.dashboard.notif.unread, { count: unreadCount })
              : t.dashboard.notif.open,
          onPress: () => router.push('/notifications'),
        }}
      />
      <View style={styles.header}>
        <Text style={[typography.labelUppercase, styles.kicker]}>{t.analytics.screen.kicker}</Text>
        <Text style={[typography.headlineLg, styles.title]}>
          {t.analytics.screen.title}
        </Text>
      </View>

      <RangeSegmentedControl
        value={range}
        onChange={setRange}
        onCustomPress={() => setCustomOpen(true)}
      />
      {range === CUSTOM_RANGE && customRange ? (
        <Pressable
          testID="analytics-custom-label"
          accessibilityRole="button"
          accessibilityLabel={formatCustomLabel(customRange, language)}
          onPress={() => setCustomOpen(true)}
          style={({ pressed }) => [pressed && pressedFeedback]}
        >
          <Text style={[typography.bodySm, styles.customLabel]}>
            {formatCustomLabel(customRange, language)}
          </Text>
        </Pressable>
      ) : null}
      {/* Remount-on-open (Oct 2026 black-scrim bug): `return null` inside
          the sheet is NOT an unmount — hook state (dragY/closing/picks)
          survives and reopens stuck off-screen. Conditional render makes
          every open a true fresh mount. */}
      {customOpen ? (
        <CustomRangeSheet
          open={customOpen}
          initial={customRange}
          onClose={() => setCustomOpen(false)}
          onApply={(next) => {
            setCustomRange(next);
            setCustomOpen(false);
          }}
        />
      ) : null}

      <WalletFilterChips
        wallets={wallets}
        value={walletId}
        onChange={setWalletId}
      />

      <PullGesture refreshing={refreshing} onRefresh={onRefresh}>
      <ScrollView
        testID="analytics-scroll"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <PullHeader gap={spacing.md} testID="analytics-pull-header" />
        {loading && !overview ? (
          <Skeleton testID="analytics-loading" style={styles.skeleton}>
            <View style={styles.skeletonKpiRow}>
              <SkeletonBlock width="30%" height={32} />
              <SkeletonBlock width="30%" height={32} />
              <SkeletonBlock width="30%" height={32} />
            </View>
            <View style={styles.card}>
              <SkeletonBlock width="40%" height={12} />
              <SkeletonBlock
                width={140}
                height={140}
                borderRadius={radius.full}
                style={styles.skeletonDonut}
              />
            </View>
            <View style={styles.card}>
              <SkeletonBlock width="40%" height={12} />
              <SkeletonBlock width="100%" height={120} />
            </View>
          </Skeleton>
        ) : error ? (
          <ErrorStateCard
            testID="analytics-error"
            message={error}
            onRetry={() => void refresh()}
          />
        ) : isEmpty || !overview ? (
          <AnalyticsEmptyState />
        ) : (
          <>
            <KpiHeader
              totals={overview.totals}
              delta={overview.delta}
              onSelect={drillKpi}
            />

            {insight && insight.lines.length > 0 ? (
              <InsightCard
                summary={insight}
                aiLines={aiLines}
                aiState={aiState}
                refineLabel={t.analytics.insight.refine}
                refiningLabel={t.analytics.insight.refining}
                aiBadge={t.analytics.insight.aiBadge}
                rateLimitedNote={t.analytics.insight.rateLimited}
                quotaNote={t.analytics.insight.quotaExceeded}
                retryLabel={t.analytics.insight.retry}
                onRefine={() => void onRefinePress()}
                onRetry={() => void runRefine()}
                openBudgetsLabel={t.analytics.insight.viewBudgets}
                onOpenBudgets={
                  insightHasRunRate
                    ? () => router.push('/(tabs)/budgets')
                    : undefined
                }
              />
            ) : null}

            <LinearGradient
              colors={[...gradients.cardFill]}
              style={styles.card}
            >
              <Text style={[typography.labelUppercase, styles.cardKicker]}>
                {t.analytics.section.distribution}
              </Text>
              <DonutChart
                slices={slices}
                total={overview.totals.expense}
                selectedId={selectedSliceId}
                onSelect={setSelectedSliceId}
              />
              <View style={styles.legendDivider} />
              <BreakdownList
                key={filterKey}
                slices={slices}
                sparks={sparkLines}
                selectedId={selectedSliceId}
                onSelect={setSelectedSliceId}
              />
              {selectedSlice && selectedSlice.id !== '__other__' ? (
                <Pressable
                  testID="analytics-drill-slice"
                  accessibilityRole="button"
                  accessibilityLabel={t.analytics.viewTransactions}
                  onPress={drillSlice}
                  style={({ pressed }) => [
                    styles.drill,
                    pressed && pressedFeedback,
                  ]}
                >
                  <Text
                    style={[typography.labelUppercase, styles.drillText]}
                  >
                    {t.analytics.viewTransactions}
                  </Text>
                  <MaterialIcons
                    name="chevron-right"
                    size={18}
                    color={colors.accent}
                  />
                </Pressable>
              ) : null}
            </LinearGradient>

            <LinearGradient
              colors={[...gradients.cardFill]}
              style={styles.card}
            >
              <Text style={[typography.labelUppercase, styles.cardKicker]}>
                {daily
                  ? t.analytics.section.trendDaily
                  : t.analytics.section.trendMonthly}
              </Text>
              <View
                style={styles.trendToggle}
                accessibilityRole="radiogroup"
              >
                {(['expense', 'income', 'net'] as const).map((mode) => {
                  const active = trendMode === mode;
                  return (
                    <Pressable
                      key={mode}
                      testID={`analytics-trend-mode-${mode}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={t.analytics.kpi[mode]}
                      onPress={() => {
                        setTrendMode(mode);
                        setSelectedBucket(null);
                      }}
                      style={[styles.trendOption, active && styles.trendActive]}
                    >
                      <Text
                        style={[
                          typography.bodySm,
                          styles.trendLabel,
                          active && styles.trendLabelActive,
                        ]}
                      >
                        {t.analytics.kpi[mode]}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {trendMode === 'net' && net != null ? (
                <NetAreaChart points={net.points} zeroY={net.zeroY} />
              ) : (
                <BarChart
                  bars={bars}
                  mode={trendMode === 'net' ? 'expense' : trendMode}
                  selectedBucket={selectedBucket}
                  onSelect={setSelectedBucket}
                />
              )}
              {selectedBucket && trendMode !== 'net' ? (
                <Pressable
                  testID="analytics-drill-bucket"
                  accessibilityRole="button"
                  accessibilityLabel={t.analytics.viewTransactions}
                  onPress={drillBucket}
                  style={({ pressed }) => [
                    styles.drill,
                    pressed && pressedFeedback,
                  ]}
                >
                  <Text
                    style={[typography.labelUppercase, styles.drillText]}
                  >
                    {t.analytics.viewTransactions}
                  </Text>
                  <MaterialIcons
                    name="chevron-right"
                    size={18}
                    color={colors.accent}
                  />
                </Pressable>
              ) : null}
            </LinearGradient>

            {showCompare ? (
              <WalletCompareCard
                wallets={compare}
                rows={compareRows}
                sparks={compareSparks}
                mode={compareMode}
                selectedIds={compareSelected}
                onModeChange={setCompareMode}
                onToggle={toggleCompare}
                onSelectRow={drillCompareRow}
                loading={compareLoading}
                error={compareError}
                onRetry={() => void refresh()}
              />
            ) : null}
          </>
        )}
      </ScrollView>
      </PullGesture>
    </Screen>
  );
}

const styles = StyleSheet.create({
  frame: {
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  header: {
    gap: spacing.xs,
  },
  kicker: {
    color: colors.textSecondary,
  },
  title: {
    color: colors.textPrimary,
  },
  customLabel: {
    color: colors.accent,
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  card: {
    padding: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  cardKicker: {
    color: colors.textSecondary,
  },
  trendToggle: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  trendOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  trendActive: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceElevated,
  },
  trendLabel: {
    color: colors.textSecondary,
  },
  trendLabelActive: {
    color: colors.accent,
  },
  legendDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  drill: {
    minHeight: layout.minTapTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.xs,
  },
  drillText: {
    color: colors.accent,
  },
  skeleton: {
    gap: spacing.md,
  },
  skeletonKpiRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  skeletonDonut: {
    alignSelf: 'center',
    marginTop: spacing.sm,
  },
  error: {
    paddingVertical: spacing.lg,
    textAlign: 'center',
    color: colors.error,
  },
});
