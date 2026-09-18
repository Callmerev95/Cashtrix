/**
 * Sign-in screen — DESIGN.md §6 Login ("Welcome Back"): centered stack on the
 * obsidian canvas, headline-lg, Layer-2 inputs, full-width gold CTA, ghost
 * tertiary link to Register.
 *
 * Validation is synchronous and *local*: a failing form never sends a request
 * (PRD §2.3 Epic A / R2).
 */
import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GhostButton, PrimaryButton, TextField } from '@/components';
import {
  loginErrorMessage,
  signInWithEmail,
  validateRegister,
  hasErrors,
  type FieldErrors,
} from '@/features/auth';
import { colors, spacing, typography } from '@/theme';

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    const validation = validateRegister(email, password);
    // Login only cares that both fields are present and well-formed; the
    // password *strength* rules belong to Register.
    const blocking = { email: validation.email };
    setErrors(blocking);
    setFormError('');
    if (hasErrors(blocking)) return;

    setBusy(true);
    try {
      await signInWithEmail(email, password);
      // The root layout's gate reacts to the auth state change and swaps to
      // the tabs; nothing to navigate here.
    } catch (error) {
      setFormError(loginErrorMessage(error as { status?: number; code?: string }));
    } finally {
      setBusy(false);
    }
  }

  // No KeyboardAvoidingView here: its padding pass re-lays the centered
  // content out from under the focused field when the keyboard opens, which
  // drops focus and dismisses the keyboard instantly. The ScrollView insets
  // itself around the keyboard instead.
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
          <Text style={[typography.labelUppercase, styles.kicker]}>Cashtrix</Text>
          <Text style={[typography.headlineLg, styles.title]}>Welcome Back</Text>
          <Text style={[typography.bodyMd, styles.subtitle]}>
            Masuk untuk melihat posisi keuangan Anda.
          </Text>
        </View>

        <View style={styles.form}>
          <TextField
            testID="login-email"
            accessibilityLabel="Email"
            placeholder="Email"
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            textContentType="emailAddress"
            value={email}
            hasError={Boolean(errors.email)}
            onChangeText={setEmail}
            onSubmitEditing={onSubmit}
          />
          {errors.email ? (
            <Text style={styles.fieldError}>{errors.email}</Text>
          ) : null}

          <TextField
            testID="login-password"
            accessibilityLabel="Password"
            placeholder="Password"
            secureToggle
            autoCapitalize="none"
            autoComplete="current-password"
            textContentType="password"
            value={password}
            hasError={Boolean(errors.password)}
            onChangeText={setPassword}
            onSubmitEditing={onSubmit}
          />
          {errors.password ? (
            <Text style={styles.fieldError}>{errors.password}</Text>
          ) : null}

          {formError ? <Text style={styles.formError}>{formError}</Text> : null}

          <PrimaryButton
            testID="login-submit"
            label="Masuk"
            onPress={onSubmit}
            loading={busy}
            style={styles.cta}
          />
        </View>

        <View style={styles.footer}>
          <Text style={[typography.bodySm, styles.footerText]}>Belum punya akun?</Text>
          <Link href="/(auth)/register" asChild>
            <GhostButton label="Daftar" testID="login-to-register" />
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
  header: {
    gap: spacing.xs,
  },
  kicker: {
    color: colors.accent,
  },
  title: {
    color: colors.textPrimary,
  },
  subtitle: {
    color: colors.textSecondary,
  },
  form: {
    gap: spacing.sm,
  },
  cta: {
    marginTop: spacing.md,
  },
  fieldError: {
    ...typography.bodySm,
    color: colors.error,
  },
  formError: {
    ...typography.bodyMd,
    color: colors.error,
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
