/**
 * Wallet row — icon well, name + type, balance in JetBrains Mono.
 *
 * Used by both the Dashboard (read-only, tap → manage) and the Wallets screen
 * (tap → edit). Balances come from `v_wallet_balances`; nothing is derived here.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, layout, radius, spacing, typography } from '@/theme';
import { formatCurrency, walletTypeMeta, type Wallet } from '@/features/wallets';

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>['name'];

export function WalletRow({
  wallet,
  onPress,
  trailing,
  testID,
}: {
  wallet: Wallet;
  onPress?: () => void;
  trailing?: React.ReactNode;
  testID?: string;
}) {
  const meta = walletTypeMeta[wallet.type];
  const negative = wallet.balance < 0;

  const content = (
    <>
      <View style={styles.iconWell}>
        <MaterialIcons
          name={meta.icon as MaterialIconName}
          size={20}
          color={colors.accent}
        />
      </View>
      <View style={styles.center}>
        <Text style={[typography.bodyMd, styles.name]} numberOfLines={1}>
          {wallet.name}
        </Text>
        <Text style={[typography.bodySm, styles.meta]} numberOfLines={1}>
          {meta.label}
          {wallet.transactionCount > 0
            ? ` · ${wallet.transactionCount} transaksi`
            : ''}
        </Text>
      </View>
      <Text
        style={[typography.currencyMd, styles.amount, negative && styles.amountNegative]}
        numberOfLines={1}
      >
        {formatCurrency(wallet.balance)}
      </Text>
      {trailing}
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
      accessibilityLabel={`${wallet.name}, saldo ${formatCurrency(wallet.balance)}`}
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
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
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
    gap: spacing.xs / 2,
  },
  name: {
    color: colors.textPrimary,
  },
  meta: {
    color: colors.textSecondary,
  },
  amount: {
    color: colors.textPrimary,
  },
  amountNegative: {
    color: colors.accent,
  },
});
