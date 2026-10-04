import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { PrimaryButton } from '@/components/button';
import { formatGrouped, transactionTypeLabel } from '@/features/transactions';
import type { VoicePrefill, VoiceTransactionKind, VoiceWallet } from '../domain';
import { dictionaryFor, useLanguage } from '@/i18n';
import { colors, layout, radius, spacing, typography } from '@/theme';
import { pressedFeedback } from '@/components/pressed';

type ConfirmCategory = { id: string; name: string; kind: VoiceTransactionKind };

type VoiceConfirmCardProps = {
  prefill: VoicePrefill & { walletHint: string | null };
  wallets: VoiceWallet[];
  categories: ConfirmCategory[];
  busy: boolean;
  onConfirm: (prefill: VoicePrefill) => void;
  onCancel: () => void;
};

function resolveWalletId(
  hint: string | null,
  wallets: VoiceWallet[],
  fallback: string | null,
): string | null {
  if (fallback) return fallback;
  if (!hint) return null;
  const trimmed = hint.trim().toLowerCase();
  if (trimmed === '') return null;
  return (
    wallets.find((wallet) => wallet.name.toLowerCase() === trimmed)?.id ?? null
  );
}

function resolveCategoryName(
  hint: string | null,
  categories: ConfirmCategory[],
  kind: VoiceTransactionKind,
): string {
  if (!hint) return '—';
  const lowered = hint.toLowerCase();
  const match = categories.find(
    (category) =>
      category.kind === kind && category.name.toLowerCase().includes(lowered),
  );
  return match?.name ?? hint;
}

/**
 * Confirmation card (1-tap sheet): Gemini's parse rendered as an editable
 * summary — name, amount, category — with the primary confirm at the bottom.
 * Rendered below the locked `voice-status` banner so the static contract
 * (`verify-t11 --static-only`) stays green.
 */
export function VoiceConfirmCard({
  prefill,
  wallets,
  categories,
  busy,
  onConfirm,
  onCancel,
}: VoiceConfirmCardProps) {
  const language = useLanguage();
  const t = dictionaryFor(language).voice;
  const [note, setNote] = useState(prefill.note);
  const [amountRaw, setAmountRaw] = useState(String(prefill.amount));
  const [kind, setKind] = useState<VoiceTransactionKind>(prefill.kind);

  const walletId = resolveWalletId(prefill.walletHint, wallets, prefill.walletId);
  const walletName =
    wallets.find((wallet) => wallet.id === walletId)?.name ??
    prefill.walletHint ??
    '—';
  const categoryName = resolveCategoryName(prefill.categoryHint, categories, kind);
  const amountDigits = Number(amountRaw.replace(/\D/g, ''));
  const amountValid =
    Number.isSafeInteger(amountDigits) &&
    amountDigits > 0 &&
    amountDigits <= 999_999_999_999;

  return (
    <View testID="voice-confirm-card" style={styles.card}>
      <Text style={[typography.labelUppercase, styles.kicker]}>
        {t.confirmTitle}
      </Text>
      <View style={styles.row}>
        <Pressable
          testID="voice-confirm-kind-expense"
          accessibilityRole="button"
          accessibilityState={{ selected: kind === 'expense' }}
          onPress={() => setKind('expense')}
          style={({ pressed }) => [
            styles.kind,
            kind === 'expense' && styles.kindActive,
            pressed && pressedFeedback,
          ]}
        >
          <Text
            style={[
              typography.bodyMd,
              styles.kindLabel,
              kind === 'expense' && styles.kindLabelActive,
            ]}
          >
            {transactionTypeLabel('expense', language)}
          </Text>
        </Pressable>
        <Pressable
          testID="voice-confirm-kind-income"
          accessibilityRole="button"
          accessibilityState={{ selected: kind === 'income' }}
          onPress={() => setKind('income')}
          style={({ pressed }) => [
            styles.kind,
            kind === 'income' && styles.kindActive,
            pressed && pressedFeedback,
          ]}
        >
          <Text
            style={[
              typography.bodyMd,
              styles.kindLabel,
              kind === 'income' && styles.kindLabelActive,
            ]}
          >
            {transactionTypeLabel('income', language)}
          </Text>
        </Pressable>
      </View>
      <View style={styles.field}>
        <Text style={[typography.bodySm, styles.label]}>{t.confirmName}</Text>
        <TextInput
          testID="voice-confirm-note"
          style={styles.input}
          value={note}
          onChangeText={(next) => setNote(next.slice(0, 200))}
          placeholderTextColor={colors.textSecondary}
          selectionColor={colors.accent}
          maxLength={200}
          multiline
        />
      </View>
      <View style={styles.field}>
        <Text style={[typography.bodySm, styles.label]}>{t.confirmAmount}</Text>
        <TextInput
          testID="voice-confirm-amount"
          style={[styles.input, styles.amount]}
          value={amountRaw}
          onChangeText={(next) => setAmountRaw(next.replace(/[^\d]/g, '').slice(0, 12))}
          keyboardType="number-pad"
          selectionColor={colors.accent}
        />
        {amountValid ? (
          <Text style={[typography.bodySm, styles.preview]}>
            {formatGrouped(amountDigits, language)} · {walletName} · {categoryName}
          </Text>
        ) : null}
      </View>
      <View style={styles.meta}>
        <Text style={[typography.bodySm, styles.label]}>
          {t.confirmCategory}: {categoryName}
        </Text>
        <Text style={[typography.bodySm, styles.label]}>
          {t.confirmWallet}: {walletName}
        </Text>
      </View>
      <PrimaryButton
        testID="voice-confirm-save"
        label={t.confirmSave}
        onPress={() =>
          amountValid &&
          onConfirm({
            amount: amountDigits,
            kind,
            walletId,
            categoryHint: prefill.categoryHint,
            note: note.trim() === '' ? prefill.note : note.trim().slice(0, 200),
          })
        }
        loading={busy}
      />
      <Pressable
        testID="voice-confirm-cancel"
        accessibilityRole="button"
        onPress={onCancel}
        style={({ pressed }) => [styles.cancel, pressed && pressedFeedback]}
      >
        <Text style={[typography.bodyMd, styles.cancelLabel]}>{t.confirmRetry}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.sm,
  },
  kicker: {
    color: colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  kind: {
    flex: 1,
    minHeight: layout.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  kindActive: {
    borderColor: colors.accent,
  },
  kindLabel: {
    color: colors.textSecondary,
  },
  kindLabelActive: {
    color: colors.accent,
  },
  field: {
    gap: spacing.xs,
  },
  label: {
    color: colors.textSecondary,
  },
  input: {
    minHeight: layout.minTapTarget,
    color: colors.textPrimary,
    ...typography.bodyLg,
    textAlignVertical: 'top',
  },
  amount: {
    fontFamily: typography.currencyMd.fontFamily,
  },
  preview: {
    color: colors.accent,
  },
  meta: {
    gap: spacing.xs / 2,
  },
  cancel: {
    minHeight: layout.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelLabel: {
    color: colors.textSecondary,
  },
});
