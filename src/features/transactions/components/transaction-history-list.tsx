/**
 * Dashboard history list (AC #25).
 *
 * A `SectionList` (React Native core — no new native module, same rule as the
 * T6 donut / T7 ring / V5 calendar): day groups from `groupByDay` are the
 * sections, so only visible rows mount no matter how far the history pages.
 * The rows arrive `occurred_at desc` from the DB and are never re-sorted, so
 * the list and the paging cursor cannot disagree.
 *
 * The Dashboard renders this list as its *outer* scroller (hero + wallets go
 * in `ListHeaderComponent`): a `SectionList` nested in a `ScrollView` would
 * mount everything and defeat virtualization. Day dividers are sticky with a
 * solid backing so rows never show through underneath.
 *
 * `onEndReached` asks for the next page; the footer shows the spinner only
 * while another page is genuinely in flight.
 */
import { useMemo } from 'react';
import {
  ActivityIndicator,
  SectionList,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { router } from 'expo-router';

import { EmptyStateCard } from '@/components/empty-state-card';
import { ErrorStateCard } from '@/components/error-state-card';
import { colors, spacing, typography } from '@/theme';

import { groupByDay, type Transaction } from '../domain';
import { TransactionRow } from './transaction-row';

export function TransactionHistoryList({
  transactions,
  loading,
  loadingMore,
  hasMore,
  onEndReached,
  onPressTransaction,
  ListHeaderComponent,
  contentContainerStyle,
  emptyLabel = 'Belum ada riwayat transaksi.',
  testID = 'transaction-history',
  selecting = false,
  selectedIds = [],
  listError = null,
}: {
  transactions: Transaction[];
  loading?: boolean;
  loadingMore?: boolean;
  hasMore?: boolean;
  onEndReached?: () => void;
  onPressTransaction?: (transaction: Transaction) => void;
  ListHeaderComponent?: React.ComponentType | React.ReactElement | null;
  contentContainerStyle?: StyleProp<ViewStyle>;
  emptyLabel?: string;
  testID?: string;
  /** A4 select mode: rows render check circles; transfers render dimmed. */
  selecting?: boolean;
  selectedIds?: string[];
  /** D4: empty-because-error renders retry instead of the "Catat" card. */
  listError?: { message: string; onRetry: () => void } | null;
}) {
  const sections = useMemo(
    () =>
      groupByDay(transactions).map((group) => ({
        key: group.key,
        title: group.label,
        data: group.transactions,
      })),
    [transactions],
  );

  return (
    <SectionList
      testID={testID}
      sections={sections}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <TransactionRow
          key={item.id}
          testID={`transaction-${item.id}`}
          transaction={item}
          selecting={selecting}
          selected={selectedIds.includes(item.id)}
          dimmed={selecting && item.type === 'transfer'}
          onPress={
            onPressTransaction ? () => onPressTransaction(item) : undefined
          }
        />
      )}
      renderSectionHeader={({ section }) => (
        <View style={styles.dividerWrap}>
          {/* No rule above the first group: the section header (Riwayat /
              search controls) already carries the divider above it. */}
          {section.key === sections[0]?.key ? null : (
            <View style={styles.rule} />
          )}
          <Text
            testID={`${testID}-day-${section.key}`}
            style={[typography.labelUppercase, styles.divider]}
          >
            {section.title}
          </Text>
        </View>
      )}
      stickySectionHeadersEnabled
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={
        loading ? (
          <Text style={[typography.bodyMd, styles.empty]}>Memuat riwayat…</Text>
        ) : listError ? (
          <ErrorStateCard
            testID={`${testID}-error`}
            message={listError.message}
            onRetry={listError.onRetry}
          />
        ) : (
          <EmptyStateCard
            testID={`${testID}-empty`}
            icon="receipt-long"
            title="Tidak ada transaksi"
            description={emptyLabel}
            actionLabel="Catat Transaksi"
            onAction={() => router.push('/add-transaction')}
          />
        )
      }
      ListFooterComponent={
        loadingMore ? (
          <View testID={`${testID}-loading-more`} style={styles.footer}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : hasMore || transactions.length === 0 ? null : (
          <Text style={[typography.bodySm, styles.footerLabel]}>
            Akhir riwayat
          </Text>
        )
      }
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={contentContainerStyle}
      scrollEventThrottle={16}
    />
  );
}

const styles = StyleSheet.create({
  dividerWrap: {
    backgroundColor: colors.background,
    paddingTop: spacing.md,
  },
  // Hairline separating one day group from the previous (owner review A3:
  // the kicker alone did not read as a boundary on device).
  rule: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
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
