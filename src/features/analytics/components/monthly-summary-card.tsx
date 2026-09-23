/**
 * Monthly summary card (A6 — "ringkasan bulan lalu").
 *
 * The Dashboard's answer to "bulan ini lebih baik dari bulan lalu?" without
 * opening Analytics: the current calendar month's income/expense/net next to
 * the previous month's, each with a month-over-month delta. Every figure
 * arrives pre-aggregated from `v_monthly_summary` (PRD §4.2) — this component
 * only formats, exactly like `KpiHeader`, which it reuses.
 *
 * Tap goes to the Analytics screen for the full breakdown.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/card';
import { colors, spacing, typography } from '@/theme';

import {
  formatMonthTitle,
  isEmptyMonthly,
  monthlyDelta,
  type MonthlyComparison,
} from '../domain';
import { KpiHeader } from './kpi-header';

export function MonthlySummaryCard({
  summary,
  loading,
  onPress,
  testID = 'dashboard-monthly-summary',
}: {
  summary: MonthlyComparison | null;
  loading: boolean;
  onPress: () => void;
  testID?: string;
}) {
  if (!summary) {
    return (
      <Card testID={testID} style={styles.card}>
        <Text style={[typography.bodySm, styles.meta]}>
          {loading ? 'Memuat ringkasan…' : 'Ringkasan belum tersedia.'}
        </Text>
      </Card>
    );
  }

  const { current, previous } = summary;
  const empty = isEmptyMonthly(summary);

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`Ringkasan ${formatMonthTitle(current.month)}, buka Analytics`}
      onPress={onPress}
    >
      <View style={styles.header}>
        <View style={styles.titles}>
          <Text style={[typography.labelUppercase, styles.kicker]}>
            Ringkasan bulan
          </Text>
          <Text style={[typography.headlineSm, styles.title]}>
            {formatMonthTitle(current.month)}
          </Text>
        </View>
        <MaterialIcons
          name="chevron-right"
          size={22}
          color={colors.textSecondary}
        />
      </View>
      <KpiHeader
        testID={`${testID}-kpi`}
        totals={{
          expense: current.expense,
          income: current.income,
          net: current.net,
        }}
        delta={{
          expense: monthlyDelta(current.expense, previous.expense),
          income: monthlyDelta(current.income, previous.income),
          net: monthlyDelta(current.net, previous.net),
        }}
      />
      {empty ? (
        <Text style={[typography.bodySm, styles.meta]}>
          Belum ada transaksi bulan ini — catat yang pertama lewat tombol +.
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  titles: {
    gap: spacing.xs,
  },
  kicker: {
    color: colors.textSecondary,
  },
  title: {
    color: colors.textPrimary,
  },
  meta: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
  },
});
