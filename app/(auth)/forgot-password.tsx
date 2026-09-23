/**
 * Forgot Password screen — V0: user requests a password reset email.
 * DESIGN.md §6 auth pattern: centered stack, gold CTA.
 */
import { Link } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, GhostButton, LogoMark, PrimaryButton, TextField } from '@/components';
import { sendPasswordResetEmail, validateRegister, type FieldErrors } from '@/features/auth';
import { dictionaryFor, useLanguage } from '@/i18n';
import { colors, radius, spacing, typography } from '@/theme';

export default function ForgotPasswordScreen() {
  const insets = useSafeAreaInsets();
  // C6: copy follows the OS language (ADR-0008).
  const language = useLanguage();
  const t = dictionaryFor(language);
  const [email, setEmail] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit() {
    const validation = validateRegister(email, '', language);
    // Only validate email field for forgot password
    const emailError = validation.email;
    setErrors({ email: emailError });
    setFormError('');
    setSuccessMessage('');
    if (emailError) return;

    setBusy(true);
    try {
      await sendPasswordResetEmail(email);
      setSuccessMessage(t.auth.forgot.success);
    } catch {
      setFormError(t.auth.forgot.fail);
    } finally {
      setBusy(false);
    }
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
          <Text style={[typography.headlineLg, styles.title]}>{t.auth.forgot.title}</Text>
          <Text style={[typography.bodyMd, styles.subtitle]}>
            {t.auth.forgot.subtitle}
          </Text>
        </View>

        <Card style={styles.card}>
          <View>
            <Text style={[typography.labelUppercase, styles.fieldLabel]}>Email</Text>
            <TextField
              testID="forgot-password-email"
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
            {errors.email ? <Text style={styles.fieldError}>{errors.email}</Text> : null}
          </View>

          {formError ? <Text style={styles.formError}>{formError}</Text> : null}
          {successMessage ? <Text style={styles.successMessage}>{successMessage}</Text> : null}

          <PrimaryButton
            testID="forgot-password-submit"
            label={t.auth.forgot.submit}
            onPress={onSubmit}
            loading={busy}
            style={styles.cta}
          />
        </Card>

        <View style={styles.footer}>
          <Text style={[typography.bodySm, styles.footerText]}>{t.auth.forgot.toLoginPrompt}</Text>
          <Link href="/(auth)/login" asChild>
            <GhostButton label={t.auth.forgot.toLogin} testID="forgot-password-to-login" />
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
  successMessage: {
    ...typography.bodySm,
    color: colors.accent,
    textAlign: 'center',
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