/**
 * Sign-in screen — DESIGN.md §6 Login ("Welcome Back"): centered stack on the
 * obsidian canvas, headline-lg, Layer-2 inputs, full-width gold CTA, ghost
 * tertiary link to Register.
 *
 * Validation is synchronous and *local*: a failing form never sends a request
 * (PRD §2.3 Epic A / R2).
 */
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, GhostButton, LogoMark, PrimaryButton, TextField } from '@/components';
import {
  isEmailNotConfirmedError,
  loginErrorMessage,
  runSeedUser,
  signInWithEmail,
  validateRegister,
  hasErrors,
  type FieldErrors,
} from '@/features/auth';
import { colors, radius, spacing, typography } from '@/theme';
import { dictionaryFor, useLanguage } from '@/i18n';

// Legal URLs (GitHub Pages) — same for in-app and store listing (ADR-0006)
const LEGAL = {
  privacy: 'https://callmerev95.github.io/Cashtrix/privacy.html',
  terms: 'https://callmerev95.github.io/Cashtrix/terms.html',
} as const;

export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  // C6: copy follows the OS language (ADR-0008).
  const language = useLanguage();
  const t = dictionaryFor(language);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    const validation = validateRegister(email, password, language);
    // Login only cares that both fields are present and well-formed; the
    // password *strength* rules belong to Register.
    const blocking = { email: validation.email };
    setErrors(blocking);
    setFormError('');
    setUnconfirmed(false);
    if (hasErrors(blocking)) return;

    setBusy(true);
    try {
      await signInWithEmail(email, password);
      // V0: with email confirmation on, signup creates no session, so the
      // first post-confirmation login is what seeds the Cash wallet.
      // Idempotent — safe on every login, failures never block entry.
      await runSeedUser().catch(() => undefined);
      // The root layout's gate reacts to the auth state change and swaps to
      // the tabs; nothing to navigate here.
    } catch (error) {
      const err = error as { status?: number; code?: string };
      setFormError(loginErrorMessage(err, language));
      setUnconfirmed(isEmailNotConfirmedError(err));
    } finally {
      setBusy(false);
    }
  }

  function openLegal(url: string) {
    Linking.openURL(url).catch(() => undefined);
  }

  // No KeyboardAvoidingView: the ScrollView insets itself around the
  // keyboard (automaticallyAdjustKeyboardInsets on iOS, adjustResize on
  // Android), so an extra padding pass would only fight it.
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
          <Text style={[typography.headlineLg, styles.title]}>Welcome Back</Text>
          <Text style={[typography.bodyMd, styles.subtitle]}>
            {t.auth.login.subtitle}
          </Text>
        </View>

        <Card style={styles.card}>
          <View>
            <Text style={[typography.labelUppercase, styles.fieldLabel]}>Email</Text>
            <TextField
              testID="login-email"
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
              onSubmitEditing={onSubmit}
            />
            {errors.email ? (
              <Text style={styles.fieldError}>{errors.email}</Text>
            ) : null}
          </View>

          <View>
            <Text style={[typography.labelUppercase, styles.fieldLabel]}>Password</Text>
            <TextField
              testID="login-password"
              accessibilityLabel="Password"
              placeholder="••••••••"
              icon="lock-outline"
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
          </View>

          {formError ? <Text style={styles.formError}>{formError}</Text> : null}
          {unconfirmed ? (
            <GhostButton
              label={t.auth.login.resend}
              testID="login-resend"
              onPress={() =>
                router.push({ pathname: '/(auth)/check-email', params: { email: email.trim() } })
              }
            />
          ) : null}

          <PrimaryButton
            testID="login-submit"
            label={t.auth.login.submit}
            onPress={onSubmit}
            loading={busy}
            style={styles.cta}
          />
        </Card>

        <View style={styles.footer}>
          <Text style={[typography.bodySm, styles.footerText]}>{t.auth.login.toRegisterPrompt}</Text>
          <Link href="/(auth)/register" asChild>
            <GhostButton label={t.auth.login.toRegister} testID="login-to-register" />
          </Link>
        </View>

        <View style={styles.footer}>
          <Link href="/(auth)/forgot-password" asChild>
            <GhostButton label={t.auth.login.forgot} testID="login-forgot-password" />
          </Link>
        </View>

        <View style={styles.legal}>
          <Text style={[typography.bodySm, styles.legalText]}>{t.auth.legal.loginPrefix}</Text>
          <Text
            style={[typography.bodySm, styles.legalLink]}
            accessibilityRole="link"
            testID="login-terms-link"
            onPress={() => openLegal(LEGAL.terms)}
          >
            {t.auth.legal.terms}
          </Text>
          <Text style={[typography.bodySm, styles.legalText]}>{t.auth.legal.and}</Text>
          <Text
            style={[typography.bodySm, styles.legalLink]}
            accessibilityRole="link"
            testID="login-privacy-link"
            onPress={() => openLegal(LEGAL.privacy)}
          >
            {t.auth.legal.privacy}
          </Text>
          <Text style={[typography.bodySm, styles.legalText]}>.</Text>
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
    borderRadius: radius.xl,
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
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  footerText: {
    color: colors.textSecondary,
  },
  legal: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 2,
    marginTop: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  legalText: {
    color: colors.textSecondary,
  },
  legalLink: {
    color: colors.accent,
  },
});
