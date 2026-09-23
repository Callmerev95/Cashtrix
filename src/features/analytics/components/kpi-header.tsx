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
import { dictionaryFor, useLanguage, type Language } from '@/i18n';

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
  // C6: labels + number format follow the OS language (ADR-0008, R10).
  const language = useLanguage();
  const t = dictionaryFor(language);
  return (
    <Card testID={testID} style={styles.card}>
      <Kpi
        testID={`${testID}-expense`}
        label={t.analytics.kpi.expense}
        value={totals.expense}
        delta={delta.expense}
        tone="expense"
        language={language}
      />
      <View style={styles.divider} />
      <Kpi
        testID={`${testID}-income`}
        label={t.analytics.kpi.income}
        value={totals.income}
        delta={delta.income}
        tone="income"
        language={language}
      />
      <View style={styles.divider} />
      <Kpi
        testID={`${testID}-net`}
        label={t.analytics.kpi.net}
        value={totals.net}
        delta={delta.net}
        tone="net"
        language={language}
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
  language,
}: {
  label: string;
  value: number;
  delta: number | null;
  tone: 'expense' | 'income' | 'net';
  testID?: string;
  language: Language;
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
        Rp {formatGrouped(value, language)}
      </Text>
      <Text
        testID={`${testID}-delta`}
        style={[
          typography.bodySm,
          direction === 'up' ? styles.deltaUp : styles.deltaMuted,
        ]}
        numberOfLines={1}
      >
        {formatDelta(delta, language)}
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
