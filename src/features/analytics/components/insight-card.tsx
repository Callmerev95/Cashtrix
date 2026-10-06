/**
 * Deterministic insight card (2.1.0 PR2, Opsi A).
 *
 * Two to three sentences from numbers the payload already carries
 * (`toInsightSummary` — month movement, concentration, income coverage).
 * No model, no Edge, no consent: the figures are templated, so they can
 * never be hallucinated. A future LLM may only rephrase these lines.
 */
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';

import type { InsightSummary } from '../domain';

export function InsightCard({
  summary,
  testID = 'analytics-insight',
}: {
  summary: InsightSummary;
  testID?: string;
}) {
  if (summary.lines.length === 0) return null;
  return (
    <View testID={testID} style={styles.card}>
      <Text style={[typography.labelUppercase, styles.kicker]}>
        {summary.title}
      </Text>
      {summary.lines.map((line, index) => (
        <Text
          key={index}
          testID={`${testID}-line-${index}`}
          style={[typography.bodyMd, styles.line]}
        >
          {line}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    gap: spacing.xs,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  kicker: {
    color: colors.textSecondary,
  },
  line: {
    color: colors.textPrimary,
    fontStyle: 'italic',
  },
});
