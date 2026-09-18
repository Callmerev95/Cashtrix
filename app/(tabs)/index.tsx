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

import { EmptyStateCard, Screen } from '@/components';
import { useAuth } from '@/features/auth';
import { TransactionHistoryList, useTransactions } from '@/features/transactions';
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

export default function DashboardScreen() {
  const { session } = useAuth();
  const { wallets, summary, loading } = useWallets();
  const {
    transactions,
    loading: loadingTransactions,
    loadingMore,
    hasMore,
    loadMore,
  } = useTransactions();
  const insets = useSafeAreaInsets();

  const name = (session?.user.user_metadata?.display_name as string | undefined) ??
    session?.user.email?.split('@')[0] ??
    'Pengguna';

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
        <View style={styles.header}>
          <View>
            <Text style={[typography.bodyMd, styles.greeting]}>
              {greeting(new Date().getHours())}
            </Text>
            <Text
              style={[typography.headlineLg, styles.name]}
              numberOfLines={1}
            >
              {name}
            </Text>
          </View>
          <Pressable
            testID="manage-wallets"
            accessibilityRole="button"
            accessibilityLabel="Kelola wallet"
            onPress={() => router.push('/wallets')}
            style={styles.iconButton}
          >
            <MaterialIcons
              name="account-balance-wallet"
              size={24}
              color={colors.accent}
            />
          </Pressable>
        </View>

        <TotalBalanceCard
          total={summary.totalBalance}
          walletCount={summary.count}
          loading={loading}
        />

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[typography.labelUppercase, styles.kicker]}>
              Dompet
            </Text>
            <Pressable
              testID="see-all-wallets"
              accessibilityRole="button"
              accessibilityLabel="Lihat semua wallet"
              onPress={() => router.push('/wallets')}
              hitSlop={spacing.sm}
            >
              <Text style={[typography.bodySm, styles.link]}>Kelola</Text>
            </Pressable>
          </View>

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
          <View style={styles.sectionHeader}>
            <Text style={[typography.labelUppercase, styles.kicker]}>
              Riwayat
            </Text>
            {transactions.length > 0 ? (
              <Text style={[typography.bodySm, styles.metaInline]}>
                {transactions.length} transaksi
              </Text>
            ) : null}
          </View>

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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  greeting: {
    color: colors.textSecondary,
  },
  name: {
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
  section: {
    marginTop: spacing.xl,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  kicker: {
    color: colors.textSecondary,
  },
  link: {
    color: colors.accent,
  },
  empty: {
    color: colors.textSecondary,
  },
  meta: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
  },
  metaInline: {
    color: colors.textSecondary,
  },
});