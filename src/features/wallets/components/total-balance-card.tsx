/**
 * Dashboard hero card — the combined balance (PRD §2.3 Epic B2, DESIGN.md §6).
 *
 * Structure: L1 card with the gold→border gradient hairline, `label-uppercase`
 * kicker, `currency-display` total in JetBrains Mono, and the ambience blob.
 * The gradient is a 1px frame (not a gold fill) — gold stays a scalpel.
 */
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { SkeletonBlock } from '@/components/skeleton';
import { formatCurrency } from '@/features/wallets';
import { dictionaryFor, fill, useLanguage } from '@/i18n';
import { colors, gradients, layout, radius, spacing, typography } from '@/theme';

export function TotalBalanceCard({
  total,
  walletCount,
  loading,
}: {
  total: number;
  walletCount: number;
  loading?: boolean;
}) {
  // C6: copy + amount format follow the OS language (ADR-0008, R10).
  const language = useLanguage();
  const t = dictionaryFor(language);
  return (
    <LinearGradient
      testID="total-balance-card"
      colors={[...gradients.cardBorder]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.frame}
    >
      <View style={styles.inner}>
        <View style={styles.ambience} pointerEvents="none" />
        <Text style={[typography.labelUppercase, styles.kicker]}>
          {t.wallets.card.total}
        </Text>
        {loading ? (
          <SkeletonBlock
            testID="total-balance-skeleton"
            width={180}
            height={40}
            borderRadius={radius.sm}
            style={styles.skeletonAmount}
          />
        ) : (
          <Text
            testID="total-balance"
            style={[typography.currencyDisplay, styles.amount]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatCurrency(total, 'Rp', language)}
          </Text>
        )}
        <Text style={[typography.bodySm, styles.meta]}>
          {fill(t.wallets.card.count, { count: walletCount })}
        </Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.xxl,
    padding: StyleSheet.hairlineWidth,
    shadowColor: colors.accent,
    shadowOpacity: 0.08,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 8 },
  },
  inner: {
    padding: layout.heroPadding,
    borderRadius: radius.xxl - 1,
    backgroundColor: colors.surfaceCard,
    overflow: 'hidden',
  },
  ambience: {
    position: 'absolute',
    top: -72,
    right: -48,
    width: 168,
    height: 168,
    borderRadius: radius.full,
    backgroundColor: colors.accentAmbience,
  },
  kicker: {
    color: colors.textSecondary,
  },
  amount: {
    marginTop: spacing.sm,
    color: colors.textPrimary,
  },
  skeletonAmount: {
    marginTop: spacing.sm,
  },
  meta: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
  },
});
