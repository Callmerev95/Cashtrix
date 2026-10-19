/**
 * KPI header (PRD §2.3 Epic D / AC #7).
 *
 * Total Expense (red) / Total Income (green) / Net (gold) for the active
 * range, each with its delta vs the equal-length previous period. Delta "up"
 * is gold and "down" is muted grey. A `null` delta (no previous data) renders
 * as an em dash, never `NaN`/`Infinity`.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components/card';
import { pressedFeedback } from '@/components/pressed';
import { colors, spacing, typography } from '@/theme';
import { dictionaryFor, fill, useLanguage, type Language } from '@/i18n';

import { deltaTone, formatDelta } from '../domain';
import { formatGrouped } from '../../transactions/domain';
import { AnimatedNumber } from './animated-number';

export function KpiHeader({
  totals,
  delta,
  testID = 'analytics-kpi',
  onSelect,
}: {
  totals: { expense: number; income: number; net: number };
  delta: { expense: number | null; income: number | null; net: number | null };
  testID?: string;
  /** L4a: tapping a KPI drills into its transactions. Absent = inert card. */
  onSelect?: (tone: 'expense' | 'income' | 'net') => void;
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
        onPress={onSelect ? () => onSelect('expense') : undefined}
      />
      <View style={styles.divider} />
      <Kpi
        testID={`${testID}-income`}
        label={t.analytics.kpi.income}
        value={totals.income}
        delta={delta.income}
        tone="income"
        language={language}
        onPress={onSelect ? () => onSelect('income') : undefined}
      />
      <View style={styles.divider} />
      <Kpi
        testID={`${testID}-net`}
        label={t.analytics.kpi.net}
        value={totals.net}
        delta={delta.net}
        tone="net"
        language={language}
        onPress={onSelect ? () => onSelect('net') : undefined}
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
  onPress,
}: {
  label: string;
  value: number;
  delta: number | null;
  tone: 'expense' | 'income' | 'net';
  testID?: string;
  language: Language;
  onPress?: () => void;
}) {
  const direction = deltaTone(delta);
  const t = dictionaryFor(language).analytics;
  const prefix = t.currencyPrefix;
  const body = (
    <>
      <Text
        style={[typography.labelUppercase, styles.label]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      >
        {label}
      </Text>
      <AnimatedNumber
        testID={`${testID}-value`}
        value={value}
        format={(n) => `${prefix} ${formatGrouped(n, language)}`}
        style={[typography.currencyMd, valueToneStyle[tone]]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.75}
      />
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
    </>
  );

  if (!onPress) {
    return (
      <View testID={testID} style={styles.kpi}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={fill(t.kpiDrillA11y, { label })}
      onPress={onPress}
      style={({ pressed }) => [styles.kpi, pressed && pressedFeedback]}
    >
      {body}
    </Pressable>
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
