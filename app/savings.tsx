/**
 * Savings goals list (route `/savings`, SV3 issue #107).
 *
 * Thin renderer over `useSavings()`: goals are metadata on one wallet, so the
 * ring/persentase/status all derive from that wallet's balance in
 * `v_wallet_balances`. Pull-to-refresh re-reads both sources — a transfer that
 * just landed must move the ring without a restart.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  EmptyStateCard,
  ErrorStateCard,
  Screen,
  SectionHeader,
  SkeletonList,
} from '@/components';
import {
  PullGesture,
  PullHeader,
  usePullRefresh,
} from '@/components/pull-refresh';
import { pressedFeedback } from '@/components/pressed';
import { useSavings } from '@/features/savings';
import { SavingsGoalCard } from '@/features/savings/components/savings-goal-card';
import { useWallets } from '@/features/wallets';
import { dictionaryFor, fill, useLanguage } from '@/i18n';
import { colors, layout, radius, spacing, typography } from '@/theme';

export default function SavingsScreen() {
  const {
    goals,
    hiddenGoalCount,
    availableWallets,
    loading,
    error,
    refresh,
  } = useSavings();
  const { wallets, refresh: refreshWallets } = useWallets();
  const insets = useSafeAreaInsets();
  const language = useLanguage();
  const t = dictionaryFor(language);
  const copy = t.savings.screen;

  const refreshAll = useCallback(
    () =>
      Promise.all([refreshWallets(), refresh()]).then(() => undefined),
    [refreshWallets, refresh],
  );
  const { refreshing, onRefresh } = usePullRefresh(refreshAll);

  const canCreate = availableWallets.length > 0;
  const canAddFunds = wallets.length > 1;

  return (
    <Screen testID="savings-screen">
      <PullGesture refreshing={refreshing} onRefresh={onRefresh}>
        <ScrollView
          testID="savings-scroll"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + spacing.xl },
          ]}
        >
          <View style={styles.headerRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={copy.back}
              onPress={() => router.back()}
              style={({ pressed }) => [styles.back, pressed && pressedFeedback]}
            >
              <MaterialIcons
                name="arrow-back"
                size={24}
                color={colors.textSecondary}
              />
            </Pressable>
            <View style={styles.headerText}>
              <Text style={[typography.labelUppercase, styles.kicker]}>
                {copy.kicker}
              </Text>
              <Text style={[typography.headlineLg, styles.title]}>
                {copy.title}
              </Text>
            </View>
          </View>

          <PullHeader gap={spacing.md} testID="savings-pull-header" />
          {loading ? (
            <SkeletonList testID="savings-loading" rows={3} />
          ) : error ? (
            <ErrorStateCard
              testID="savings-error"
              message={error}
              onRetry={() => void refreshAll()}
            />
          ) : (
            <>
              {goals.length > 0 ? (
                <Text
                  testID="savings-count"
                  style={[typography.bodySm, styles.count]}
                >
                  {fill(copy.countActive, { count: goals.length })}
                </Text>
              ) : null}

              {hiddenGoalCount > 0 ? (
                <View testID="savings-hidden" style={styles.hidden}>
                  <MaterialIcons
                    name="archive"
                    size={18}
                    color={colors.textSecondary}
                  />
                  <View style={styles.hiddenBody}>
                    <Text style={[typography.bodyMd, styles.hiddenTitle]}>
                      {fill(copy.hidden, { count: hiddenGoalCount })}
                    </Text>
                    <Text style={[typography.bodySm, styles.hiddenHint]}>
                      {copy.hiddenHint}
                    </Text>
                  </View>
                </View>
              ) : null}

              {goals.length === 0 ? (
                <View>
                  <EmptyStateCard
                    icon="savings"
                    title={copy.emptyTitle}
                    description={copy.emptyBody}
                    actionLabel={canCreate ? copy.emptyAction : undefined}
                    onAction={canCreate ? () => router.push('/savings-form') : undefined}
                    testID="savings-empty"
                  />
                  {!canCreate ? (
                    <Text style={[typography.bodySm, styles.hint]}>
                      {wallets.length === 0
                        ? t.savings.form.noWalletsHint
                        : copy.allWalletsUsed}
                    </Text>
                  ) : null}
                </View>
              ) : (
                <>
                  <SectionHeader
                    testID="savings-actions"
                    title={copy.kicker}
                    actionLabel={canCreate ? copy.add : undefined}
                    onAction={
                      canCreate ? () => router.push('/savings-form') : undefined
                    }
                  />
                  {goals.map((goal) => (
                    <SavingsGoalCard
                      key={goal.id}
                      goal={goal}
                      canAddFunds={canAddFunds}
                      onEdit={() =>
                        router.push({
                          pathname: '/savings-form',
                          params: { id: goal.id },
                        })
                      }
                      onAddFunds={() =>
                        router.push({
                          pathname: '/add-transaction',
                          params: { type: 'transfer', to: goal.walletId },
                        })
                      }
                    />
                  ))}
                  {!canAddFunds ? (
                    <Text style={[typography.bodySm, styles.hint]}>
                      {copy.oneWalletHint}
                    </Text>
                  ) : null}
                  {!canCreate ? (
                    <Text style={[typography.bodySm, styles.hint]}>
                      {copy.allWalletsUsed}
                    </Text>
                  ) : null}
                </>
              )}
            </>
          )}
        </ScrollView>
      </PullGesture>
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  back: {
    width: layout.minTapTarget,
    height: layout.minTapTarget,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
  },
  kicker: {
    color: colors.textSecondary,
  },
  title: {
    color: colors.textPrimary,
  },
  content: {
    paddingBottom: spacing.xl,
  },
  count: {
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  hidden: {
    flexDirection: 'row',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: spacing.md,
  },
  hiddenBody: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  hiddenTitle: {
    color: colors.textPrimary,
  },
  hiddenHint: {
    color: colors.textSecondary,
  },
  hint: {
    color: colors.textSecondary,
    marginTop: spacing.sm,
  },
});
