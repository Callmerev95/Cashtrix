/**
 * Wallets screen (route `/wallets`) — manage every source of funds.
 *
 * Per PRD §2.3 Epic B / AC #5:
 *  - 0 transactions → delete directly (with a destructive confirmation).
 *  - has transactions → offer bulk reassignment in the sheet below; the DB
 *    would refuse the delete anyway (`on delete restrict`), so the offer is
 *    made *before* the user hits a wall.
 *  - create is blocked once 10 wallets exist (the DB enforces it too).
 */
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, GhostButton, PrimaryButton, Screen } from '@/components';
import { useAnalytics } from '@/features/analytics';
import {
  MAX_WALLETS,
  deleteWallet,
  formatCurrency,
  reassignAndDeleteWallet,
  setWalletArchived,
  useWallets,
  walletTypeMeta,
  type Wallet,
} from '@/features/wallets';
import { WalletRow } from '@/features/wallets/components/wallet-row';
import { colors, layout, radius, spacing, typography } from '@/theme';

export default function WalletsScreen() {
  const { wallets, archivedWallets, summary, loading, error, refresh } =
    useWallets();
  const { refresh: refreshAnalytics } = useAnalytics();
  const insets = useSafeAreaInsets();

  /** Wallet queued for deletion; non-null opens the reassignment sheet. */
  const [pendingDelete, setPendingDelete] = useState<Wallet | null>(null);
  const [busy, setBusy] = useState(false);

  async function removeEmptyWallet(wallet: Wallet) {
    setBusy(true);
    try {
      await deleteWallet(wallet.id);
      await refresh();
    } catch (cause) {
      Alert.alert(
        'Gagal menghapus dompet',
        cause instanceof Error ? cause.message : 'Coba lagi sebentar lagi.',
      );
    } finally {
      setBusy(false);
    }
  }

  function onDeletePress(wallet: Wallet) {
    if (wallet.transactionCount === 0) {
      Alert.alert(
        'Hapus dompet?',
        `"${wallet.name}" tidak punya transaksi dan akan dihapus permanen.`,
        [
          { text: 'Batal', style: 'cancel' },
          {
            text: 'Hapus',
            style: 'destructive',
            onPress: () => void removeEmptyWallet(wallet),
          },
        ],
      );
      return;
    }

    setPendingDelete(wallet);
  }

  async function archiveWallet(wallet: Wallet, archived: boolean) {
    setBusy(true);
    try {
      await setWalletArchived(wallet.id, archived);
      await refresh();
      Alert.alert(
        archived ? 'Dompet diarsipkan' : 'Dompet dibuka dari arsip',
        archived
          ? `"${wallet.name}" disembunyikan dari Dashboard dan transaksi baru. Riwayatnya tetap tersimpan.`
          : `"${wallet.name}" kembali tersedia.`,
      );
    } catch (cause) {
      Alert.alert(
        'Gagal mengubah dompet',
        cause instanceof Error ? cause.message : 'Coba lagi sebentar lagi.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function reassignTo(target: Wallet) {
    if (!pendingDelete) return;
    setBusy(true);
    try {
      const moved = await reassignAndDeleteWallet({
        fromWalletId: pendingDelete.id,
        toWalletId: target.id,
      });
      setPendingDelete(null);
      await refresh();
      // Rows changed wallets, so per-wallet Insight filters re-read too.
      // Best-effort: the move already committed.
      await refreshAnalytics().catch(() => undefined);
      Alert.alert('Selesai', `${moved} transaksi dipindahkan ke ${target.name}.`);
    } catch (cause) {
      Alert.alert(
        'Gagal memindahkan transaksi',
        cause instanceof Error ? cause.message : 'Coba lagi sebentar lagi.',
      );
    } finally {
      setBusy(false);
    }
  }

  const totalLabel = formatCurrency(summary.totalBalance);

  return (
    <Screen>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.body, { paddingTop: insets.top + spacing.xl }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.headerRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Kembali"
            onPress={() => router.back()}
            style={styles.back}
          >
            <MaterialIcons name="arrow-back" size={24} color={colors.textSecondary} />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={[typography.labelUppercase, styles.kicker]}>Kelola</Text>
            <Text style={[typography.headlineLg, styles.title]}>Dompet</Text>
          </View>
        </View>

        <Card style={styles.summaryCard}>
          <Text style={[typography.labelUppercase, styles.kicker]}>
            Total Saldo
          </Text>
          <Text style={[typography.currencyDisplay, styles.total]} numberOfLines={1}>
            {loading ? '—' : totalLabel}
          </Text>
          <Text style={[typography.bodySm, styles.meta]}>
            {summary.count} dari {MAX_WALLETS} dompet
          </Text>
        </Card>

        {error ? (
          <Text style={[typography.bodySm, styles.error]}>{error}</Text>
        ) : null}

        <View style={styles.list}>
          {wallets.length === 0 && !loading ? (
            <Text style={[typography.bodyMd, styles.empty]}>
              Belum ada dompet. Buat dompet pertama Anda untuk mulai mencatat.
            </Text>
          ) : (
            wallets.map((wallet) => (
              <WalletRow
                key={wallet.id}
                testID={`wallet-row-${wallet.id}`}
                wallet={wallet}
                onPress={() =>
                  router.push({
                    pathname: '/wallet-form',
                    params: { id: wallet.id },
                  })
                }
                trailing={
                  <View style={styles.rowActions}>
                    <Pressable
                      testID={`wallet-archive-${wallet.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Arsipkan ${wallet.name}`}
                      disabled={busy}
                      hitSlop={spacing.sm}
                      onPress={() =>
                        Alert.alert(
                          'Arsipkan dompet?',
                          `"${wallet.name}" disembunyikan dari Dashboard dan picker. Riwayat transaksi tetap ada.`,
                          [
                            { text: 'Batal', style: 'cancel' },
                            {
                              text: 'Arsipkan',
                              onPress: () => void archiveWallet(wallet, true),
                            },
                          ],
                        )
                      }
                      style={styles.deleteButton}
                    >
                      <MaterialIcons
                        name="archive"
                        size={20}
                        color={colors.textSecondary}
                      />
                    </Pressable>
                    <Pressable
                      testID={`wallet-delete-${wallet.id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`Hapus ${wallet.name}`}
                      disabled={busy}
                      hitSlop={spacing.sm}
                      onPress={() => onDeletePress(wallet)}
                      style={styles.deleteButton}
                    >
                      <MaterialIcons
                        name="delete-outline"
                        size={20}
                        color={colors.textSecondary}
                      />
                    </Pressable>
                  </View>
                }
              />
            ))
          )}
        </View>

        {archivedWallets.length > 0 ? (
          <View style={styles.archivedSection}>
            <Text style={[typography.labelUppercase, styles.kicker]}>
              Arsip
            </Text>
            {archivedWallets.map((wallet) => (
              <WalletRow
                key={wallet.id}
                testID={`wallet-archived-${wallet.id}`}
                wallet={wallet}
                trailing={
                  <Pressable
                    testID={`wallet-unarchive-${wallet.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Buka arsip ${wallet.name}`}
                    disabled={busy}
                    hitSlop={spacing.sm}
                    onPress={() => void archiveWallet(wallet, false)}
                    style={styles.deleteButton}
                  >
                    <MaterialIcons
                      name="unarchive"
                      size={20}
                      color={colors.accent}
                    />
                  </Pressable>
                }
              />
            ))}
          </View>
        ) : null}

        <View style={styles.actions}>
          <PrimaryButton
            testID="add-wallet"
            label={
              summary.remainingSlots > 0
                ? 'Tambah Dompet'
                : `Maksimal ${MAX_WALLETS} dompet`
            }
            disabled={summary.remainingSlots <= 0}
            onPress={() => router.push('/wallet-form')}
          />
          <GhostButton label="Kembali" onPress={() => router.back()} />
        </View>
      </ScrollView>

      {pendingDelete ? (
        <View style={styles.sheet} testID="reassign-sheet">
          <View style={styles.sheetCard}>
            <Text style={[typography.headlineSm, styles.sheetTitle]}>
              Pindahkan transaksi {pendingDelete.name}
            </Text>
            <Text style={[typography.bodySm, styles.sheetBody]}>
              Dompet ini punya {pendingDelete.transactionCount} transaksi. Pilih
              dompet tujuan, lalu dompet ini dihapus.
            </Text>

            <View style={styles.sheetList}>
              {wallets
                .filter((wallet) => wallet.id !== pendingDelete.id)
                .map((wallet) => (
                  <Pressable
                    key={wallet.id}
                    testID={`reassign-target-${wallet.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={`Pindahkan ke ${wallet.name}`}
                    disabled={busy}
                    onPress={() => void reassignTo(wallet)}
                    style={({ pressed }) => [
                      styles.targetRow,
                      pressed && styles.pressed,
                    ]}
                  >
                    <View style={styles.targetIcon}>
                      <MaterialIcons
                        name="account-balance-wallet"
                        size={18}
                        color={colors.accent}
                      />
                    </View>
                    <View style={styles.targetText}>
                      <Text style={[typography.bodyMd, styles.targetName]}>
                        {wallet.name}
                      </Text>
                      <Text style={[typography.bodySm, styles.meta]}>
                        {walletTypeMeta[wallet.type].label} ·{' '}
                        {formatCurrency(wallet.balance)}
                      </Text>
                    </View>
                    <MaterialIcons
                      name="chevron-right"
                      size={20}
                      color={colors.textSecondary}
                    />
                  </Pressable>
                ))}
              {wallets.length <= 1 ? (
                <Text style={[typography.bodySm, styles.empty]}>
                  Tidak ada dompet lain. Buat dompet baru dulu untuk memindahkan
                  transaksi.
                </Text>
              ) : null}
            </View>

            <View style={styles.sheetActions}>
              <PrimaryButton
                testID="add-wallet-from-sheet"
                label="Dompet baru"
                onPress={() => {
                  setPendingDelete(null);
                  router.push('/wallet-form');
                }}
              />
              <GhostButton
                testID="reassign-cancel"
                label="Batal"
                onPress={() => setPendingDelete(null)}
              />
            </View>
          </View>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  body: {
    paddingBottom: layout.navClearance,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  back: {
    width: layout.minTapTarget,
    height: layout.minTapTarget,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    gap: spacing.xs / 2,
  },
  kicker: {
    color: colors.textSecondary,
  },
  title: {
    color: colors.textPrimary,
  },
  summaryCard: {
    marginTop: spacing.lg,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  total: {
    color: colors.textPrimary,
  },
  meta: {
    color: colors.textSecondary,
  },
  error: {
    marginTop: spacing.md,
    color: colors.error,
  },
  list: {
    marginTop: spacing.lg,
  },
  rowActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  archivedSection: {
    marginTop: spacing.xl,
    gap: spacing.xs,
  },
  empty: {
    color: colors.textSecondary,
  },
  deleteButton: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  sheet: {
    ...StyleSheet.absoluteFill,
    backgroundColor: colors.scrim,
    justifyContent: 'flex-end',
  },
  sheetCard: {
    padding: spacing.lg,
    backgroundColor: colors.surfaceCard,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    gap: spacing.sm,
  },
  sheetTitle: {
    color: colors.textPrimary,
  },
  sheetBody: {
    color: colors.textSecondary,
  },
  sheetList: {
    marginTop: spacing.sm,
  },
  targetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  pressed: {
    opacity: 0.7,
  },
  targetIcon: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  targetText: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  targetName: {
    color: colors.textPrimary,
  },
  sheetActions: {
    marginTop: spacing.md,
    gap: spacing.xs,
  },
});
