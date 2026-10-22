/**
 * Dashboard savings summary (SV3) — one primary target plus an "N lain" count.
 *
 * The card is a read-only projection: the ring follows the target wallet's
 * `v_wallet_balances` value, so it only changes after a transfer and a pull or
 * provider refresh. Empty state is the only place a create CTA lives here;
 * the full list is one tap away.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import {
  Card,
  ErrorStateCard,
  Skeleton,
  SkeletonBlock,
} from '@/components';
import { PRESS_FEEDBACK_DELAY_MS, pressedFeedback } from '@/components/pressed';
import { formatRingPercent } from '@/features/budgets/domain';
import {
  dateLabel,
  estimatePerMonth,
  formatTargetDate,
  progressPercent,
  savingsStatus,
  type SavingsGoalView,
} from '@/features/savings';
import { SavingsRing } from '@/features/savings/components/savings-ring';
import { SavingsStatusPill } from '@/features/savings/components/savings-status-pill';
import {
  formatCurrency,
  MASKED_BALANCE_ROW,
  useBalanceHidden,
} from '@/features/wallets';
import { dictionaryFor, fill, useLanguage } from '@/i18n';
import { colors, radius, spacing, typography } from '@/theme';

export function SavingsSummaryCard({
  goal,
  otherCount,
  loading,
  error,
  onRetry,
}: {
  goal: SavingsGoalView | null;
  otherCount: number;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  const { hidden } = useBalanceHidden();
  const language = useLanguage();
  const t = dictionaryFor(language);
  const copy = t.savings.dashboard;
  const screen = t.savings.screen;

  if (loading) {
    return (
      <Card testID="dashboard-savings-loading">
        <Skeleton>
          <View style={styles.skeletonRow}>
            <SkeletonBlock width={56} height={56} borderRadius={28} />
            <View style={styles.skeletonBody}>
              <SkeletonBlock width="60%" height={16} />
              <SkeletonBlock width="40%" height={12} />
              <SkeletonBlock width="75%" height={14} />
            </View>
          </View>
        </Skeleton>
      </Card>
    );
  }

  if (error) {
    return (
      <ErrorStateCard
        testID="dashboard-savings-error"
        message={error}
        onRetry={onRetry}
      />
    );
  }

  if (!goal) {
    return (
      <Card testID="dashboard-savings-empty" style={styles.card}>
        <View style={styles.emptyRow}>
          <View style={styles.emptyIcon}>
            <MaterialIcons name="savings" size={22} color={colors.accent} />
          </View>
          <View style={styles.emptyBody}>
            <Text style={[typography.bodyMd, styles.emptyTitle]}>
              {copy.emptyTitle}
            </Text>
            <Text style={[typography.bodySm, styles.secondary]}>
              {copy.emptyBody}
            </Text>
          </View>
          <Pressable
            testID="dashboard-savings-create"
            accessibilityRole="button"
            accessibilityLabel={copy.emptyAction}
            onPress={() => router.push('/savings-form')}
            style={({ pressed }) => [
              styles.create,
              pressed && pressedFeedback,
            ]}
          >
            <MaterialIcons name="add" size={18} color={colors.accent} />
            <Text style={[typography.bodySm, styles.createLabel]}>
              {copy.emptyAction}
            </Text>
          </Pressable>
        </View>
      </Card>
    );
  }

  const name = goal.name ?? goal.walletName;
  const percent = progressPercent(goal.targetAmount, goal.balance);
  const status = savingsStatus(goal, goal.balance);
  const target = formatCurrency(goal.targetAmount, 'Rp', language);
  const balance = hidden
    ? MASKED_BALANCE_ROW
    : formatCurrency(goal.balance, 'Rp', language);
  const percentText = formatRingPercent(percent);
  const date = formatTargetDate(goal.targetDate, language);
  const days = dateLabel(goal.targetDate, new Date(), language);
  const estimate = estimatePerMonth(goal, goal.balance);

  return (
    <Card testID="dashboard-savings" style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          hidden
            ? fill(screen.ringHiddenA11y, { name })
            : fill(copy.cardA11y, { name, percent: percentText })
        }
        onPress={() => router.push('/savings')}
        unstable_pressDelay={PRESS_FEEDBACK_DELAY_MS}
        style={({ pressed }) => [styles.row, pressed && pressedFeedback]}
      >
        <SavingsRing
          percent={percent}
          size={56}
          hidden={hidden}
          accessibilityLabel={
            hidden
              ? fill(screen.ringHiddenA11y, { name })
              : fill(screen.ringA11y, {
                  name,
                  balance,
                  target,
                  percent: percentText,
                })
          }
        />
        <View style={styles.body}>
          <View
            style={[styles.titleRow, !hidden && styles.titleRowWithPill]}
          >
            <Text style={[typography.labelUppercase, styles.kicker]}>
              {copy.kicker}
            </Text>
          </View>
          <Text style={[typography.bodyMd, styles.name]}>{name}</Text>
          <Text style={[typography.bodySm, styles.secondary]}>
            {goal.walletName} · {balance}
          </Text>
          <Text style={[typography.bodySm, styles.secondary]}>
            {screen.target} {target}
          </Text>
          {date ? (
            <Text style={[typography.bodySm, styles.secondary]}>
              {date}
              {days ? ` · ${days}` : ''}
            </Text>
          ) : null}
          {!hidden && estimate !== null ? (
            <Text style={[typography.bodySm, styles.secondary]}>
              {fill(screen.estimate, {
                amount: formatCurrency(estimate, 'Rp', language),
              })}
            </Text>
          ) : null}
        </View>
        <MaterialIcons
          name="chevron-right"
          size={20}
          color={colors.textSecondary}
        />
        {!hidden ? (
          <SavingsStatusPill
            status={status}
            label={t.savings.status[status]}
            testID="dashboard-savings-status"
            style={styles.statusCorner}
          />
        ) : null}
      </Pressable>

      {otherCount > 0 ? (
        <Text
          testID="dashboard-savings-other"
          style={[typography.bodySm, styles.other]}
        >
          {fill(copy.otherCount, { count: otherCount })}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  body: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xs / 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  titleRowWithPill: {
    minHeight: 24,
  },
  statusCorner: {
    position: 'absolute',
    top: 0,
    right: 0,
  },
  kicker: {
    flexShrink: 1,
    color: colors.textSecondary,
  },
  name: {
    color: colors.textPrimary,
  },
  secondary: {
    color: colors.textSecondary,
  },
  other: {
    color: colors.textSecondary,
    marginLeft: 56 + spacing.md,
  },
  emptyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  emptyIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  emptyBody: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  emptyTitle: {
    color: colors.textPrimary,
  },
  create: {
    minHeight: 36,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs / 2,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent,
  },
  createLabel: {
    color: colors.accent,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  skeletonBody: {
    flex: 1,
    gap: spacing.xs,
  },
});
