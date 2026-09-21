/**
 * KPI header (PRD §2.3 Epic D / AC #7).
 *
 * Total Expense (red) / Total Income (green) / Net (gold) for the active
 * range, each with its delta vs the equal-length previous period. Delta "up"
 * is gold and "down" is muted grey. A `null` delta (no previous data) renders
 * as an em dash, never `NaN`/`Infinity`.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/card';
import { colors, spacing, typography } from '@/theme';

import { deltaTone, formatDelta } from '../domain';
import { formatGrouped } from '../../transactions/domain';

export function KpiHeader({
  totals,
  delta,
  testID = 'analytics-kpi',
}: {
  totals: { expense: number; income: number; net: number };
  delta: { expense: number | null; income: number | null; net: number | null };
  testID?: string;
}) {
  return (
    <Card testID={testID} style={styles.card}>
      <Kpi
        testID={`${testID}-expense`}
        label="Pengeluaran"
        value={totals.expense}
        delta={delta.expense}
        tone="expense"
      />
      <View style={styles.divider} />
      <Kpi
        testID={`${testID}-income`}
        label="Pemasukan"
        value={totals.income}
        delta={delta.income}
        tone="income"
      />
      <View style={styles.divider} />
      <Kpi
        testID={`${testID}-net`}
        label="Net"
        value={totals.net}
        delta={delta.net}
        tone="net"
      />
    </Card>
  );
}

function Kpi({
  label,
  value,
  delta,
  tone,
  testID,
}: {
  label: string;
  value: number;
  delta: number | null;
  tone: 'expense' | 'income' | 'net';
  testID?: string;
}) {
  const direction = deltaTone(delta);
  return (
    <View testID={testID} style={styles.kpi}>
      <Text
        style={[typography.labelUppercase, styles.label]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {label}
      </Text>
      <Text
        testID={`${testID}-value`}
        style={[typography.currencyMd, valueToneStyle[tone]]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        Rp {formatGrouped(value)}
      </Text>
      <Text
        testID={`${testID}-delta`}
        style={[
          typography.bodySm,
          direction === 'up' ? styles.deltaUp : styles.deltaMuted,
        ]}
        numberOfLines={1}
      >
        {formatDelta(delta)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'stretch',
    padding: spacing.md,
    gap: spacing.sm,
  },
  kpi: {
    flex: 1,
    gap: spacing.xs,
  },
  divider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  label: {
    color: colors.textSecondary,
  },
  valueExpense: {
    color: colors.expense,
  },
  valueIncome: {
    color: colors.income,
  },
  valueNet: {
    color: colors.net,
  },
  deltaUp: {
    color: colors.accent,
  },
  deltaMuted: {
    color: colors.textSecondary,
  },
});

const valueToneStyle = {
  expense: styles.valueExpense,
  income: styles.valueIncome,
  net: styles.valueNet,
} as const;
