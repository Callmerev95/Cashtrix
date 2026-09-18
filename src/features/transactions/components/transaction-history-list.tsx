/**
 * Dashboard history list (AC #25).
 *
 * Powered by the transactions context: rows are already `occurred_at desc`
 * from the DB, `groupByDay` only inserts the `label-uppercase` day dividers
 * without re-sorting (so the list and the paging offset cannot disagree).
 * `onEndReached` asks for the next page; the footer shows the spinner only
 * while another page is genuinely in flight.
 */
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';

import { EmptyStateCard } from '@/components/empty-state-card';
import { colors, spacing, typography } from '@/theme';

import { groupByDay, type Transaction } from '../domain';
import { TransactionRow } from './transaction-row';

export function TransactionHistoryList({
  transactions,
  loadingMore,
  hasMore,
  onPressTransaction,
  emptyLabel = 'Belum ada riwayat transaksi.',
  testID = 'transaction-history',
}: {
  transactions: Transaction[];
  loadingMore?: boolean;
  hasMore?: boolean;
  onPressTransaction?: (transaction: Transaction) => void;
  emptyLabel?: string;
  testID?: string;
}) {
  if (transactions.length === 0) {
    return (
      <EmptyStateCard
        testID={`${testID}-empty`}
        icon="receipt-long"
        title="Tidak ada transaksi"
        description={emptyLabel}
        actionLabel="Catat Transaksi"
        onAction={() => router.push('/add-transaction')}
      />
    );
  }

  const groups = groupByDay(transactions);

  return (
    <View testID={testID}>
      {groups.map((group) => (
        <View key={group.key} style={styles.group}>
          <Text style={[typography.labelUppercase, styles.divider]}>
            {group.label}
          </Text>
          {group.transactions.map((transaction) => (
            <TransactionRow
              key={transaction.id}
              testID={`transaction-${transaction.id}`}
              transaction={transaction}
              onPress={
                onPressTransaction
                  ? () => onPressTransaction(transaction)
                  : undefined
              }
            />
          ))}
        </View>
      ))}

      {loadingMore ? (
        <View testID={`${testID}-loading-more`} style={styles.footer}>
          <ActivityIndicator color={colors.accent} />
        </View>
      ) : hasMore ? null : (
        <Text style={[typography.bodySm, styles.footerLabel]}>Akhir riwayat</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  group: {
    marginTop: spacing.md,
  },
  divider: {
    marginBottom: spacing.xs,
    color: colors.textSecondary,
  },
  empty: {
    paddingVertical: spacing.md,
    color: colors.textSecondary,
  },
  footer: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
  },
  footerLabel: {
    paddingVertical: spacing.lg,
    textAlign: 'center',
    color: colors.textSecondary,
  },
});
