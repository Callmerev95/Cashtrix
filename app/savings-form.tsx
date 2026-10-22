/**
 * Savings target create/edit sheet (route `/savings-form`, SV3 issue #107).
 *
 * `?id=` switches to edit mode. A goal is metadata on one wallet, so create
 * offers only active wallets without a goal; edit locks the wallet (moving a
 * goal is a delete + create). Money/date validation is the pure
 * `validateSavingsGoal` seam — the screen never parses amounts itself beyond
 * `parseAmountInput` for the final numeric value.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  GhostButton,
  PrimaryButton,
  Screen,
  TextField,
} from '@/components';
import { pressedFeedback } from '@/components/pressed';
import {
  AmountField,
  CalendarGrid,
  DeleteConfirmSheet,
  formatAmountInput,
  toDateKey,
} from '@/features/transactions';
import {
  NAME_MAX_LENGTH,
  SavingsApiError,
  hasSavingsErrors,
  normalizeSavingsName,
  useSavings,
  validateSavingsGoal,
  type SavingsGoalFieldErrors,
} from '@/features/savings';
import {
  formatAmount,
  parseAmountInput,
} from '@/features/wallets';
import { dictionaryFor, useLanguage } from '@/i18n';
import { colors, layout, radius, spacing, typography } from '@/theme';

const EMPTY_ERRORS: SavingsGoalFieldErrors = {
  walletId: null,
  targetAmount: null,
  name: null,
  targetDate: null,
};

function dateFromKey(key: string | null): Date | null {
  if (!key || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
}

export default function SavingsFormScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const {
    goals,
    availableWallets,
    loading: savingsLoading,
    create,
    update,
    remove,
  } = useSavings();
  const insets = useSafeAreaInsets();
  const language = useLanguage();
  const t = dictionaryFor(language);
  const tf = t.savings.form;

  const isEdit = Boolean(params.id);
  const editing = useMemo(
    () => goals.find((goal) => goal.id === params.id),
    [goals, params.id],
  );

  const [walletChoice, setWalletChoice] = useState<string | null>(null);
  const [nameChoice, setNameChoice] = useState<string | null>(null);
  const [amountChoice, setAmountChoice] = useState<string | null>(null);
  // `undefined` = follow the loaded row (create has no row → defaults below);
  // a string/null is a user decision that must survive an async edit-load.
  const [dateChoice, setDateChoice] = useState<string | null | undefined>(
    undefined,
  );
  const [dateEnabledChoice, setDateEnabledChoice] = useState<
    boolean | undefined
  >(undefined);

  const [errors, setErrors] = useState<SavingsGoalFieldErrors>(EMPTY_ERRORS);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const walletId =
    walletChoice ??
    editing?.walletId ??
    availableWallets[0]?.id ??
    null;
  const name = nameChoice ?? editing?.name ?? '';
  const amountRaw =
    amountChoice ??
    (editing ? formatAmount(editing.targetAmount) : '');
  const targetDate =
    dateChoice !== undefined ? dateChoice : (editing?.targetDate ?? null);
  const dateEnabled =
    dateEnabledChoice !== undefined
      ? dateEnabledChoice
      : editing?.targetDate != null;

  const walletName = isEdit
    ? (editing?.walletName ?? null)
    : (availableWallets.find((wallet) => wallet.id === walletId)?.name ?? null);

  const missingEdit = isEdit && !savingsLoading && !editing;
  const readyToSave = !busy && !(isEdit && !editing);
  const dateValue = dateFromKey(targetDate) ?? new Date();

  function clearError(field: keyof SavingsGoalFieldErrors) {
    setErrors((current) => ({ ...current, [field]: null }));
    setFormError(null);
  }

  function toggleDate() {
    const next = !dateEnabled;
    setDateEnabledChoice(next);
    if (next) {
      setDateChoice(targetDate ?? toDateKey(new Date()));
    } else {
      setDateChoice(null);
    }
    clearError('targetDate');
  }

  async function handleSave() {
    const validation = validateSavingsGoal(
      {
        walletId,
        name,
        targetAmountRaw: amountRaw,
        targetDate: dateEnabled ? targetDate : null,
      },
      {
        language,
        originalDate: editing?.targetDate ?? null,
      },
    );
    setErrors(validation);
    setFormError(null);
    if (hasSavingsErrors(validation) || !walletId) return;

    const targetAmount = parseAmountInput(amountRaw);
    if (targetAmount === null) return;

    setBusy(true);
    try {
      const normalizedName = normalizeSavingsName(name);
      const nextDate = dateEnabled ? targetDate : null;

      if (isEdit && editing) {
        await update(editing.id, {
          name: normalizedName,
          targetAmount,
          targetDate: nextDate,
        });
      } else {
        await create({
          walletId,
          name: normalizedName,
          targetAmount,
          targetDate: nextDate,
        });
      }
      router.back();
    } catch (cause) {
      setBusy(false);
      if (cause instanceof SavingsApiError && cause.code === 'duplicate_wallet') {
        setErrors((current) => ({
          ...current,
          walletId: t.savings.validation.duplicateWallet,
        }));
      } else {
        setFormError(isEdit ? tf.saveFailEdit : tf.saveFailCreate);
      }
    }
  }

  async function handleDelete() {
    if (!editing) return;
    setBusy(true);
    try {
      await remove(editing.id);
      setConfirmingDelete(false);
      router.back();
    } catch {
      setBusy(false);
      setConfirmingDelete(false);
      setFormError(tf.deleteFail);
    }
  }

  return (
    <Screen hasFloatingNav={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tf.close}
            testID="savings-form-close"
            onPress={() => router.back()}
            style={({ pressed }) => [
              styles.close,
              pressed && pressedFeedback,
            ]}
          >
            <MaterialIcons name="close" size={24} color={colors.textSecondary} />
          </Pressable>
          <Text style={[typography.headlineMd, styles.title]}>
            {isEdit ? tf.editTitle : tf.createTitle}
          </Text>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[typography.labelUppercase, styles.label]}>
            {tf.wallet}
          </Text>
          {isEdit ? (
            <View testID="savings-wallet-locked" style={styles.locked}>
              <MaterialIcons
                name="account-balance-wallet"
                size={20}
                color={colors.accent}
              />
              <View style={styles.lockedBody}>
                <Text style={[typography.bodyLg, styles.lockedName]}>
                  {walletName ?? tf.walletPlaceholder}
                </Text>
                <Text style={[typography.bodySm, styles.hint]}>
                  {tf.walletLocked}
                </Text>
              </View>
              <MaterialIcons
                name="lock-outline"
                size={18}
                color={colors.textSecondary}
              />
            </View>
          ) : availableWallets.length === 0 ? (
            <View testID="savings-no-wallets" style={styles.emptyWell}>
              <Text style={[typography.bodyMd, styles.emptyTitle]}>
                {tf.noEligibleWallets}
              </Text>
              <Text style={[typography.bodySm, styles.hint]}>
                {tf.noWalletsHint}
              </Text>
            </View>
          ) : (
            <View testID="savings-wallet-picker" style={styles.chips}>
              {availableWallets.map((wallet) => {
                const active = wallet.id === walletId;
                return (
                  <Pressable
                    key={wallet.id}
                    testID={`savings-wallet-${wallet.id}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={wallet.name}
                    onPress={() => {
                      setWalletChoice(wallet.id);
                      clearError('walletId');
                    }}
                    style={({ pressed }) => [
                      styles.chip,
                      active && styles.chipActive,
                      pressed && pressedFeedback,
                    ]}
                  >
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
            </View>
          )}
          {errors.walletId ? (
            <Text testID="savings-wallet-error" style={styles.error}>
              {errors.walletId}
            </Text>
          ) : null}

          <Text style={[typography.labelUppercase, styles.label, styles.gap]}>
            {tf.name}
          </Text>
          <TextField
            testID="savings-name"
            value={name}
            onChangeText={(next) => {
              setNameChoice(next);
              clearError('name');
            }}
            placeholder={walletName ?? tf.name}
            autoCapitalize="words"
            maxLength={NAME_MAX_LENGTH}
            hasError={Boolean(errors.name)}
            returnKeyType="next"
          />
          <Text style={[typography.bodySm, styles.hint]}>{tf.nameHint}</Text>
          {errors.name ? (
            <Text style={[typography.bodySm, styles.error]}>{errors.name}</Text>
          ) : null}

          <Text style={[typography.labelUppercase, styles.label, styles.gap]}>
            {tf.targetAmount}
          </Text>
          <AmountField
            testID="savings-amount"
            value={amountRaw}
            onChangeText={(raw) => {
              setAmountChoice(formatAmountInput(raw));
              clearError('targetAmount');
            }}
            error={errors.targetAmount}
          />

          <View style={styles.gap}>
            <Text style={[typography.labelUppercase, styles.label]}>
              {tf.targetDate}
            </Text>
            <Pressable
              testID="savings-date-toggle"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: dateEnabled }}
              accessibilityLabel={tf.dateToggle}
              onPress={toggleDate}
              style={({ pressed }) => [
                styles.toggleRow,
                pressed && pressedFeedback,
              ]}
            >
              <View
                style={[styles.checkbox, dateEnabled && styles.checkboxOn]}
              >
                {dateEnabled ? (
                  <MaterialIcons
                    name="check"
                    size={16}
                    color={colors.textOnAccent}
                  />
                ) : null}
              </View>
              <View style={styles.toggleBody}>
                <Text style={[typography.bodyMd, styles.toggleLabel]}>
                  {tf.dateToggle}
                </Text>
                <Text style={[typography.bodySm, styles.hint]}>
                  {dateEnabled
                    ? isEdit
                      ? tf.dateEditHint
                      : tf.dateFutureHint
                    : tf.dateHint}
                </Text>
              </View>
            </Pressable>
            {dateEnabled ? (
              <CalendarGrid
                testID="savings-date-calendar"
                value={dateValue}
                onChange={(next) => {
                  setDateChoice(toDateKey(next));
                  clearError('targetDate');
                }}
                disablePast={!isEdit}
                disableFuture={false}
              />
            ) : null}
            {errors.targetDate ? (
              <Text testID="savings-date-error" style={styles.error}>
                {errors.targetDate}
              </Text>
            ) : null}
          </View>

          {missingEdit ? (
            <Text testID="savings-form-missing" style={styles.error}>
              {tf.saveFailEdit}
            </Text>
          ) : null}
          {formError ? (
            <Text testID="savings-form-error" style={styles.error}>
              {formError}
            </Text>
          ) : null}

          <PrimaryButton
            testID="savings-save"
            label={busy ? tf.saving : isEdit ? tf.saveEdit : tf.saveCreate}
            disabled={!readyToSave}
            loading={busy}
            onPress={() => void handleSave()}
          />

          {isEdit && editing ? (
            <GhostButton
              testID="savings-delete"
              label={tf.delete}
              disabled={busy}
              onPress={() => setConfirmingDelete(true)}
            />
          ) : null}
        </ScrollView>

        <DeleteConfirmSheet
          visible={confirmingDelete}
          title={tf.deleteTitle}
          body={tf.deleteBody}
          confirmLabel={busy ? tf.deleting : t.common.delete}
          cancelLabel={t.common.cancel}
          closeLabel={tf.close}
          loading={busy}
          onCancel={() => setConfirmingDelete(false)}
          onConfirm={() => void handleDelete()}
          testID="savings-delete-sheet"
        />
      </KeyboardAvoidingView>
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.textPrimary,
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  label: {
    color: colors.textSecondary,
  },
  gap: {
    marginTop: spacing.sm,
  },
  hint: {
    color: colors.textSecondary,
  },
  error: {
    color: colors.error,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    minHeight: layout.minTapTarget,
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceCard,
  },
  chipActive: {
    borderColor: colors.accent,
  },
  chipLabel: {
    color: colors.textSecondary,
  },
  chipLabelActive: {
    color: colors.accent,
  },
  locked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceElevated,
  },
  lockedBody: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  lockedName: {
    color: colors.textPrimary,
  },
  emptyWell: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceCard,
  },
  emptyTitle: {
    color: colors.textPrimary,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: layout.minTapTarget,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  toggleBody: {
    flex: 1,
    gap: spacing.xs / 2,
  },
  toggleLabel: {
    color: colors.textPrimary,
  },
});
