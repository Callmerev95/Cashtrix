/**
 * Savings goal card (SV3) — used by the `/savings` list.
 *
 * Everything shown here is presentation: `balance` is the wallet's
 * `v_wallet_balances` value, `progressPercent` is pure maths. The eye hides
 * the current amount, percent, estimate and status; the target amount stays
 * visible because it is a plan, not a balance.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Card } from '@/components';
import { PRESS_FEEDBACK_DELAY_MS, pressedFeedback } from '@/components/pressed';
import { formatRingPercent } from '@/features/budgets/domain';
import {
  formatCurrency,
  MASKED_BALANCE_ROW,
  useBalanceHidden,
} from '@/features/wallets';
import { dictionaryFor, fill, useLanguage } from '@/i18n';
import { colors, layout, radius, spacing, typography } from '@/theme';

import {
  dateLabel,
  estimatePerMonth,
  formatTargetDate,
  progressPercent,
  savingsStatus,
  type SavingsGoalView,
} from '../domain';
import { SavingsRing } from './savings-ring';
import { SavingsStatusPill } from './savings-status-pill';

export function SavingsGoalCard({
  goal,
  canAddFunds,
  onEdit,
  onAddFunds,
}: {
  goal: SavingsGoalView;
  canAddFunds: boolean;
  onEdit: () => void;
  onAddFunds: () => void;
}) {
  const { hidden } = useBalanceHidden();
  const language = useLanguage();
  const t = dictionaryFor(language);
  const copy = t.savings.screen;
  const name = goal.name ?? goal.walletName;
  const percent = progressPercent(goal.targetAmount, goal.balance);
  const status = savingsStatus(goal, goal.balance);
  const estimate = estimatePerMonth(goal, goal.balance);
  const targetDate = formatTargetDate(goal.targetDate, language);
  const days = dateLabel(goal.targetDate, new Date(), language);
  const dateText =
    targetDate === null
      ? copy.noDate
      : days === null
        ? targetDate
        : `${targetDate} · ${days}`;
  const balanceText = hidden
    ? MASKED_BALANCE_ROW
    : formatCurrency(goal.balance, 'Rp', language);
  const targetText = formatCurrency(goal.targetAmount, 'Rp', language);
  const percentText = formatRingPercent(percent);

  return (
    <Card testID={`savings-goal-${goal.id}`} style={styles.card}>
      <Pressable
        testID={`savings-goal-open-${goal.id}`}
        accessibilityRole="button"
        accessibilityLabel={
          hidden
            ? fill(copy.ringHiddenA11y, { name })
            : fill(copy.ringA11y, {
                name,
                balance: balanceText,
                target: targetText,
                percent: percentText,
              })
        }
        onPress={onEdit}
        unstable_pressDelay={PRESS_FEEDBACK_DELAY_MS}
        style={({ pressed }) => [styles.top, pressed && pressedFeedback]}
      >
        <SavingsRing
          percent={percent}
          size={76}
          hidden={hidden}
          accessibilityLabel={
            hidden
              ? fill(copy.ringHiddenA11y, { name })
              : fill(copy.ringA11y, {
                  name,
                  balance: balanceText,
                  target: targetText,
                  percent: percentText,
                })
          }
        />
        <View style={styles.body}>
          <View style={styles.titleRow}>
            <Text style={[typography.headlineSm, styles.name]}>{name}</Text>
            {!hidden ? (
              <SavingsStatusPill
                status={status}
                label={t.savings.status[status]}
                testID={`savings-goal-status-${goal.id}`}
                style={styles.status}
              />
            ) : null}
          </View>
          <Text style={[typography.bodySm, styles.wallet]}>
            {goal.walletName}
          </Text>
          <Text style={[typography.currencyMd, styles.amount]}>
            {balanceText}
          </Text>
          <Text style={[typography.bodySm, styles.target]}>
            {copy.target} {targetText}
          </Text>
        </View>
      </Pressable>

      <View style={styles.metaRow}>
        <Text style={[typography.bodySm, styles.meta]}>{dateText}</Text>
        {!hidden && estimate !== null ? (
          <Text style={[typography.bodySm, styles.meta]}>
            {fill(copy.estimate, {
              amount: formatCurrency(estimate, 'Rp', language),
            })}
          </Text>
        ) : null}
      </View>

      <Pressable
        testID={`savings-add-funds-${goal.id}`}
        accessibilityRole="button"
        accessibilityState={{ disabled: !canAddFunds }}
        accessibilityLabel={`${copy.addFunds} ${name}`}
        disabled={!canAddFunds}
        onPress={onAddFunds}
        style={({ pressed }) => [
          styles.addFunds,
          !canAddFunds && styles.addFundsDisabled,
          pressed && pressedFeedback,
        ]}
      >
        <MaterialIcons
          name="add"
          size={18}
          color={canAddFunds ? colors.accent : colors.textSecondary}
        />
        <Text
          style={[
            typography.bodyMd,
            styles.addFundsLabel,
            !canAddFunds && styles.addFundsLabelDisabled,
          ]}
        >
          {copy.addFunds}
        </Text>
      </Pressable>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    marginBottom: spacing.md,
    gap: spacing.md,
  },
  top: {
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
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  name: {
    flex: 1,
    minWidth: 0,
    color: colors.textPrimary,
  },
  status: {
    flexShrink: 0,
  },
  wallet: {
    color: colors.textSecondary,
  },
  amount: {
    color: colors.textPrimary,
    marginTop: spacing.xs / 2,
  },
  target: {
    color: colors.textSecondary,
  },
  metaRow: {
    gap: spacing.xs,
  },
  meta: {
    color: colors.textSecondary,
  },
  addFunds: {
    minHeight: layout.minTapTarget,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  addFundsDisabled: {
    borderColor: colors.border,
  },
  addFundsLabel: {
    color: colors.accent,
  },
  addFundsLabelDisabled: {
    color: colors.textSecondary,
  },
});
