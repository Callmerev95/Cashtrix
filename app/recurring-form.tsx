/**
 * Recurring rule create/edit sheet (route `/recurring-form`, V3 issue #32).
 *
 * Fields: kind (segmented, create-only — locked on edit so born occurrences
 * never change meaning), amount (`AmountField`, same 12-digit rule as
 * transactions), wallet (active only — archived wallets auto-pause rules, so
 * the picker never offers them), category grid by kind, due day (1–28 or
 * "Akhir bulan"), computed `starts_on` (read-only: this month, or next month
 * when this month's due already passed — spec story 27), optional `ends_on`
 * month stepper. `?id=` switches to edit mode; the row is read from
 * `useRecurring()` so no extra query is needed (same pattern as the category
 * form).
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
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

import { GhostButton, PrimaryButton, Screen, SectionHeader } from '@/components';
import { useAuth } from '@/features/auth';
import {
  defaultStartsOn,
  DUE_DAY_MAX,
  DUE_DAY_MIN,
  fetchRecurringCurrentMonth,
  fetchRecurringTimezone,
  formatRuleMonth,
  useRecurring,
  validateRecurringRule,
  type RecurringKind,
} from '@/features/recurring';
import {
  AmountField,
  CategoryGrid,
  formatAmountInput,
  useTransactions,
  validateAmount,
} from '@/features/transactions';
import { colors, layout, radius, spacing, typography } from '@/theme';

const KINDS: { value: RecurringKind; label: string }[] = [
  { value: 'expense', label: 'Pengeluaran' },
  { value: 'income', label: 'Pemasukan' },
];

/** `2026-09-01` shifted by delta months, still day-1. */
function shiftMonth(dayOne: string, delta: number): string {
  const year = Number(dayOne.slice(0, 4));
  const month = Number(dayOne.slice(5, 7));
  const shifted = new Date(year, month - 1 + delta, 1);
  const key = `${shifted.getFullYear()}-${String(shifted.getMonth() + 1).padStart(2, '0')}-01`;
  return key;
}

