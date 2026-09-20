/**
 * Register screen — DESIGN.md §6 Register ("Cashtrix"): same auth pattern as
 * Login, stacked inputs, gold CTA.
 *
 * With hosted email confirmations enabled, Supabase returns a session only
 * after verification. The gate drops unconfirmed users at the Check Email screen.
 */
import { Link, router } from 'expo-router';
import { useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, GhostButton, LogoMark, PrimaryButton, TextField } from '@/components';
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

// Legal URLs (GitHub Pages) — same for in-app and store listing (ADR-0006)
const LEGAL = {
  privacy: 'https://callmerev95.github.io/Cashtrix/privacy.html',
  terms: 'https://callmerev95.github.io/Cashtrix/terms.html',
} as const;

export default function RegisterScreen() {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
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
        // Email confirmation required — navigate to check-email with email param
        router.push({ pathname: '/(auth)/check-email', params: { email: email.trim() } });
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

  // Same keyboard handling as Login: no KeyboardAvoidingView (see note there).
  function openLegal(url: string) {
    Linking.openURL(url).catch(() => undefined);
  }

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
          <Text style={[typography.headlineLg, styles.title]}>Buat akun</Text>
          <Text style={[typography.bodyMd, styles.subtitle]}>
            Satu akun untuk seluruh wallet dan transaksi Anda.
          </Text>
        </View>

        <Card style={styles.card}>
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
        </Card>

        <View style={styles.footer}>
          <Text style={[typography.bodySm, styles.footerText]}>Sudah punya akun?</Text>
          <Link href="/(auth)/login" asChild>
            <GhostButton label="Masuk" testID="register-to-login" />
          </Link>
        </View>

        <View style={styles.legal}>
          <Text style={[typography.bodySm, styles.legalText]}>Dengan mendaftar, Anda menyetujui </Text>
          <Text
            style={[typography.bodySm, styles.legalLink]}
            accessibilityRole="link"
            testID="register-terms-link"
            onPress={() => openLegal(LEGAL.terms)}
          >
            Ketentuan Layanan
          </Text>
          <Text style={[typography.bodySm, styles.legalText]}> dan </Text>
          <Text
            style={[typography.bodySm, styles.legalLink]}
            accessibilityRole="link"
            testID="register-privacy-link"
            onPress={() => openLegal(LEGAL.privacy)}
          >
            Kebijakan Privasi
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
