/**
 * History row — DESIGN.md §5 / AC #25 (sign convention amended in #26).
 *
 * Category icon in a `#2C2C2E` circle, name in `body-md #E5E5E5`, timestamp in
 * `body-sm #8E8E93`, amount in `currency-md`. Income renders green with no
 * prefix; expense renders red with a leading `-` (DESIGN.md §1).
 * Transfer renders neutral white
 * with no prefix and a single `Transfer ke {tujuan}` line (V2, ADR-0004).
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, layout, radius, spacing, typography } from '@/theme';
import { useLanguage } from '@/i18n';

import { formatSignedAmount, formatTime, transferFeedLabel, type Transaction } from '../domain';

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>['name'];

export function TransactionRow({
  transaction,
  onPress,
  testID,
  selecting = false,
  selected = false,
  dimmed = false,
}: {
  transaction: Transaction;
  onPress?: () => void;
  testID?: string;
  /** A4 select mode: the icon well becomes a check circle. */
  selecting?: boolean;
  selected?: boolean;
  /** Non-selectable rows (transfers in select mode) render muted. */
  dimmed?: boolean;
}) {
  const income = transaction.type === 'income';
  const transfer = transaction.type === 'transfer';
  // C6: feed label + amount format follow the OS language (ADR-0008, R10).
  const language = useLanguage();
  const title = transfer
    ? transferFeedLabel(transaction.counterpartyWalletName, language)
    : transaction.categoryName;
  const accessibilityName = transfer
    ? transferFeedLabel(transaction.counterpartyWalletName, language)
    : transaction.categoryName;
  const amountText = formatSignedAmount(
    transaction.type,
    transaction.amount,
    'Rp',
    language,
  );

  const content = (
    <>
      {selecting ? (
        <View
          testID={testID ? `${testID}-check` : undefined}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: selected, disabled: dimmed }}
          style={[styles.check, selected && styles.checkSelected]}
        >
          {selected ? (
            <MaterialIcons name="check" size={18} color={colors.textOnAccent} />
          ) : null}
        </View>
      ) : (
        <View style={styles.iconWell}>
          <MaterialIcons
            name={transaction.categoryIcon as MaterialIconName}
            size={20}
            color={income ? colors.accent : colors.textPrimary}
          />
        </View>
      )}

      <View style={styles.center}>
        <Text style={[typography.bodyMd, styles.name]} numberOfLines={1}>
          {title}
        </Text>
        <Text style={[typography.bodySm, styles.meta]} numberOfLines={1}>
          {formatTime(transaction.occurredAt)} · {transaction.walletName}
          {transaction.note ? ` · ${transaction.note}` : ''}
        </Text>
      </View>

      <Text
        testID={testID ? `${testID}-amount` : undefined}
        style={[
          typography.currencyMd,
          income ? styles.income : styles.expense,
        ]}
        numberOfLines={1}
      >
        {amountText}
      </Text>
    </>
  );

  if (!onPress) {
    return (
      <View testID={testID} style={[styles.row, dimmed && styles.dimmed]}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${accessibilityName}, ${amountText}, ${transaction.walletName}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        dimmed && styles.dimmed,
        pressed && styles.pressed,
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: layout.minTapTarget + spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
  },
  pressed: {
    opacity: 0.7,
  },
  iconWell: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  check: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  checkSelected: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  dimmed: {
    opacity: 0.5,
  },
  center: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.textPrimary,
  },
  meta: {
    color: colors.textSecondary,
  },
  income: {
    color: colors.income,
  },
  expense: {
    color: colors.expense,
  },
});
