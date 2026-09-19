/**
 * History row — DESIGN.md §5 / AC #25 (sign convention amended in #26).
 *
 * Category icon in a `#2C2C2E` circle, name in `body-md #E5E5E5`, timestamp in
 * `body-sm #8E8E93`, amount in `currency-md`. Income renders gold with no
 * prefix; expense renders muted white with a leading `-` — expenses are
 * never red in this system (DESIGN.md §1).
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, layout, radius, spacing, typography } from '@/theme';

import { formatSignedAmount, formatTime, type Transaction } from '../domain';

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>['name'];

export function TransactionRow({
  transaction,
  onPress,
  testID,
}: {
  transaction: Transaction;
  onPress?: () => void;
  testID?: string;
}) {
  const income = transaction.type === 'income';

  const content = (
    <>
      <View style={styles.iconWell}>
        <MaterialIcons
          name={transaction.categoryIcon as MaterialIconName}
          size={20}
          color={income ? colors.accent : colors.textPrimary}
        />
      </View>

      <View style={styles.center}>
        <Text style={[typography.bodyMd, styles.name]} numberOfLines={1}>
          {transaction.categoryName}
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
        {formatSignedAmount(transaction.type, transaction.amount)}
      </Text>
    </>
  );

  if (!onPress) {
    return (
      <View testID={testID} style={styles.row}>
        {content}
      </View>
    );
  }

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={`${transaction.categoryName}, ${formatSignedAmount(
        transaction.type,
        transaction.amount,
      )}, ${transaction.walletName}`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
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
