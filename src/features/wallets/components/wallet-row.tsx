/**
 * Wallet row — icon well, name + type, balance in JetBrains Mono.
 *
 * Used by both the Dashboard (read-only, tap → manage) and the Wallets screen
 * (tap → edit). Balances come from `v_wallet_balances`; nothing is derived here.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, layout, radius, spacing, typography } from '@/theme';
import { PRESS_FEEDBACK_DELAY_MS, pressedFeedback } from '@/components/pressed';
import {
  formatCurrency,
  MASKED_BALANCE_ROW,
  useBalanceHidden,
  walletTypeLabel,
  walletTypeMeta,
  type Wallet,
} from '@/features/wallets';
import { dictionaryFor, fill, useLanguage } from '@/i18n';

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>['name'];

export function WalletRow({
  wallet,
  onPress,
  onLongPress,
  trailing,
  testID,
}: {
  wallet: Wallet;
  onPress?: () => void;
  /** Quick-action menu (P3b-1): OS long-press timer, no gesture code. */
  onLongPress?: () => void;
  trailing?: React.ReactNode;
  testID?: string;
}) {
  const meta = walletTypeMeta[wallet.type];
  // Follows the hero eye forever (device preference, shared store). A mask
  // is neutral on purpose: negative gold would still hint at the sign.
  const { hidden } = useBalanceHidden();
  const negative = !hidden && wallet.balance < 0;
  // C6: labels + amount format follow the OS language (ADR-0008, R10).
  const language = useLanguage();
  const t = dictionaryFor(language);
  const typeLabel = walletTypeLabel(wallet.type, language);
  const balanceText = hidden
    ? MASKED_BALANCE_ROW
    : formatCurrency(wallet.balance, 'Rp', language);

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
          {typeLabel}
          {wallet.transactionCount > 0
            ? ` · ${fill(t.wallets.row.transactions, { count: wallet.transactionCount })}`
            : ''}
        </Text>
      </View>
      <Text
        style={[typography.currencyMd, styles.amount, negative && styles.amountNegative]}
        numberOfLines={1}
      >
        {balanceText}
      </Text>
      {trailing}
    </>
  );

  // Pressable when either tap or long-press acts (archived rows are
  // tap-inert but still offer the unarchive quick action on long-press).
  if (!onPress && !onLongPress) {
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
      accessibilityLabel={
        hidden
          ? fill(t.wallets.row.balanceHiddenLabel, { name: wallet.name })
          : fill(t.wallets.row.balanceLabel, {
              name: wallet.name,
              balance: balanceText,
            })
      }
      onPress={onPress}
      onLongPress={onLongPress}
      unstable_pressDelay={PRESS_FEEDBACK_DELAY_MS}
      style={({ pressed }) => [styles.row, pressed && pressedFeedback]}
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
