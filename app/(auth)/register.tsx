/**
 * Register screen — DESIGN.md §6 Register ("Cashtrix"): same auth pattern as
 * Login, stacked inputs, gold CTA.
 *
 * With hosted auto-confirm enabled (PRD §6.1 R2) Supabase returns a session
 * immediately, so the gate drops the user straight on the Dashboard. If
 * confirmation is ever re-enabled, we must *not* navigate — the screen says so
 * and offers a write path, because reporting "want to log in?" (AuthApiError)
 * as a hard failure would lose a real account.
 */
import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GhostButton, LogoMark, PrimaryButton, TextField } from '@/components';
import {
  PASSWORD_MIN_LENGTH,
  runSeedUser,
  registerErrorMessage,
  signUpWithEmail,
  validateRegister,
  hasErrors,
  type FieldErrors,
} from '@/features/auth';
import { colors, radius, spacing, typography } from '@/theme';

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [confirmationPending, setConfirmationPending] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    const validation = validateRegister(email, password);
    setErrors(validation);
    setFormError('');
    // Nothing leaves the device while the form is invalid.
    if (hasErrors(validation)) return;

    setBusy(true);
    try {
      const { hasSession } = await signUpWithEmail(email, password);
      if (!hasSession) {
        setConfirmationPending(true);
        return;
      }
      // Seeding is best-effort: the user is already authenticated, and the
      // function is idempotent, so a transient failure must not look like a
      // failed registration. The next login retries it.
      await runSeedUser().catch(() => undefined);
    } catch (error) {
      setFormError(registerErrorMessage(error as { status?: number }));
    } finally {
      setBusy(false);
    }
  }

  if (confirmationPending) {
    return (
      <View
        style={[styles.flex, styles.confirmFrame, { paddingBottom: insets.bottom + spacing.xl }]}
      >
        <Text style={[typography.headlineMd, styles.title]}>Cek email Anda</Text>
        <Text style={[typography.bodyMd, styles.subtitle]}>
          Kami mengirim tautan verifikasi ke {email.trim()}. Buka tautan itu, lalu masuk
          dengan akun Anda.
        </Text>
        <Link href="/(auth)/login" asChild>
          <PrimaryButton label="Ke halaman masuk" onPress={() => undefined} />
        </Link>
      </View>
    );
  }

  // Same keyboard handling as Login: no KeyboardAvoidingView (see note there).
  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + spacing.xl, paddingBottom: insets.bottom + spacing.xl },
        ]}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        <View style={styles.header}>
          <LogoMark size={72} />
          <Text style={[typography.labelUppercase, styles.kicker]}>Cashtrix</Text>
          <Text style={[typography.headlineLg, styles.title]}>Buat Akun</Text>
          <Text style={[typography.bodyMd, styles.subtitle]}>
            Satu akun untuk seluruh wallet dan transaksi Anda.
          </Text>
        </View>

        <View style={styles.card}>
          <View>
            <Text style={[typography.labelUppercase, styles.fieldLabel]}>Email</Text>
            <TextField
              testID="register-email"
              accessibilityLabel="Email"
              placeholder="nama@email.com"
              icon="mail-outline"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              value={email}
              hasError={Boolean(errors.email)}
              onChangeText={setEmail}
            />
            {errors.email ? <Text style={styles.fieldError}>{errors.email}</Text> : null}
          </View>

          <View>
            <Text style={[typography.labelUppercase, styles.fieldLabel]}>Password</Text>
            <TextField
              testID="register-password"
              accessibilityLabel="Password"
              placeholder="••••••••"
              icon="lock-outline"
              secureToggle
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              value={password}
              hasError={Boolean(errors.password)}
              onChangeText={setPassword}
            />
            {errors.password ? (
              <Text style={styles.fieldError}>{errors.password}</Text>
            ) : (
              <Text style={styles.hint}>
                Minimal {PASSWORD_MIN_LENGTH} karakter, memuat huruf dan angka.
              </Text>
            )}
          </View>

          {formError ? <Text style={styles.formError}>{formError}</Text> : null}

          <PrimaryButton
            testID="register-submit"
            label="Daftar"
            onPress={onSubmit}
            loading={busy}
            style={styles.cta}
          />
        </View>

        <View style={styles.footer}>
          <Text style={[typography.bodySm, styles.footerText]}>Sudah punya akun?</Text>
          <Link href="/(auth)/login" asChild>
            <GhostButton label="Masuk" testID="register-to-login" />
          </Link>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.margin,
    gap: spacing.xl,
  },
  confirmFrame: {
    justifyContent: 'center',
    paddingHorizontal: spacing.margin,
    gap: spacing.md,
  },
  header: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  kicker: {
    color: colors.accent,
  },
  title: {
    color: colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  fieldLabel: {
    marginBottom: spacing.xs,
    color: colors.textSecondary,
  },
  cta: {
    marginTop: spacing.md,
  },
  fieldError: {
    marginTop: spacing.xs,
    ...typography.bodySm,
    color: colors.error,
  },
  formError: {
    ...typography.bodyMd,
    color: colors.error,
  },
  hint: {
    marginTop: spacing.xs,
    ...typography.bodySm,
    color: colors.textSecondary,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  footerText: {
    color: colors.textSecondary,
  },
});
