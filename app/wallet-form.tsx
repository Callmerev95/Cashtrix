/**
 * Wallet create/edit sheet (route `/wallet-form`).
 *
 * Fields: name, type (segmented), opening balance (currency entry styled like
 * the transaction form — static gold `Rp` + mono numerals). Validation is the
 * pure `validateWallet` from the Jest seam, so inline copy matches ticket #5.
 *
 * `?id=` switches to edit mode; the wallet is read from `useWallets()` so no
 * extra query is needed.
 */
import { useLocalSearchParams, router } from 'expo-router';
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

import { GhostButton, PrimaryButton, Screen, TextField } from '@/components';
import { useAuth } from '@/features/auth';
import {
  MAX_WALLETS,
  createWallet,
  formatAmount,
  hasWalletErrors,
  openingBalanceFromInput,
  parseAmountInput,
  updateWallet,
  useWallets,
  validateWallet,
  walletMessages,
  type WalletFieldErrors,
  type WalletType,
} from '@/features/wallets';
import { WalletTypePicker } from '@/features/wallets/components/wallet-type-picker';
import { colors, fontFamily, layout, radius, spacing, typography } from '@/theme';

export default function WalletFormScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { session } = useAuth();
  const { wallets, summary, refresh } = useWallets();
  const insets = useSafeAreaInsets();

  const editing = useMemo(
    () => wallets.find((wallet) => wallet.id === params.id),
    [wallets, params.id],
  );
  const isEdit = Boolean(params.id);

  const [name, setName] = useState(editing?.name ?? '');
  const [type, setType] = useState<WalletType>(editing?.type ?? 'bank');
  const [openingRaw, setOpeningRaw] = useState(
    editing ? formatAmount(editing.openingBalance) : '',
  );
  const [errors, setErrors] = useState<WalletFieldErrors>({});
  const [busy, setBusy] = useState(false);

  const atLimit = !isEdit && summary.remainingSlots <= 0;

  async function save() {
    const nextErrors = validateWallet({
      name,
      openingBalanceRaw: openingRaw,
      existingNames: wallets
        .filter((wallet) => wallet.id !== params.id)
        .map((wallet) => wallet.name),
    });
    setErrors(nextErrors);
    if (hasWalletErrors(nextErrors)) return;

    setBusy(true);
    try {
      const openingBalance = openingBalanceFromInput(openingRaw);

      if (isEdit && params.id) {
        await updateWallet({ id: params.id, name, type, openingBalance });
      } else {
        if (!session?.user.id) throw new Error('Sesi tidak ditemukan');
        await createWallet({
          userId: session.user.id,
          name,
          type,
          openingBalance,
        });
      }

      await refresh();
      router.back();
    } catch (cause) {
      setBusy(false);
      Alert.alert(
        isEdit ? 'Gagal menyimpan perubahan' : 'Gagal membuat wallet',
        cause instanceof Error ? cause.message : 'Coba lagi sebentar lagi.',
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
            accessibilityRole="button"
            accessibilityLabel="Tutup"
            onPress={() => router.back()}
            style={styles.close}
          >
            <MaterialIcons name="close" size={24} color={colors.textSecondary} />
          </Pressable>
          <Text style={[typography.headlineMd, styles.title]}>
            {isEdit ? 'Ubah Wallet' : 'Wallet Baru'}
          </Text>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[typography.labelUppercase, styles.kicker]}>Nama</Text>
          <TextField
            testID="wallet-name"
            value={name}
            onChangeText={setName}
            placeholder="BCA, GoPay, Dompet…"
            autoCapitalize="words"
            maxLength={70}
            hasError={Boolean(errors.name)}
            returnKeyType="next"
          />
          {errors.name ? (
            <Text style={[typography.bodySm, styles.error]}>{errors.name}</Text>
          ) : null}

          <Text style={[typography.labelUppercase, styles.kicker, styles.gap]}>
            Tipe
          </Text>
          <WalletTypePicker value={type} onChange={setType} />

          <Text style={[typography.labelUppercase, styles.kicker, styles.gap]}>
            Saldo Awal
          </Text>
          <View style={[styles.amountWell, errors.openingBalance && styles.amountError]}>
            <Text style={[typography.currencyMd, styles.rp]}>Rp</Text>
            {/*
              The flex:1 wrapper is load-bearing: TextField's root View has no
              flex of its own, so without this it collapses to the placeholder
              width inside the row and typed digits clip invisibly (the value
              still saves correctly). The transaction AmountField avoids this
              by owning the whole row well; here the `Rp` glyph shares it.
            */}
            <View style={styles.amountField}>
              <TextField
                testID="wallet-opening"
                value={openingRaw}
                onChangeText={(text) => {
                  const parsed = text.trim() === '' ? 0 : parseAmountInput(text);
                  setOpeningRaw(parsed === null ? text : formatAmount(parsed));
                }}
                placeholder="0"
                keyboardType="number-pad"
                style={styles.amountInput}
              />
            </View>
          </View>
          {errors.openingBalance ? (
            <Text style={[typography.bodySm, styles.error]}>
              {errors.openingBalance}
            </Text>
          ) : null}

          <Text style={[typography.bodySm, styles.hint]}>
            Maksimal {MAX_WALLETS} wallet per akun.
          </Text>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: spacing.md }]}>
          <PrimaryButton
            testID="wallet-save"
            label={isEdit ? 'Simpan' : 'Buat Wallet'}
            onPress={save}
            loading={busy}
            disabled={atLimit}
          />
          {atLimit ? (
            <Text style={[typography.bodySm, styles.error, styles.limit]}>
              {walletMessages.limitReached}
            </Text>
          ) : null}
          <GhostButton
            testID="wallet-cancel"
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
    color: colors.textPrimary,
    flex: 1,
  },
  body: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  kicker: {
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  gap: {
    marginTop: spacing.lg,
  },
  error: {
    color: colors.error,
    marginTop: spacing.xs,
  },
  amountWell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  amountError: {
    // Border colour is owned by TextField's error state; kept for layout parity.
    borderRadius: radius.md,
  },
  rp: {
    color: colors.accent,
  },
  amountField: {
    flex: 1,
  },
  amountInput: {
    fontFamily: fontFamily.monoMedium,
    fontSize: typography.currencyDisplay.fontSize,
    lineHeight: typography.currencyDisplay.lineHeight,
  },
  hint: {
    marginTop: spacing.md,
    color: colors.textSecondary,
  },
  footer: {
    gap: spacing.xs,
  },
  limit: {
    textAlign: 'center',
    marginTop: spacing.xs,
  },
});
