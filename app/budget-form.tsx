/**
 * Budget create/edit sheet (route `/budget-form`, presented as a modal).
 *
 * Fields: expense category (grid, expense-only — an income category can never
 * be picked, and the DB trigger is the backstop) + monthly limit (currency
 * entry styled like the transaction form). Validation is the pure
 * `validateBudget` from the Jest seam.
 *
 * `?id=` switches to edit mode; the budget is read from `useBudgets()` (the
 * `budget_id` of a `v_budget_status` row) so no extra query is needed. Saving
 * upserts on `(user, category, month)` — editing the current month's limit is
 * the same call as creating it. Delete lives here as a destructive confirm,
 * mirroring the transaction form.
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GhostButton, PrimaryButton, Screen } from '@/components';
import { useAuth } from '@/features/auth';
import {
  budgetLimitFromInput,
  hasBudgetErrors,
  useBudgets,
  validateBudget,
} from '@/features/budgets';
import {
  AmountField,
  CategoryGrid,
  formatAmountInput,
  useTransactions,
} from '@/features/transactions';
import { colors, layout, radius, spacing, typography } from '@/theme';

export default function BudgetFormScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { session } = useAuth();
  const { budgets, save, remove } = useBudgets();
  const { categories } = useTransactions();
  const insets = useSafeAreaInsets();

  const editing = useMemo(
    () => budgets.find((budget) => budget.budgetId === params.id),
    [budgets, params.id],
  );
  const isEdit = Boolean(params.id);

  const [categoryId, setCategoryId] = useState<string | null>(
    editing?.categoryId ?? null,
  );
  const [amountRaw, setAmountRaw] = useState(
    editing ? formatAmountInput(String(editing.amountLimit)) : '',
  );
  const [errors, setErrors] = useState<{
    category?: string | null;
    amount?: string | null;
  }>({});
  const [busy, setBusy] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  const pickedKind = useMemo(
    () => categories.find((category) => category.id === categoryId)?.kind ?? null,
    [categories, categoryId],
  );

  async function handleSave() {
    const validation = validateBudget({
      categoryId,
      categoryKind: pickedKind,
      amountRaw,
    });
    setErrors({
      category: validation.categoryError,
      amount: validation.amountError,
    });
    if (hasBudgetErrors(validation)) return;

    if (!categoryId) return;
    setBusy(true);
    try {
      if (!session?.user.id) throw new Error('Sesi tidak ditemukan');
      await save({
        userId: session.user.id,
        categoryId,
        amountLimit: budgetLimitFromInput(amountRaw),
      });
      router.back();
    } catch (cause) {
      setBusy(false);
      Alert.alert(
        isEdit ? 'Gagal menyimpan perubahan' : 'Gagal membuat budget',
        cause instanceof Error ? cause.message : 'Coba lagi sebentar lagi.',
      );
    }
  }

  async function handleDelete() {
    if (!params.id) return;
    setBusy(true);
    try {
      await remove(params.id);
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

  return (
    <Screen>
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
            {isEdit ? 'Ubah budget' : 'Buat budget'}
          </Text>
          <View style={styles.close} />
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={[typography.labelUppercase, styles.label]}>
            Kategori pengeluaran
          </Text>
          <CategoryGrid
            testID="budget-category-grid"
            categories={categories}
            kind="expense"
            selectedId={categoryId}
            onSelect={(category) => {
              setCategoryId(category.id);
              setErrors((current) => ({ ...current, category: null }));
            }}
          />
          {errors.category ? (
            <Text testID="budget-category-error" style={styles.error}>
              {errors.category}
            </Text>
          ) : null}

          <Text style={[typography.labelUppercase, styles.label]}>
            Batas per bulan
          </Text>
          <AmountField
            testID="budget-amount"
            value={amountRaw}
            onChangeText={(raw) => {
              setAmountRaw(formatAmountInput(raw));
              setErrors((current) => ({ ...current, amount: null }));
            }}
            error={errors.amount}
          />

          <PrimaryButton
            label={busy ? 'Menyimpan…' : isEdit ? 'Simpan perubahan' : 'Buat budget'}
            onPress={() => void handleSave()}
          />

          {isEdit ? (
            <GhostButton
              label="Hapus budget"
              onPress={() => setConfirmingDelete(true)}
            />
          ) : null}
        </ScrollView>

        {confirmingDelete ? (
          <View style={styles.sheet}>
            <View style={styles.sheetCard}>
              <Text style={[typography.headlineSm, styles.sheetTitle]}>
                Hapus budget ini?
              </Text>
              <Text style={[typography.bodyMd, styles.sheetBody]}>
                Batas bulan berjalan ikut terhapus. Transaksi tidak ikut
                terhapus — alert yang sudah terkirim tetap tercatat.
              </Text>
              <View style={styles.sheetActions}>
                <GhostButton label="Batal" onPress={() => setConfirmingDelete(false)} />
                <PrimaryButton
                  label={busy ? 'Menghapus…' : 'Hapus'}
                  onPress={() => void handleDelete()}
                />
              </View>
            </View>
          </View>
        ) : null}
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
    justifyContent: 'space-between',
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
  error: {
    color: colors.error,
  },
  sheet: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  sheetCard: {
    width: '100%',
    backgroundColor: colors.surfaceCard,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.xl,
    padding: spacing.lg,
    gap: spacing.md,
  },
  sheetTitle: {
    color: colors.textPrimary,
  },
  sheetBody: {
    color: colors.textSecondary,
  },
  sheetActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'flex-end',
  },
});
