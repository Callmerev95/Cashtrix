/**
 * Recurring rule manager (route `/recurring`, V3 issue #32).
 *
 * Thin renderer over `useRecurring()`: one card per rule (category +
 * wallet + due + window + status) with pause/resume, edit and delete.
 * A banner surfaces rules auto-paused by a wallet archive, so a bill never
 * fails silently (AC V3). Births themselves happen in the provider's
 * catch-up — this screen never invents occurrences.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Card, PrimaryButton, Screen } from '@/components';
import {
  dueLabel,
  formatRuleWindow,
  statusLabel,
  useRecurring,
  type RecurringRule,
} from '@/features/recurring';
import { formatGrouped } from '@/features/transactions';
import { colors, layout, radius, spacing, typography } from '@/theme';

export default function RecurringScreen() {
  const { rules, loading, error, refresh, setPaused, remove } = useRecurring();
  const [busyId, setBusyId] = useState<string | null>(null);

  const archivedPauses = useMemo(
    () => rules.filter((rule) => rule.status === 'paused' && rule.walletArchived),
    [rules],
  );

  async function togglePause(rule: RecurringRule) {
    if (busyId) return;
    setBusyId(rule.id);
    try {
      await setPaused({ id: rule.id, paused: rule.status !== 'paused' });
    } catch (cause) {
      Alert.alert(
        'Gagal mengubah status',
        cause instanceof Error ? cause.message : 'Coba lagi sebentar lagi.',
      );
    } finally {
      setBusyId(null);
    }
  }

  function confirmDelete(rule: RecurringRule) {
    Alert.alert(
      `Hapus aturan "${rule.categoryName}"?`,
      'Transaksi yang sudah tercatat tetap tersimpan sebagai transaksi biasa.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: () => void destroy(rule),
        },
      ],
    );
  }

  async function destroy(rule: RecurringRule) {
    if (busyId) return;
    setBusyId(rule.id);
    try {
      await remove(rule.id);
    } catch (cause) {
      Alert.alert(
        'Gagal menghapus',
        cause instanceof Error ? cause.message : 'Coba lagi sebentar lagi.',
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen style={styles.frame} testID="recurring-screen">
      <View style={styles.header}>
        <Text style={[typography.labelUppercase, styles.kicker]}>
          Otomatisasi
        </Text>
        <Text style={[typography.headlineLg, styles.title]}>
          Transaksi berulang
        </Text>
      </View>

      <ScrollView
        testID="recurring-scroll"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {loading ? (
          <View testID="recurring-loading" style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text testID="recurring-error" style={[typography.bodyMd, styles.errorText]}>
              {error}
            </Text>
            <PrimaryButton label="Coba lagi" onPress={() => void refresh()} />
          </View>
        ) : (
          <>
            {archivedPauses.length > 0 ? (
              <Card testID="recurring-archive-banner" style={styles.banner}>
                <MaterialIcons
                  name="pause-circle-outline"
                  size={20}
                  color={colors.accent}
                />
                <View style={styles.bannerBody}>
                  <Text style={[typography.bodyMd, styles.bannerTitle]}>
                    {archivedPauses.length} aturan dijeda
                  </Text>
                  <Text style={[typography.bodySm, styles.bannerSubtitle]}>
                    Dompetnya diarsipkan — buka arsip dompet atau pilih dompet
                    lain agar tagihan jalan lagi.
                  </Text>
                </View>
              </Card>
            ) : null}
            {rules.length === 0 ? (
              <Text style={[typography.bodyMd, styles.empty]}>
                Belum ada aturan. Buat satu untuk gaji atau tagihan yang datang
                tiap bulan — occurrence-nya lahir otomatis saat app dibuka.
              </Text>
            ) : (
              rules.map((rule) => (
                <RuleRow
                  key={rule.id}
                  rule={rule}
                  busy={busyId === rule.id}
                  onToggle={() => void togglePause(rule)}
                  onEdit={() =>
                    router.push({
                      pathname: '/recurring-form',
                      params: { id: rule.id },
                    })
                  }
                  onDelete={() => confirmDelete(rule)}
                />
              ))
            )}
            <PrimaryButton
              testID="recurring-add"
              label="Buat aturan"
              onPress={() => router.push('/recurring-form')}
            />
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function RuleRow({
  rule,
  busy,
  onToggle,
  onEdit,
  onDelete,
}: {
  rule: RecurringRule;
  busy: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const paused = rule.status === 'paused';
  return (
    <Card style={[styles.card, paused && styles.cardPaused]}>
      <View style={styles.iconWell}>
        <MaterialIcons
          name={rule.categoryIcon as never}
          size={20}
          color={paused ? colors.textSecondary : colors.accent}
        />
      </View>
      <View style={styles.cardBody}>
        <Text style={[typography.bodyMd, styles.cardTitle]} numberOfLines={1}>
          {rule.categoryName} · Rp {formatGrouped(rule.amount)}
        </Text>
        <Text style={[typography.bodySm, styles.cardMeta]} numberOfLines={2}>
          {rule.kind === 'expense' ? 'Pengeluaran' : 'Pemasukan'} ·{' '}
          {rule.walletName} · {dueLabel(rule.dueDay, rule.dueLast)}
        </Text>
        <Text style={[typography.bodySm, styles.cardMeta]} numberOfLines={1}>
          {formatRuleWindow(rule.startsOn, rule.endsOn)} ·{' '}
          {statusLabel(rule.status)}
          {rule.walletArchived ? ' · dompet diarsipkan' : ''}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <View style={styles.actions}>
          <Pressable
            testID={`recurring-edit-${rule.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Ubah aturan ${rule.categoryName}`}
            onPress={onEdit}
            hitSlop={12}
          >
            <MaterialIcons name="edit" size={20} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            testID={`recurring-pause-${rule.id}`}
            accessibilityRole="button"
            accessibilityLabel={
              paused
                ? `Lanjutkan aturan ${rule.categoryName}`
                : `Jeda aturan ${rule.categoryName}`
            }
            onPress={onToggle}
            hitSlop={12}
          >
            <MaterialIcons
              name={paused ? 'play-arrow' : 'pause'}
              size={20}
              color={colors.textSecondary}
            />
          </Pressable>
          <Pressable
            testID={`recurring-delete-${rule.id}`}
            accessibilityRole="button"
            accessibilityLabel={`Hapus aturan ${rule.categoryName}`}
            onPress={onDelete}
            hitSlop={12}
          >
            <MaterialIcons name="delete-outline" size={20} color={colors.error} />
          </Pressable>
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  frame: {
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  header: {
    gap: spacing.xs,
  },
  kicker: {
    color: colors.textSecondary,
  },
  title: {
    color: colors.textPrimary,
  },
  content: {
    gap: spacing.sm,
    paddingBottom: layout.navClearance,
  },
  center: {
    gap: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  errorText: {
    color: colors.error,
    textAlign: 'center',
  },
  empty: {
    color: colors.textSecondary,
  },
  banner: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
    alignItems: 'flex-start',
  },
  bannerBody: {
    flex: 1,
    gap: 2,
  },
  bannerTitle: {
    color: colors.textPrimary,
  },
  bannerSubtitle: {
    color: colors.textSecondary,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  cardPaused: {
    opacity: 0.6,
  },
  iconWell: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    color: colors.textPrimary,
  },
  cardMeta: {
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
});