export default function RecurringFormScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { session } = useAuth();
  const { rules, save } = useRecurring();
  const { categories, wallets } = useTransactions();
  const insets = useSafeAreaInsets();

  const editing = useMemo(
    () => rules.find((rule) => rule.id === params.id),
    [rules, params.id],
  );
  const isEdit = Boolean(params.id);

  const [kind, setKind] = useState<RecurringKind>(editing?.kind ?? 'expense');
  const [amountRaw, setAmountRaw] = useState(
    editing ? String(editing.amount).replace('.', ',') : '',
  );
  const [walletChoice, setWalletChoice] = useState<string | null>(
    editing?.walletId ?? null,
  );
  const [categoryChoice, setCategoryChoice] = useState<string | null>(
    editing?.categoryId ?? null,
  );
  const [dueDay, setDueDay] = useState<number | null>(editing?.dueDay ?? null);
  const [dueLast, setDueLast] = useState(editing?.dueLast ?? false);
  const [endsEnabled, setEndsEnabled] = useState(editing?.endsOn !== null);
  const [endsMonth, setEndsMonth] = useState(
    editing?.endsOn ?? editing?.startsOn ?? null,
  );
  const [currentMonthOne, setCurrentMonthOne] = useState<string | null>(null);
  const [amountError, setAmountError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Running month in the profile timezone (the only month the client may
  // quote — PRD §4.2). Promise callbacks, never synchronous setState
  // (`react-hooks/set-state-in-effect`, cf. T5/T6).
  useEffect(() => {
    let cancelled = false;
    fetchRecurringTimezone()
      .then((tz) => fetchRecurringCurrentMonth(tz))
      .then((month) => {
        if (!cancelled) setCurrentMonthOne(month);
      })
      .catch(() => {
        if (!cancelled) setCurrentMonthOne(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Derived during render (never synced by effect — cf. add-transaction):
  // create mode computes starts_on from the running month; edit mode keeps
  // the stored one (history before it must stay covered).
  const startsOn = isEdit
    ? (editing?.startsOn ?? null)
    : currentMonthOne
      ? defaultStartsOn({ currentMonthOne, dueDay, dueLast })
      : null;
  const startsBumped =
    !isEdit &&
    currentMonthOne !== null &&
    startsOn !== null &&
    startsOn !== currentMonthOne;

  async function onSave() {
    const amountResult = validateAmount(amountRaw);
    setAmountError(amountResult.ok ? null : amountResult.error);
    if (!amountResult.ok) return;

    const category = categories.find((item) => item.id === categoryChoice);
    const categoryId =
      category && category.kind === kind ? category.id : null;

    const ruleError = validateRecurringRule({
      kind,
      walletId: walletChoice,
      categoryId,
      dueDay,
      dueLast,
      startsOn: startsOn ?? '',
      endsOn: endsEnabled ? (endsMonth ?? startsOn) : null,
    });
    setFormError(ruleError);
    if (ruleError || !startsOn) {
      if (!startsOn && !ruleError) {
        setFormError('Bulan berjalan belum termuat, coba lagi sebentar lagi.');
      }
      return;
    }

    setBusy(true);
    try {
      if (isEdit && params.id) {
        await save({
          id: params.id,
          userId: session?.user.id ?? '',
          kind,
          amount: amountResult.value,
          walletId: walletChoice ?? '',
          categoryId: categoryId ?? '',
          dueDay,
          dueLast,
          startsOn,
          endsOn: endsEnabled ? (endsMonth ?? startsOn) : null,
        });
      } else {
        if (!session?.user.id) throw new Error('Sesi tidak ditemukan');
        await save({
          userId: session.user.id,
          kind,
          amount: amountResult.value,
          walletId: walletChoice ?? '',
          categoryId: categoryId ?? '',
          dueDay,
          dueLast,
          startsOn,
          endsOn: endsEnabled ? (endsMonth ?? startsOn) : null,
        });
      }
      router.back();
    } catch (cause) {
      setBusy(false);
      setFormError(
        cause instanceof Error ? cause.message : 'Gagal menyimpan aturan',
      );
    }
  }

  const dueDays: number[] = useMemo(() => {
    const days: number[] = [];
    for (let day = DUE_DAY_MIN; day <= DUE_DAY_MAX; day += 1) days.push(day);
    return days;
  }, []);

  return (
    <Screen hasFloatingNav={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Tutup"
            onPress={() => router.back()}
            style={styles.close}
          >
            <MaterialIcons name="close" size={24} color={colors.textSecondary} />
          </Pressable>
          <Text style={[typography.headlineMd, styles.title]}>
            {isEdit ? 'Ubah Aturan' : 'Aturan Baru'}
          </Text>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          {isEdit ? (
            <Text style={[typography.bodySm, styles.hint]}>
              Jenis terkunci — yang sudah tercatat tidak berubah artinya.
              Perubahan hanya berlaku untuk occurrence yang belum lahir.
            </Text>
          ) : (
            <View testID="recurring-kind" style={styles.chips}>
              {KINDS.map((option) => {
                const active = kind === option.value;
                return (
                  <Pressable
                    key={option.value}
                    testID={`recurring-kind-${option.value}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={option.label}
                    onPress={() => {
                      setKind(option.value);
                      setCategoryChoice(null);
                    }}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text
                      style={[
                        typography.bodyMd,
                        styles.chipLabel,
                        active && styles.chipLabelActive,
                      ]}
                    >
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          )}

          <Text style={[typography.labelUppercase, styles.kicker, styles.gap]}>
            Nominal
          </Text>
          <AmountField
            testID="recurring-amount"
            value={amountRaw}
            error={amountError}
            onChangeText={(raw) => {
              setAmountRaw(formatAmountInput(raw));
              if (amountError) setAmountError(null);
            }}
          />

          <View style={styles.gap}>
            <SectionHeader testID="recurring-wallet-header" title="Dompet" />
            <View testID="recurring-wallet-picker" style={styles.chips}>
              {wallets.map((wallet) => {
                const active = wallet.id === walletChoice;
                return (
                  <Pressable
                    key={wallet.id}
                    testID={`recurring-wallet-${wallet.id}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={wallet.name}
                    onPress={() => setWalletChoice(wallet.id)}
                    style={[styles.chip, active && styles.chipActive]}
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
              {wallets.length === 0 ? (
                <Text style={[typography.bodySm, styles.hint]}>
                  Belum ada dompet aktif. Buat satu dulu di menu Dompet.
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.gap}>
            <SectionHeader testID="recurring-category-header" title="Kategori" />
            <CategoryGrid
              testID="recurring-category-grid"
              categories={categories}
              kind={kind}
              selectedId={categoryChoice}
              onSelect={(category) => setCategoryChoice(category.id)}
            />
          </View>

          <View style={styles.gap}>
            <SectionHeader
              testID="recurring-due-header"
              title="Jatuh tempo tiap bulan"
            />
            <View testID="recurring-due-picker" style={styles.chips}>
              {dueDays.map((day) => {
                const active = !dueLast && dueDay === day;
                return (
                  <Pressable
                    key={day}
                    testID={`recurring-due-${day}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Tanggal ${day}`}
                    onPress={() => {
                      setDueDay(day);
                      setDueLast(false);
                    }}
                    style={[styles.dueChip, active && styles.chipActive]}
                  >
                    <Text
                      style={[
                        typography.bodyMd,
                        styles.chipLabel,
                        active && styles.chipLabelActive,
                      ]}
                    >
                      {day}
                    </Text>
                  </Pressable>
                );
              })}
              <Pressable
                testID="recurring-due-last"
                accessibilityRole="button"
                accessibilityState={{ selected: dueLast }}
                accessibilityLabel="Hari terakhir bulan"
                onPress={() => {
                  setDueLast(true);
                  setDueDay(null);
                }}
                style={[styles.chip, dueLast && styles.chipActive]}
              >
                <Text
                  style={[
                    typography.bodyMd,
                    styles.chipLabel,
                    dueLast && styles.chipLabelActive,
                  ]}
                >
                  Akhir bulan
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.gap}>
            <SectionHeader testID="recurring-starts-header" title="Mulai" />
            <Text style={[typography.bodyMd, styles.startsText]}>
              {startsOn ? formatRuleMonth(startsOn) : 'Memuat bulan berjalan…'}
            </Text>
            {startsBumped ? (
              <Text style={[typography.bodySm, styles.hint]}>
                Due bulan ini sudah lewat — occurrence pertama lahir bulan
                depan agar tidak mengarang pembayaran lalu.
              </Text>
            ) : null}
          </View>

          <View style={styles.gap}>
            <Pressable
              testID="recurring-ends-toggle"
              accessibilityRole="checkbox"
              accessibilityState={{ checked: endsEnabled }}
              accessibilityLabel="Ada bulan akhir"
              onPress={() => {
                if (!endsEnabled && !endsMonth && startsOn) {
                  setEndsMonth(startsOn);
                }
                setEndsEnabled(!endsEnabled);
              }}
              style={styles.endsToggle}
            >
              <MaterialIcons
                name={endsEnabled ? 'check-box' : 'check-box-outline-blank'}
                size={22}
                color={endsEnabled ? colors.accent : colors.textSecondary}
              />
              <Text style={[typography.bodyMd, styles.endsLabel]}>
                Ada bulan akhir
              </Text>
            </Pressable>
            {endsEnabled ? (
              <View style={styles.endsRow}>
                <Pressable
                  testID="recurring-ends-prev"
                  accessibilityRole="button"
                  accessibilityLabel="Bulan akhir sebelumnya"
                  accessibilityState={{
                    disabled:
                      !endsMonth || !startsOn || endsMonth <= startsOn,
                  }}
                  disabled={!endsMonth || !startsOn || endsMonth <= startsOn}
                  onPress={() =>
                    setEndsMonth((current) =>
                      current ? shiftMonth(current, -1) : current,
                    )
                  }
                  style={styles.endsButton}
                >
                  <MaterialIcons
                    name="chevron-left"
                    size={22}
                    color={colors.textPrimary}
                  />
                </Pressable>
                <Text style={[typography.bodyMd, styles.endsText]}>
                  {endsMonth ? formatRuleMonth(endsMonth) : '—'}
                </Text>
                <Pressable
                  testID="recurring-ends-next"
                  accessibilityRole="button"
                  accessibilityLabel="Bulan akhir berikutnya"
                  onPress={() =>
                    setEndsMonth((current) =>
                      current
                        ? shiftMonth(current, 1)
                        : (startsOn ?? current),
                    )
                  }
                  style={styles.endsButton}
                >
                  <MaterialIcons
                    name="chevron-right"
                    size={22}
                    color={colors.textPrimary}
                  />
                </Pressable>
              </View>
            ) : null}
          </View>

          {formError ? (
            <Text testID="recurring-form-error" style={[typography.bodySm, styles.error]}>
              {formError}
            </Text>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <PrimaryButton
            testID="recurring-save"
            label={isEdit ? 'Simpan perubahan' : 'Simpan aturan'}
            onPress={() => void onSave()}
            loading={busy}
          />
          <GhostButton
            testID="recurring-cancel"
            label="Batal"
            onPress={() => router.back()}
          />
        </View>
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
  hint: {
    color: colors.textSecondary,
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
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  dueChip: {
    minWidth: layout.minTapTarget,
    minHeight: layout.minTapTarget,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
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
  startsText: {
    color: colors.textPrimary,
  },
  endsToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.minTapTarget,
  },
  endsLabel: {
    color: colors.textPrimary,
  },
  endsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
  endsButton: {
    width: layout.minTapTarget,
    height: layout.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  endsText: {
    flex: 1,
    color: colors.textPrimary,
    textAlign: 'center',
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
