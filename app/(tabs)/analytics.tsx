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
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { LinearGradient } from 'expo-linear-gradient';

import {
  AnalyticsEmptyState,
  BarChart,
  BreakdownList,
  DonutChart,
  KpiHeader,
  RangeSegmentedControl,
  WalletFilterChips,
  isDailyRange,
  resolveRange,
  toBars,
  toDonutSlices,
  useAnalytics,
} from '@/features/analytics';
import { Screen, AppHeader } from '@/components';
import { useProfile } from '@/features/profile';
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
  } = useAnalytics();
  const { avatarSignedUrl } = useProfile();

  const window = resolveRange(range);
  const daily = isDailyRange(range);
  const slices = overview ? toDonutSlices(overview.breakdown) : [];
  const bars = overview ? toBars(overview.series, window, daily) : [];

  return (
    <Screen style={styles.frame} testID="analytics-screen">
      <AppHeader avatarUri={avatarSignedUrl} />
      <View style={styles.header}>
        <Text style={[typography.labelUppercase, styles.kicker]}>Insights</Text>
        <Text style={[typography.headlineLg, styles.title]}>
          Financial Intelligence
        </Text>
      </View>

      <RangeSegmentedControl value={range} onChange={setRange} />

      <WalletFilterChips
        wallets={wallets}
        value={walletId}
        onChange={setWalletId}
      />

      <ScrollView
        testID="analytics-scroll"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {loading && !overview ? (
          <View testID="analytics-loading" style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : error ? (
          <Text testID="analytics-error" style={[typography.bodyMd, styles.error]}>
            {error}
          </Text>
        ) : isEmpty || !overview ? (
          <AnalyticsEmptyState />
        ) : (
          <>
            <KpiHeader totals={overview.totals} delta={overview.delta} />

            <LinearGradient
              colors={[...gradients.cardFill]}
              style={styles.card}
            >
              <Text style={[typography.labelUppercase, styles.cardKicker]}>
                Distribusi Pengeluaran
              </Text>
              <DonutChart slices={slices} total={overview.totals.expense} />
              <View style={styles.legendDivider} />
              <BreakdownList slices={slices} />
            </LinearGradient>

            <LinearGradient
              colors={[...gradients.cardFill]}
              style={styles.card}
            >
              <Text style={[typography.labelUppercase, styles.cardKicker]}>
                {daily ? 'Tren Harian' : 'Tren Bulanan'}
              </Text>
              <BarChart bars={bars} />
            </LinearGradient>
          </>
        )}
      </ScrollView>
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
  loading: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  error: {
    paddingVertical: spacing.lg,
    textAlign: 'center',
    color: colors.error,
  },
});
