/**
 * Add / Edit Transaction (route `/add-transaction`, presented as a modal).
 *
 * The whole point of this screen is speed (PRD KPI: <20 s to save), so:
 *  - the Expense/Income toggle restores the last choice and defaults to expense;
 *  - the amount field live-formats `id-ID` behind a static gold `Rp`;
 *  - the category grid switches with the toggle, so the right categories are
 *    always in front of the user;
 *  - the wallet defaults to the wallet of the last transaction;
 *  - the idempotency key is minted **once when the form opens**, so a retry
 *    after a dropped connection cannot double-post.
 *
 * `?id=` switches to edit mode (delete also lives here, as a destructive
 * confirm sheet).
 *
 * Date entry is a day stepper rather than a native date picker: MVP requires
 * "default now, never a future date" and a stepper delivers that with no extra
 * native module (which would force a dev-client rebuild). A calendar picker is
 * a v1.1 polish item.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GhostButton, Card, LogoMark, PrimaryButton, Screen, SectionHeader } from '@/components';
import { useAuth } from '@/features/auth';
import { useBudgets } from '@/features/budgets';
import { trackEvent, txCreatedEvent } from '@/features/observability';
import { useWallets } from '@/features/wallets';
import {
  AmountField,
  CategoryGrid,
  DeleteConfirmSheet,
  TypeSegmentedControl,
  categoriesForKind,
  formatAmountInput,
  formatDateDivider,
  isFutureDate,
  newIdempotencyKey,
  normalizeNote,
  toDateKey,
  useTransactions,
  validateAmount,
  type Transaction,
  type TransactionType,
} from '@/features/transactions';
import { colors, layout, radius, spacing, typography } from '@/theme';

export default function AddTransactionScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const isEdit = Boolean(params.id);
  const insets = useSafeAreaInsets();

  const { session } = useAuth();
  const { refresh: refreshWallets } = useWallets();
  const { refresh: refreshBudgets, evaluateAndAlert } = useBudgets();
  const {
    categories,
    wallets,
    lastType,
    lastWalletId,
    loadTransaction,
    save,
    remove,
    rememberType,
    rememberWallet,
  } = useTransactions();

  // Minted once per form session (AC #22). A `useRef` (not state) so a re-render
  // never regenerates it, and `refresh()` after a save cannot change it.
  const idempotencyKey = useRef(newIdempotencyKey()).current;

  // Form state. Every "default" below is *derived during render* from the
  // context (remembered preference) plus an explicit user override, never
  // synced by an effect — a sync setState in an effect cascades renders, which
  // the lint rule bans and which would also stomp the user's edits when the
  // context refetches after a save.
  const [typeOverride, setTypeOverride] = useState<TransactionType | null>(null);
  const [walletChoice, setWalletChoice] = useState<string | null>(null);
  const [categoryChoice, setCategoryChoice] = useState<string | null>(null);
  const [amountRaw, setAmountRaw] = useState('');
  const [occurredAt, setOccurredAt] = useState(new Date());
  const [note, setNote] = useState('');
  const [amountError, setAmountError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Edit mode loads a row into `loaded` and the fields read from it until the
  // user starts typing (each override wins over `loaded`).
  const [loaded, setLoaded] = useState<Transaction | null>(null);

  const type: TransactionType =
    typeOverride ?? loaded?.type ?? lastType;

  // Wallet: explicit choice > the row being edited > the remembered last-used
  // wallet > the first available (so an empty picker can never block Save).
  const walletId =
    walletChoice ?? loaded?.walletId ?? lastWalletId ?? wallets[0]?.id ?? null;

  // Category: an explicit choice only counts while it belongs to the visible
  // `kind`; otherwise fall back to the edited row's category. Switching the
  // toggle and back never loses the pick because nothing is cleared.
  const categoryId = useMemo(() => {
    const chosen = categoryChoice ?? loaded?.categoryId ?? null;
    if (!chosen) return null;
    return categories.some(
      (category) => category.id === chosen && category.kind === type,
    )
      ? chosen
      : null;
  }, [categories, categoryChoice, loaded, type]);

  // Edit mode: fetch the row once; the effect only writes state in a promise
  // callback (an external system), never synchronously in the effect body.
  const [loadingExisting, setLoadingExisting] = useState(isEdit);
  useEffect(() => {
    if (!params.id) return;
    let cancelled = false;

    loadTransaction(params.id)
      .then((transaction: Transaction | null) => {
        if (cancelled) return;
        if (transaction) {
          setLoaded(transaction);
          setAmountRaw(formatAmountInput(String(transaction.amount)));
          setOccurredAt(new Date(transaction.occurredAt));
          setNote(transaction.note ?? '');
        }
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setFormError(
          cause instanceof Error ? cause.message : 'Gagal memuat transaksi',
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingExisting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadTransaction, params.id]);

  function onToggleType(next: TransactionType) {
    setTypeOverride(next);
    // Persist immediately: the preference must survive even if the user backs
    // out without saving (AC #15).
    void rememberType(next);
  }

  function changeDay(deltaDays: number) {
    const next = new Date(occurredAt);
    next.setDate(next.getDate() + deltaDays);
    if (isFutureDate(next)) return; // AC #19: never a future date
    setOccurredAt(next);
  }

  async function submit() {
    const amount = validateAmount(amountRaw);
    if (!amount.ok) {
      setAmountError(amount.error);
      return;
    }
    setAmountError(null);

    if (!walletId) {
      setFormError('Pilih wallet terlebih dahulu');
      return;
    }
    if (!categoryId) {
      setFormError('Pilih kategori terlebih dahulu');
      return;
    }
    if (isFutureDate(occurredAt)) {
      setFormError('Tanggal tidak boleh di masa depan');
      return;
    }

    setFormError(null);
    setBusy(true);

    try {
      await save({
        id: params.id,
        userId: session?.user.id ?? '',
        walletId,
        categoryId,
        type,
        amount: amount.value,
        occurredAt,
        note: normalizeNote(note),
        idempotencyKey,
      });

      // T10 (issue #11): `tx_created` carries only the kind + whether a note
      // exists (boolean, never the text or amount). Best-effort — a failure
      // here must not lose the saved transaction.
      try {
        trackEvent(
          txCreatedEvent({
            type,
            hasNote: normalizeNote(note) !== null,
          }),
        );
      } catch {
        // Analytics never blocks a save.
      }

      // Balances are a separate view owned by the wallet context; the save
      // changed the aggregate, so it must re-read before the Dashboard paints.
      // Budgets re-read too: a committed expense can push a category past its
      // threshold, and the alert must fire within seconds of the commit
      // (PRD §2.3 Epic E). Alert evaluation is best-effort — a failure here
      // must not lose the saved transaction.
      await refreshWallets();
      try {
        await refreshBudgets();
        await evaluateAndAlert({ userId: session?.user.id ?? '' });
      } catch {
        // In-app banner on the Budgets tab retries on its own refresh.
      }
      router.back();
    } catch (cause) {
      setBusy(false);
      Alert.alert(
        isEdit ? 'Gagal menyimpan perubahan' : 'Gagal menyimpan transaksi',
        cause instanceof Error ? cause.message : 'Coba lagi sebentar lagi.',
      );
    }
  }

  async function confirmDelete() {
    if (!params.id) return;
    setBusy(true);
    try {
      await remove(params.id);
      await refreshWallets();
      // Spent dropped — re-read budgets so rings fall back immediately.
      // No alert evaluation: a lower percent can never cross a threshold
      // upward, and fired alerts are never cleared by edits/deletes.
      try {
        await refreshBudgets();
      } catch {
        // Non-fatal; the Budgets tab refreshes on its own.
      }
      setConfirmingDelete(false);
      router.back();
    } catch (cause) {
      setBusy(false);
      setConfirmingDelete(false);
      Alert.alert(
        'Gagal menghapus',
        cause instanceof Error ? cause.message : 'Coba lagi sebentar lagi.',
      );
    }
  }

  const today = new Date();
  const atToday = toDateKey(occurredAt) === toDateKey(today);

  return (
    <Screen hasFloatingNav={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
          <Pressable
            testID="add-transaction-close"
            accessibilityRole="button"
            accessibilityLabel="Kembali"
            onPress={() => router.back()}
            style={styles.close}
          >
            <MaterialIcons name="chevron-left" size={28} color={colors.textPrimary} />
          </Pressable>
          <LogoMark size={32} />
          <Text style={[typography.headlineMd, styles.title]}>
            {isEdit ? 'Ubah Transaksi' : 'Transaksi Baru'}
          </Text>
          {isEdit ? (
            <Pressable
              testID="transaction-delete"
              accessibilityRole="button"
              accessibilityLabel="Hapus transaksi"
              onPress={() => setConfirmingDelete(true)}
              style={styles.close}
            >
              <MaterialIcons
                name="delete-outline"
                size={24}
                color={colors.error}
              />
            </Pressable>
          ) : null}
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {loadingExisting ? (
            <Text style={[typography.bodyMd, styles.hint]}>
              Memuat transaksi…
            </Text>
          ) : null}

          <TypeSegmentedControl
            testID="type-toggle"
            value={type}
            onChange={onToggleType}
          />

          <Card style={[styles.entryCard, styles.gap]}>
            <Text style={[typography.labelUppercase, styles.kicker]}>
              Nominal
            </Text>
            <AmountField
              testID="amount-input"
              value={amountRaw}
              error={amountError}
              onChangeText={(raw) => {
                setAmountRaw(formatAmountInput(raw));
                if (amountError) setAmountError(null);
              }}
            />
            <TextInput
              testID="note-input"
              style={styles.note}
              value={note}
              onChangeText={(text) => setNote(text.slice(0, 200))}
              placeholder="Catatan (opsional) — kopi pagi, transfer teman…"
              placeholderTextColor={colors.textSecondary}
              selectionColor={colors.accent}
              maxLength={200}
              multiline
            />
          </Card>

          <View style={styles.gap}>
            <SectionHeader
              testID="category-header"
              title="Kategori"
              actionLabel={`${categoriesForKind(categories, type).length} kategori`}
            />
            <CategoryGrid
              testID="category-grid"
              categories={categories}
              kind={type}
              selectedId={categoryId}
              onSelect={(category) => setCategoryChoice(category.id)}
            />
          </View>

          <View style={styles.gap}>
            <SectionHeader testID="wallet-header" title="Wallet" />
            <View testID="wallet-picker" style={styles.chips}>
              {wallets.map((wallet) => {
                const active = wallet.id === walletId;
                return (
                  <Pressable
                    key={wallet.id}
                    testID={`wallet-option-${wallet.id}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={wallet.name}
                    onPress={() => {
                      setWalletChoice(wallet.id);
                      void rememberWallet(wallet.id);
                    }}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <MaterialIcons
                      name="account-balance-wallet"
                      size={18}
                      color={active ? colors.accent : colors.textSecondary}
                    />
                    <Text
                      style={[
                        typography.bodyMd,
                        styles.chipLabel,
                        active && styles.chipLabelActive,
                      ]}
                    >
                      {wallet.name}
                    </Text>
                  </Pressable>
                );
              })}
              {wallets.length === 0 ? (
                <Text style={[typography.bodySm, styles.hint]}>
                  Belum ada wallet — buat satu dulu di menu Dompet.
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.gap}>
            <SectionHeader testID="date-header" title="Tanggal" />
            <Card testID="date-stepper" style={styles.dateCard}>
              <View style={styles.dateWell}>
                <MaterialIcons
                  name="calendar-month"
                  size={20}
                  color={colors.accent}
                />
              </View>
              <Text style={[typography.bodyMd, styles.dateLabel]}>
                {atToday ? 'Hari ini' : formatDateDivider(occurredAt.toISOString())}
              </Text>
              <View style={styles.dateButtons}>
                <Pressable
                  testID="date-prev"
                  accessibilityRole="button"
                  accessibilityLabel="Hari sebelumnya"
                  onPress={() => changeDay(-1)}
                  style={styles.dateButton}
                >
                  <MaterialIcons
                    name="chevron-left"
                    size={22}
                    color={colors.textPrimary}
                  />
                </Pressable>
                <Pressable
                  testID="date-next"
                  accessibilityRole="button"
                  accessibilityLabel="Hari berikutnya"
                  accessibilityState={{ disabled: atToday }}
                  disabled={atToday}
                  onPress={() => changeDay(1)}
                  style={[styles.dateButton, atToday && styles.dateButtonDisabled]}
                >
                  <MaterialIcons
                    name="chevron-right"
                    size={22}
                    color={atToday ? colors.textSecondary : colors.textPrimary}
                  />
                </Pressable>
              </View>
            </Card>
          </View>

          {formError ? (
            <Text testID="form-error" style={[typography.bodySm, styles.error]}>
              {formError}
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton
            testID="transaction-save"
            label={isEdit ? 'Simpan Perubahan' : 'Simpan'}
            onPress={submit}
            loading={busy}
          />
          <GhostButton
            testID="transaction-cancel"
            label="Batal"
            onPress={() => router.back()}
          />
        </View>
      </KeyboardAvoidingView>

      <DeleteConfirmSheet
        visible={confirmingDelete}
        loading={busy}
        onCancel={() => setConfirmingDelete(false)}
        onConfirm={confirmDelete}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  close: {
    width: layout.minTapTarget,
    height: layout.minTapTarget,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    color: colors.textPrimary,
  },
  body: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  kicker: {
    marginBottom: spacing.sm,
    color: colors.textSecondary,
  },
  gap: {
    marginTop: spacing.lg,
  },
  entryCard: {
    padding: spacing.md,
    gap: spacing.sm,
    borderRadius: radius.xl,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    minHeight: layout.minTapTarget,
    paddingHorizontal: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  chipActive: {
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
  },
  chipLabel: {
    color: colors.textSecondary,
  },
  chipLabelActive: {
    color: colors.accent,
  },
  dateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  dateWell: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  dateButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  dateButton: {
    width: layout.minTapTarget,
    height: layout.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateButtonDisabled: {
    opacity: 0.4,
  },
  dateLabel: {
    flex: 1,
    color: colors.textPrimary,
  },
  note: {
    minHeight: layout.minTapTarget,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    color: colors.textPrimary,
    ...typography.bodyLg,
    textAlignVertical: 'top',
  },
  hint: {
    color: colors.textSecondary,
  },
  error: {
    marginTop: spacing.md,
    color: colors.error,
  },
  footer: {
    gap: spacing.xs,
    paddingBottom: spacing.md,
  },
});
