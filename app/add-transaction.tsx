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
 * Transfer (V2, ADR-0004) is the third segment: the category grid hides and a
 * destination-wallet picker appears instead. Transfer rows carry
 * `category_id = null` and `counterparty_wallet_id` set — the DB check
 * enforces the shape, the form just refuses to send anything else.
 *
 * Date entry is a full month grid (`CalendarGrid`, plain `View`s like the T6
 * donut / T7 ring — no native date-picker module, so no dev-client rebuild).
 * Future days render disabled and can never be picked; the submit guard
 * rejects them anyway for income/expense/transfer alike.
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
import { useAnalytics } from '@/features/analytics';
import { useAuth } from '@/features/auth';
import { useBudgets } from '@/features/budgets';
import { trackEvent, txCreatedEvent } from '@/features/observability';
import { useWallets } from '@/features/wallets';
import {
  AmountField,
  CalendarGrid,
  CategoryGrid,
  DeleteConfirmSheet,
  TypeSegmentedControl,
  categoriesForKind,
  formatAmountInput,
  isFutureDate,
  newIdempotencyKey,
  normalizeNote,
  parseScanFlag,
  parseShortcutType,
  useTransactions,
  validateAmount,
  validateTransfer,
  type Transaction,
  type TransactionType,
} from '@/features/transactions';
import { dictionaryFor, fill, useLanguage } from '@/i18n';
import { colors, layout, radius, spacing, typography } from '@/theme';

