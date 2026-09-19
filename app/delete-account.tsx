/**
 * Delete-account flow (route `/delete-account`, T9 follow-up issue #22).
 *
 * Two-step confirmation (spec story 47): the destructive action stays
 * disabled until the user types exactly "HAPUS" (checked client-side via
 * `isDeleteConfirmation`). The copy states explicitly that the operation is
 * irreversible. On success the server has removed every row + the avatar +
 * the Auth user, so the screen signs out locally and the auth gate sends the
 * user to Login.
 */
import { router } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, GhostButton, PrimaryButton, Screen, TextField } from '@/components';
import { signOut } from '@/features/auth';
import {
  DELETE_CONFIRMATION_WORD,
  deleteAccount,
  isDeleteConfirmation,
} from '@/features/data-ownership';
import { colors, layout, radius, spacing, typography } from '@/theme';

export default function DeleteAccountScreen() {
  const insets = useSafeAreaInsets();
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);

  const confirmed = isDeleteConfirmation(confirmation);

  function confirmDelete() {
    Alert.alert(
      'Hapus akun permanen?',
      'Ini langkah terakhir. Seluruh data akan dihapus dan tidak bisa dikembalikan.',
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Ya, hapus', style: 'destructive', onPress: () => void remove() },
      ],
    );
  }

  async function remove() {
    if (!confirmed || busy) return;
    setBusy(true);
    try {
      await deleteAccount();
      // The server-side user is gone; drop the local session so the auth
      // gate parks the user on Login (signOut tolerates the dead token).
      await signOut();
    } catch (cause) {
      setBusy(false);
      Alert.alert(
        'Gagal menghapus akun',
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
          <Text style={[typography.labelUppercase, styles.kicker]}>
            Danger zone
          </Text>
          <Text style={[typography.headlineLg, styles.title]}>Hapus akun</Text>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Card borderColor={colors.error} style={styles.warning}>
            <MaterialIcons
              name="warning-amber"
              size={24}
              color={colors.error}
            />
            <Text style={[typography.bodyMd, styles.warningText]}>
              Menghapus akun bersifat permanen dan tidak dapat dibatalkan.
              Seluruh dompet, transaksi, budget, kategori kustom, dan avatar
              Anda akan dihapus.
            </Text>
          </Card>

          <Text style={[typography.bodyMd, styles.instruction]}>
            Ketik {DELETE_CONFIRMATION_WORD} untuk melanjutkan.
          </Text>
          <TextField
            testID="delete-account-confirmation"
            value={confirmation}
            onChangeText={setConfirmation}
            placeholder={DELETE_CONFIRMATION_WORD}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (confirmed) confirmDelete();
            }}
          />
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: spacing.md }]}>
          <View style={styles.deleteFrame}>
            <PrimaryButton
              testID="delete-account-submit"
              label={busy ? 'Menghapus…' : 'Hapus akun permanen'}
              onPress={confirmDelete}
              loading={busy}
              disabled={!confirmed}
            />
          </View>
          <GhostButton
            testID="delete-account-cancel"
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
    gap: spacing.xs,
  },
  kicker: {
    color: colors.error,
  },
  title: {
    color: colors.textPrimary,
  },
  body: {
    gap: spacing.md,
    paddingTop: spacing.lg,
    paddingBottom: layout.navClearance,
  },
  warning: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md,
  },
  warningText: {
    flex: 1,
    color: colors.textPrimary,
  },
  instruction: {
    color: colors.textSecondary,
  },
  footer: {
    gap: spacing.xs,
  },
  deleteFrame: {
    // Destructive affordance without a hex literal (PRD §4.5): the error
    // border marks the danger action while the fill stays thematic.
    borderWidth: 1,
    borderColor: colors.error,
    borderRadius: radius.md,
  },
});
