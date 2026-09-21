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
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyStateCard, AppHeader, Screen, SectionHeader } from '@/components';
import { useAnalytics } from '@/features/analytics';
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
import { colors, layout, radius, spacing, typography } from '@/theme';

function greeting(hour: number): string {
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 19) return 'Selamat sore';
  return 'Selamat malam';
}

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
};

export default function DashboardScreen() {
  const { session } = useAuth();
  const { wallets, summary, loading, refresh: refreshWallets } = useWallets();
  const { recentAlerts, refresh: refreshBudgets } = useBudgets();
  const { refresh: refreshAnalytics } = useAnalytics();
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
  } = useTransactions();
  const insets = useSafeAreaInsets();

  // Identity comes from the profile row (editable in Profile); a row still
  // carrying the seed default — or none at all — falls back to the email.
  const name = displayNameOrEmail(
    profile?.displayName,
    session?.user.email,
  );

  return (
    <Screen>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[
          styles.body,
          { paddingTop: insets.top + spacing.xl },
        ]}
        showsVerticalScrollIndicator={false}
        onScroll={({ nativeEvent }) => {
          const { layoutMeasurement, contentOffset, contentSize } = nativeEvent;
          const distanceFromBottom =
            contentSize.height - (contentOffset.y + layoutMeasurement.height);
          // 240px lead so the next page is usually already there when the user
          // arrives at the bottom. `loadMore` itself guards against double-fire.
          if (distanceFromBottom < 240) void loadMore();
        }}
        scrollEventThrottle={16}
      >
        <AppHeader avatarUri={avatarSignedUrl} />

        <View style={styles.titleBlock}>
          <Text style={[typography.labelUppercase, styles.dateKicker]}>
            {new Date().toLocaleDateString('id-ID', DATE_FORMAT)}
          </Text>
          <View style={styles.titleRow}>
            <Text
              style={[typography.headlineMd, styles.name]}
              numberOfLines={1}
              adjustsFontSizeToFit
            >
              {greeting(new Date().getHours())}, {name}
            </Text>
            <Pressable
              testID="dashboard-alerts"
              accessibilityRole="button"
              accessibilityLabel={
                recentAlerts.length > 0
                  ? `${recentAlerts.length} notifikasi budget, buka Budgets`
                  : 'Buka Budgets'
              }
              onPress={() => router.push('/(tabs)/budgets')}
              style={styles.iconButton}
            >
              <MaterialIcons
                name={
                  recentAlerts.length > 0
                    ? 'notifications-active'
                    : 'notifications-none'
                }
                size={22}
                color={
                  recentAlerts.length > 0
                    ? colors.accent
                    : colors.textSecondary
                }
              />
              {recentAlerts.length > 0 ? (
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
            title="Dompet"
            actionLabel="Kelola"
            onAction={() => router.push('/wallets')}
          />

          {wallets.length === 0 && !loading ? (
            <EmptyStateCard
              icon="account-balance-wallet"
              title="Dompet kosong"
              description="Tambahkan dompet pertama Anda untuk mulai mencatat arus kas."
              actionLabel="Tambah Dompet"
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
              +{wallets.length - 3} wallet lain · total{' '}
              {formatCurrency(summary.totalBalance)}
            </Text>
          ) : null}
        </View>

        <View style={styles.section}>
          <SectionHeader
            testID="dashboard-history"
            title="Riwayat"
            actionLabel={
              transactions.length > 0
                ? `${transactions.length} transaksi`
                : undefined
            }
          />

          {loadingTransactions && transactions.length === 0 ? (
            <Text style={[typography.bodyMd, styles.empty]}>Memuat riwayat…</Text>
          ) : (
            <TransactionHistoryList
              transactions={transactions}
              loadingMore={loadingMore}
              hasMore={hasMore}
              onPressTransaction={(transaction) =>
                router.push({
                  pathname: '/add-transaction',
                  params: { id: transaction.id },
                })
              }
            />
          )}
        </View>
      </ScrollView>

      <UndoSnackbar
        snack={lastDeleted}
        // A restore resurrects amounts everywhere: history (handled inside
        // `undoDelete`), balances, Spent and the Insight overview all re-read.
        // Best-effort — the restore itself already committed.
        onUndo={() =>
          void undoDelete().then(() =>
            Promise.all([
              refreshWallets().catch(() => undefined),
              refreshBudgets().catch(() => undefined),
              refreshAnalytics().catch(() => undefined),
            ]),
          )
        }
        onDismiss={dismissUndo}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
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
  empty: {
    color: colors.textSecondary,
  },
  meta: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
  },
});