export default function AddTransactionScreen() {
  // S1 (ADR-0009): shortcut deep links arrive as
  // `cashtrix://add-transaction?type=expense|income` and `cashtrix://scan`
  // (via the `/scan` alias as `scan=1`). `type` only preselects the segment —
  // `transfer` and unknown values fall through to the remembered preference.
  const params = useLocalSearchParams<{ id?: string; type?: string; scan?: string }>();
  const isEdit = Boolean(params.id);
  const insets = useSafeAreaInsets();
  // C6: copy + validation follow the OS language (ADR-0008).
  const language = useLanguage();
  const t = dictionaryFor(language);
  const tf = t.transactions.form;

  const { session } = useAuth();
  const { refresh: refreshWallets } = useWallets();
  const { refresh: refreshBudgets, evaluateAndAlert } = useBudgets();
  const { refresh: refreshAnalytics } = useAnalytics();
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
  const [destinationChoice, setDestinationChoice] = useState<string | null>(
    null,
  );
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

  // S1: a shortcut `?type=` seeds the segment below an explicit toggle but
  // above the remembered preference; edit mode (`?id=`) ignores it so a
  // shared link can never retarget a row being edited.
  const shortcutType = isEdit ? null : parseShortcutType(params.type);
  const type: TransactionType =
    typeOverride ?? shortcutType ?? loaded?.type ?? lastType;
  const isTransfer = type === 'transfer';

  // S1 contract for S2: `scan=1` (only emitted by the `/scan` alias) marks
  // this session as scan-first. The photo UI lands in S2 and reads this flag;
  // until then the form behaves exactly like a plain create.
  const scanMode = !isEdit && parseScanFlag(params.scan);
  // Consumed by S2 (photo UI) — the `void` keeps the S1 contract compiled.
  void scanMode;

  // Wallet: explicit choice > the row being edited > the remembered last-used
  // wallet > the first available (so an empty picker can never block Save).
  const walletId =
    walletChoice ?? loaded?.walletId ?? lastWalletId ?? wallets[0]?.id ?? null;

  // Transfer destination: explicit choice > the row being edited > the first
  // wallet that is not the source (never default to the source itself —
  // source = destination is rejected by the DB check).
  const destinationWalletId = isTransfer
    ? (destinationChoice ??
      loaded?.counterpartyWalletId ??
      wallets.find((wallet) => wallet.id !== walletId)?.id ??
      null)
    : null;

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
          cause instanceof Error ? cause.message : tf.loadFail,
        );
      })
      .finally(() => {
        if (!cancelled) setLoadingExisting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadTransaction, params.id, tf.loadFail]);

  function onToggleType(next: TransactionType) {
    setTypeOverride(next);
    // Persist immediately: the preference must survive even if the user backs
    // out without saving (AC #15).
    void rememberType(next);
  }

  function onPickDate(next: Date) {
    // The grid never offers future days (they render disabled); the guard
    // stays so a programmatic value can never slip through either.
    if (isFutureDate(next)) return; // AC #19: never a future date
    setOccurredAt(next);
  }

  async function submit() {
    const amount = validateAmount(amountRaw, language);
    if (!amount.ok) {
      setAmountError(amount.error);
      return;
    }
    setAmountError(null);

    if (!walletId) {
      setFormError(tf.walletRequired);
      return;
    }
    if (isTransfer) {
      const transfer = validateTransfer(
        {
          sourceWalletId: walletId,
          destinationWalletId,
        },
        language,
      );
      if (!transfer.ok) {
        setFormError(transfer.error);
        return;
      }
    } else if (!categoryId) {
      setFormError(tf.categoryRequired);
      return;
    }
    if (isFutureDate(occurredAt)) {
      setFormError(tf.futureDate);
      return;
    }

    setFormError(null);
    setBusy(true);

    try {
      await save({
        id: params.id,
        userId: session?.user.id ?? '',
        walletId,
        categoryId: isTransfer ? null : categoryId,
        counterpartyWalletId: isTransfer ? destinationWalletId : null,
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
      // (PRD §2.3 Epic E). Analytics re-reads as well: the Insight screen
      // would otherwise show the pre-save overview until the range changes.
      //
      // Opsi B (S1 follow-up): these re-reads are fire-and-forget — each
      // context applies its result when it lands, but none of them may trap
      // the form. A stalled network settles neither resolve nor reject, and
      // awaiting it left the submit spinner spinning forever on a committed
      // save (device finding: shortcut save, cold start AND background).
      // The success snackbar on the Dashboard is the save's proof, not this
      // screen staying open.
      void refreshWallets();
      void (async () => {
        try {
          await refreshBudgets();
          await refreshAnalytics();
          // Fresh server read inside (V6) — the cached list is still pre-save
          // truth here, so evaluating it would miss this commit's crossing.
          await evaluateAndAlert({ userId: session?.user.id ?? '' });
        } catch {
          // Non-fatal; the next save re-evaluates (dedup-safe).
        }
      })();
      // A shortcut deep link can land here with an empty history (cold start
      // or a router state reset): a bare `back()` is then a no-op and the
      // form never unmounts, so fall back to replacing at the Dashboard.
      setBusy(false);
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (cause) {
      setBusy(false);
      Alert.alert(
        isEdit ? tf.saveFailEdit : tf.saveFailCreate,
        cause instanceof Error ? cause.message : t.common.retry,
      );
    }
  }

  async function confirmDelete() {
    if (!params.id) return;
    setBusy(true);
    try {
      await remove(params.id);
      // Fire-and-forget like the save path (see `submit`): a stalled re-read
      // must never trap this sheet on a committed delete.
      void refreshWallets();
      void (async () => {
        // Spent dropped — re-read budgets so rings fall back immediately.
        // Analytics drops with it, or Insight keeps the deleted row's amounts.
        // No alert evaluation: a lower percent can never cross a threshold
        // upward, and fired alerts are never cleared by edits/deletes.
        try {
          await refreshBudgets();
          await refreshAnalytics();
        } catch {
          // Non-fatal; the Budgets tab refreshes on its own.
        }
      })();
      setConfirmingDelete(false);
      // V6: biarkan jendela undo tetap terbuka. `remove()` sudah membuka
      // `lastDeleted` setelah commit — sheet konfirmasi mencegah salah tekan,
      // snackbar ~10 detik di Dashboard menampung sesal sesudahnya (pola
      // Gmail: konfirmasi + Urungkan boleh berdampingan). Menutupnya di sini
      // membuat snackbar V4 tidak pernah tampil dari satu-satunya jalur hapus
      // di app, sehingga langkah "undo hapus" di gerbang Maestro (V6) tak
      // terjangkau.
      //
      // Same empty-history fallback as `submit`: an edit opened straight from
      // a deep link has nothing to go back to.
      setBusy(false);
      if (router.canGoBack()) router.back();
      else router.replace('/');
    } catch (cause) {
      setBusy(false);
      setConfirmingDelete(false);
      Alert.alert(
        tf.deleteFail,
        cause instanceof Error ? cause.message : t.common.retry,
      );
    }
  }

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
            accessibilityLabel={tf.back}
            onPress={() => router.back()}
            style={styles.close}
          >
            <MaterialIcons name="chevron-left" size={28} color={colors.textPrimary} />
          </Pressable>
          <LogoMark size={32} />
          <Text style={[typography.headlineMd, styles.title]}>
            {isEdit ? tf.editTitle : tf.createTitle}
          </Text>
          {isEdit ? (
            <Pressable
              testID="transaction-delete"
              accessibilityRole="button"
              accessibilityLabel={tf.deleteA11y}
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
              {tf.loading}
            </Text>
          ) : null}

          <TypeSegmentedControl
            testID="type-toggle"
            value={type}
            onChange={onToggleType}
          />

          <Card style={[styles.entryCard, styles.gap]}>
            <Text style={[typography.labelUppercase, styles.kicker]}>
              {tf.amount}
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
              placeholder={tf.notePlaceholder}
              placeholderTextColor={colors.textSecondary}
              selectionColor={colors.accent}
              maxLength={200}
              multiline
            />
          </Card>

          {isTransfer ? null : (
            <View style={styles.gap}>
              <SectionHeader
                testID="category-header"
                title={tf.category}
                actionLabel={fill(tf.categoryCount, {
                  count: categoriesForKind(categories, type).length,
                })}
              />
              <CategoryGrid
                testID="category-grid"
                categories={categories}
                kind={type}
                selectedId={categoryId}
                onSelect={(category) => setCategoryChoice(category.id)}
              />
            </View>
          )}

          <View style={styles.gap}>
            <SectionHeader
              testID="wallet-header"
              title={isTransfer ? tf.walletSource : tf.wallet}
            />
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
                  {tf.walletEmpty}
                </Text>
              ) : null}
            </View>
          </View>

          {isTransfer ? (
            <View style={styles.gap}>
              <SectionHeader testID="destination-header" title={tf.destination} />
              <View testID="destination-picker" style={styles.chips}>
                {wallets
                  .filter((wallet) => wallet.id !== walletId)
                  .map((wallet) => {
                    const active = wallet.id === destinationWalletId;
                    return (
                      <Pressable
                        key={wallet.id}
                        testID={`destination-option-${wallet.id}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        accessibilityLabel={wallet.name}
                        onPress={() => setDestinationChoice(wallet.id)}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <MaterialIcons
                          name="call-received"
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
                {wallets.filter((wallet) => wallet.id !== walletId).length ===
                0 ? (
                  <Text style={[typography.bodySm, styles.hint]}>
                    {tf.destinationEmpty}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          <View style={styles.gap}>
            <SectionHeader testID="date-header" title={tf.date} />
            <CalendarGrid
              testID="date-calendar"
              value={occurredAt}
              onChange={onPickDate}
            />
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
            label={isEdit ? tf.saveEdit : t.common.save}
            onPress={submit}
            loading={busy}
          />
          <GhostButton
            testID="transaction-cancel"
            label={t.common.cancel}
            onPress={() => router.back()}
          />
        </View>
      </KeyboardAvoidingView>

      <DeleteConfirmSheet
        visible={confirmingDelete}
        loading={busy}
        title={t.transactions.sheet.title}
        body={t.transactions.sheet.body}
        confirmLabel={t.transactions.sheet.confirm}
        cancelLabel={t.common.cancel}
        closeLabel={t.transactions.sheet.close}
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
