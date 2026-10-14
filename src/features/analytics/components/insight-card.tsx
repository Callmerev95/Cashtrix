/**
 * Insight card (2.1.0 PR2 deterministic + L1 AI rephrase).
 *
 * Deterministic first, always: the templated lines render instantly and
 * stay as the fallback no matter what the model does. When the caller
 * passes AI `lines`, they replace the deterministic text with an
 * "Asisten AI" badge (honest provenance — never silently swapped). The
 * refine affordance (`onRefine`, idle only) and the retry affordance
 * (rate/quota only) are caller-owned; this component stays presentational.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';
import { pressedFeedback } from '@/components/pressed';

import type { InsightSummary } from '../domain';

export type InsightAiState =
  | 'idle'
  | 'loading'
  | 'ai'
  | 'rate_limited'
  | 'quota_exceeded';

export function InsightCard({
  summary,
  aiLines = null,
  aiState = 'idle',
  refineLabel = '',
  refiningLabel = '',
  aiBadge = '',
  rateLimitedNote = '',
  quotaNote = '',
  retryLabel = '',
  onRefine = () => undefined,
  onRetry = () => undefined,
  openBudgetsLabel = '',
  onOpenBudgets,
  testID = 'analytics-insight',
}: {
  summary: InsightSummary;
  aiLines?: string[] | null;
  aiState?: InsightAiState;
  refineLabel?: string;
  refiningLabel?: string;
  aiBadge?: string;
  rateLimitedNote?: string;
  quotaNote?: string;
  retryLabel?: string;
  onRefine?: () => void;
  onRetry?: () => void;
  /** L3: tap-to-Budgets affordance (only passed with a run-rate line). */
  openBudgetsLabel?: string;
  onOpenBudgets?: () => void;
  testID?: string;
}) {
  if (summary.lines.length === 0) return null;
  const showAi = aiState === 'ai' && aiLines && aiLines.length > 0;
  const lines = showAi ? aiLines : summary.lines;
  const body = (
    <>
      <View style={styles.kickerRow}>
        <Text style={[typography.labelUppercase, styles.kicker]}>
          {summary.title}
        </Text>
        {showAi ? (
          <Text testID={`${testID}-ai-badge`} style={styles.badge}>
            {aiBadge}
          </Text>
        ) : null}
      </View>
      {lines.map((line, index) => (
        <Text
          key={index}
          testID={`${testID}-line-${index}`}
          style={[typography.bodyMd, styles.line]}
        >
          {line}
        </Text>
      ))}
    </>
  );
  const footer = (
    <>
      {aiState === 'idle' ? (
        <Pressable
          testID={`${testID}-refine`}
          accessibilityRole="button"
          accessibilityLabel={refineLabel}
          onPress={onRefine}
          style={({ pressed }) => [pressed && pressedFeedback]}
        >
          <Text style={[typography.bodySm, styles.refine]}>{refineLabel}</Text>
        </Pressable>
      ) : null}
      {aiState === 'loading' ? (
        <Text testID={`${testID}-loading`} style={styles.note}>
          {refiningLabel}
        </Text>
      ) : null}
      {aiState === 'rate_limited' ? (
        <View style={styles.failRow}>
          <Text style={[typography.bodySm, styles.note]}>{rateLimitedNote}</Text>
          <Pressable
            testID={`${testID}-retry`}
            accessibilityRole="button"
            accessibilityLabel={retryLabel}
            onPress={onRetry}
            style={({ pressed }) => [pressed && pressedFeedback]}
          >
            <Text style={[typography.bodySm, styles.refine]}>{retryLabel}</Text>
          </Pressable>
        </View>
      ) : null}
      {aiState === 'quota_exceeded' ? (
        <Text testID={`${testID}-quota`} style={styles.note}>
          {quotaNote}
        </Text>
      ) : null}
      {onOpenBudgets ? (
        <Pressable
          testID={`${testID}-budgets`}
          accessibilityRole="button"
          accessibilityLabel={openBudgetsLabel}
          onPress={onOpenBudgets}
          style={({ pressed }) => [pressed && pressedFeedback]}
        >
          <Text style={[typography.bodySm, styles.refine]}>
            {openBudgetsLabel}
          </Text>
        </Pressable>
      ) : null}
    </>
  );
  // L3: the whole card is tappable only with a run-rate line (explicit
  // affordance above — a tap without a destination would be a trap).
  // Without it, the tree is byte-identical to L1/L2 (suite svg untouched).
  if (!onOpenBudgets) {
    return (
      <View testID={testID} style={styles.card}>
        {body}
        {footer}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={openBudgetsLabel}
      onPress={onOpenBudgets}
      style={({ pressed }) => [styles.card, pressed && pressedFeedback]}
    >
      {body}
      {footer}
    </Pressable>
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
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kicker: {
    color: colors.textSecondary,
  },
  badge: {
    color: colors.accent,
    fontSize: 11,
  },
  line: {
    color: colors.textPrimary,
    fontStyle: 'italic',
  },
  refine: {
    color: colors.accent,
  },
  note: {
    color: colors.textSecondary,
  },
  failRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
});
