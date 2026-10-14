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

import { LinearGradient } from 'expo-linear-gradient';

import {
  AnalyticsEmptyState,
  BarChart,
  BreakdownList,
  DonutChart,
  InsightCard,
  KpiHeader,
  NetAreaChart,
  RangeSegmentedControl,
  WalletFilterChips,
  enumerateBuckets,
  getCachedInsightAi,
  getInsightConsentSnapshot,
  isDailyRange,
  requestInsight,
  resolveRange,
  setCachedInsightAi,
  setInsightConsented,
  shouldAutoRefine,
  subscribeInsightConsent,
  toBars,
  toDonutSlices,
  toFullSlices,
  toInsightSummary,
  toNetPoints,
  toSparklines,
  useAnalytics,
  type InsightAiState,
  type TrendMode,
} from '@/features/analytics';
import { insightAiEvent, trackEvent } from '@/features/observability';
import { Screen, AppHeader, ErrorStateCard, Skeleton, SkeletonBlock } from '@/components';
import { PullGesture, PullHeader, usePullRefresh } from '@/components/pull-refresh';
import { useBudgets } from '@/features/budgets';
import { useProfile } from '@/features/profile';
import { dictionaryFor, fill, useLanguage } from '@/i18n';
import { colors, gradients, radius, spacing, typography } from '@/theme';

export default function AnalyticsScreen() {
  const {
    range,
    setRange,
    wallets,
    walletId,
    setWalletId,
    overview,
    loading,
    error,
    isEmpty,
    monthly,
    sparks,
    refresh,
  } = useAnalytics();
  const { avatarSignedUrl, profile } = useProfile();
  const { unreadCount } = useBudgets();
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
  const filterKey = `${range}:${walletId ?? 'all'}`;
  const [filterKeySeen, setFilterKeySeen] = useState(filterKey);
  const [selectedSliceId, setSelectedSliceId] = useState<string | null>(null);
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);
  // P2b: one trend card, three metrics (default Expense = previous pixels).
  const [trendMode, setTrendMode] = useState<TrendMode>('expense');
  if (filterKeySeen !== filterKey) {
    setFilterKeySeen(filterKey);
    setSelectedSliceId(null);
    setSelectedBucket(null);
  }
  const window = resolveRange(range);
  const daily = isDailyRange(range);  const slices = overview
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
  const net =
    overview && trendMode === 'net'
      ? toNetPoints(overview.series, window, daily, tz, language)
      : null;
  const insight =
    overview && monthly
      ? toInsightSummary({
          totals: overview.totals,
          monthly,
          slices,
          // L2, defensif: payload lama tanpa kunci ini -> [] -> baris L1,
          // bit-identik (kontrak anti-regresi).
          prevSlices: toFullSlices(overview.prevBreakdown ?? []),
          lang: language,
        })
      : null;

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

      <RangeSegmentedControl value={range} onChange={setRange} />

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
            <KpiHeader totals={overview.totals} delta={overview.delta} />

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
                key={range}
                slices={slices}
                sparks={sparkLines}
                selectedId={selectedSliceId}
                onSelect={setSelectedSliceId}
              />
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
            </LinearGradient>
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
