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
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useState } from 'react';
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
  RangeSegmentedControl,
  WalletFilterChips,
  isDailyRange,
  resolveRange,
  toBars,
  toDonutSlices,
  toInsightSummary,
  useAnalytics,
} from '@/features/analytics';
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
  if (filterKeySeen !== filterKey) {
    setFilterKeySeen(filterKey);
    setSelectedSliceId(null);
    setSelectedBucket(null);
  }

  const window = resolveRange(range);
  const daily = isDailyRange(range);
  const slices = overview
    ? toDonutSlices(overview.breakdown, t.analytics.other)
    : [];
  const bars = overview
    ? toBars(overview.series, window, daily, tz, language)
    : [];
  const insight =
    overview && monthly
      ? toInsightSummary({
          totals: overview.totals,
          monthly,
          slices,
          lang: language,
        })
      : null;

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
              <InsightCard summary={insight} />
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
              <BarChart
                bars={bars}
                selectedBucket={selectedBucket}
                onSelect={setSelectedBucket}
              />
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
