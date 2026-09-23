/**
 * Dashboard (PRD §2.3 Epic B2 + Epic C2, DESIGN.md §6).
 *
 * T4 filled the hero card + wallet list; T5 adds the transaction history — the
 * "arus kas hari ini" half of the story. History is 20/page and pages in on
 * scroll end; rows are grouped per day by the shared list component, which
 * never re-sorts (the DB order and the paging offset must agree).
 *
 * Balances come from `useWallets()` (`v_wallet_balances`) and history from
 * `useTransactions()` (`v_transactions_feed`) — two server-side reads, no
 * client aggregation of money.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyStateCard, AppHeader, ErrorStateCard, Screen, SectionHeader } from '@/components';
import { MonthlySummaryCard, useAnalytics } from '@/features/analytics';
import { useAuth } from '@/features/auth';
import { useBudgets } from '@/features/budgets';
import { displayNameOrEmail, useProfile } from '@/features/profile';
import {
  TransactionHistoryList,
  UndoSnackbar,
  useTransactions,
} from '@/features/transactions';
import { formatCurrency, useWallets } from '@/features/wallets';
import { TotalBalanceCard } from '@/features/wallets/components/total-balance-card';
import { WalletRow } from '@/features/wallets/components/wallet-row';
import { dictionaryFor, fill, localeTagFor, useLanguage } from '@/i18n';
import type { Language } from '@/i18n/locale';
import { colors, layout, radius, spacing, typography } from '@/theme';

function greeting(hour: number, lang: Language = 'id'): string {
  const copy = dictionaryFor(lang).dashboard.greeting;
  if (hour < 11) return copy.morning;
  if (hour < 15) return copy.afternoon;
  if (hour < 19) return copy.evening;
  return copy.night;
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
};

export default function DashboardScreen() {
  const { session } = useAuth();
  const { wallets, summary, loading, error: walletsError, refresh: refreshWallets } = useWallets();
  const { unreadCount, refresh: refreshBudgets, evaluateAndAlert } = useBudgets();
  const {
    monthly,
    monthlyLoading,
    refresh: refreshAnalytics,
  } = useAnalytics();
  const { avatarSignedUrl, profile } = useProfile();
  const {
    transactions,
    loading: loadingTransactions,
    loadingMore,
    hasMore,
    loadMore,
    lastDeleted,
    undoDelete,
    dismissUndo,
    error: transactionsError,
    refresh: refreshTransactions,
  } = useTransactions();
  const insets = useSafeAreaInsets();
  // C6: copy + date format follow the OS language (ADR-0008, R10).
  const language = useLanguage();
  const t = dictionaryFor(language);

  // Identity comes from the profile row (editable in Profile); a row still
  // carrying the seed default — or none at all — falls back to the email.
  const name = displayNameOrEmail(
    profile?.displayName,
    session?.user.email,
  );

  // The history list is the screen's outer scroller (a SectionList — nesting
  // it in a ScrollView would mount every row and defeat virtualization), so
  // the hero + wallets ride along as its header.
  const header = (
    <View>
      <AppHeader avatarUri={avatarSignedUrl} />

      <View style={styles.titleBlock}>
        <Text style={[typography.labelUppercase, styles.dateKicker]}>
          {new Date().toLocaleDateString(localeTagFor(language), DATE_FORMAT)}
        </Text>
        <View style={styles.titleRow}>
          <Text
            style={[typography.headlineMd, styles.name]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {greeting(new Date().getHours(), language)}, {name}
          </Text>
          <Pressable
            testID="dashboard-alerts"
            accessibilityRole="button"
            accessibilityLabel={
              unreadCount > 0
                ? fill(t.dashboard.notif.unread, { count: unreadCount })
                : t.dashboard.notif.open
            }
            onPress={() => router.push('/notifications')}
            style={styles.iconButton}
          >
            <MaterialIcons
              name={
                unreadCount > 0
                  ? 'notifications-active'
                  : 'notifications-none'
              }
              size={22}
              color={
                unreadCount > 0
                  ? colors.accent
                  : colors.textSecondary
              }
            />
            {unreadCount > 0 ? (
              <View style={styles.alertDot} />
            ) : null}
          </Pressable>
        </View>
      </View>

      <TotalBalanceCard
        total={summary.totalBalance}
        walletCount={summary.count}
        loading={loading}
      />

      <View style={styles.section}>
        <SectionHeader
          testID="dashboard-wallets"
          title={t.dashboard.wallets.title}
          actionLabel={t.dashboard.wallets.manage}
          onAction={() => router.push('/wallets')}
        />

        {walletsError && wallets.length === 0 && !loading ? (
          <ErrorStateCard
            testID="dashboard-wallets-error"
            message={walletsError}
            onRetry={() => void refreshWallets()}
          />
        ) : wallets.length === 0 && !loading ? (
          <EmptyStateCard
            icon="account-balance-wallet"
            title={t.dashboard.wallets.emptyTitle}
            description={t.dashboard.wallets.emptyBody}
            actionLabel={t.dashboard.wallets.emptyAction}
            onAction={() => router.push('/wallet-form')}
          />
        ) : (
          wallets
            .slice(0, 3)
            .map((wallet) => (
              <WalletRow
                key={wallet.id}
                testID={`dashboard-wallet-${wallet.id}`}
                wallet={wallet}
                onPress={() =>
                  router.push({
                    pathname: '/wallet-form',
                    params: { id: wallet.id },
                  })
                }
              />
            ))
        )}

        {wallets.length > 3 ? (
          <Text style={[typography.bodySm, styles.meta]}>
            {fill(t.dashboard.wallets.moreRest, {
              rest: wallets.length - 3,
              amount: formatCurrency(summary.totalBalance),
            })}
          </Text>
        ) : null}
      </View>

      <View style={styles.section}>
        <MonthlySummaryCard
          summary={monthly}
          loading={monthlyLoading}
          onPress={() => router.push('/(tabs)/analytics')}
        />
      </View>

      <View style={styles.rule} />

      <View style={styles.section}>
        <SectionHeader
          testID="dashboard-history"
          title={t.dashboard.history.title}
          actionLabel={t.dashboard.history.search}
          onAction={() => router.push('/search')}
        />
      </View>
    </View>
  );

  return (
    <Screen>
      <TransactionHistoryList
        transactions={transactions}
        loading={loadingTransactions}
        loadingMore={loadingMore}
        hasMore={hasMore}
        onEndReached={() => {
          if (hasMore && !loadingMore) void loadMore();
        }}
        listError={
          transactionsError && !loadingTransactions
            ? {
                message: transactionsError,
                onRetry: () => void refreshTransactions(),
              }
            : null
        }
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + spacing.xl },
        ]}
        ListHeaderComponent={header}
        onPressTransaction={(transaction) =>
          router.push({
            pathname: '/add-transaction',
            params: { id: transaction.id },
          })
        }
      />

      <UndoSnackbar
        snack={lastDeleted}
        // A restore resurrects amounts everywhere: history (handled inside
        // `undoDelete`), balances, Spent and the Insight overview all re-read.
        // A restore can also push a category back over a threshold, so the
        // budgets re-evaluate too (fresh server read — V6). Best-effort —
        // the restore itself already committed.
        onUndo={() =>
          void undoDelete().then(() =>
            Promise.all([
              refreshWallets().catch(() => undefined),
              refreshBudgets().catch(() => undefined),
              refreshAnalytics().catch(() => undefined),
            ]).then(() =>
              evaluateAndAlert({ userId: session?.user.id ?? '' }).catch(
                () => [],
              ),
            ),
          )
        }
        onDismiss={dismissUndo}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    // paddingBottom delegated to Screen
  },
  titleBlock: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  dateKicker: {
    color: colors.textSecondary,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  name: {
    flex: 1,
    color: colors.textPrimary,
  },
  iconButton: {
    width: layout.minTapTarget,
    height: layout.minTapTarget,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  alertDot: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  section: {
    marginTop: spacing.xl,
  },
  // Hairline between the monthly summary and the history (owner review A3).
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginTop: spacing.xl,
  },
  meta: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
  },
});