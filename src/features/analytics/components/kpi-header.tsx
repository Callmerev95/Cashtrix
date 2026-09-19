/**
 * KPI header (PRD §2.3 Epic D / AC #7).
 *
 * Total Expense / Total Income / Net for the active range, each with its delta
 * vs the equal-length previous period. Delta "up" is gold and "down" is muted
 * grey — there is **no red** anywhere in this system (DESIGN.md §1). A `null`
 * delta (no previous data) renders as an em dash, never `NaN`/`Infinity`.
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
      />
      <View style={styles.divider} />
      <Kpi
        testID={`${testID}-income`}
        label="Pemasukan"
        value={totals.income}
        delta={delta.income}
        accent
      />
      <View style={styles.divider} />
      <Kpi
        testID={`${testID}-net`}
        label="Net"
        value={totals.net}
        delta={delta.net}
      />
    </Card>
  );
}

function Kpi({
  label,
  value,
  delta,
  accent = false,
  testID,
}: {
  label: string;
  value: number;
  delta: number | null;
  accent?: boolean;
  testID?: string;
}) {
  const tone = deltaTone(delta);

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
        style={[typography.currencyMd, accent ? styles.valueAccent : styles.value]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        Rp {formatGrouped(value)}
      </Text>
      <Text
        testID={`${testID}-delta`}
        style={[
          typography.bodySm,
          tone === 'up' ? styles.deltaUp : styles.deltaMuted,
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
  value: {
    color: colors.textPrimary,
  },
  valueAccent: {
    color: colors.income,
  },
  deltaUp: {
    color: colors.accent,
  },
  deltaMuted: {
    color: colors.textSecondary,
  },
});
