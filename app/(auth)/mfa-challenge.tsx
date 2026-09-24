/**
 * MFA challenge screen (C2, #53) — the login second step.
 *
 * The auth gate parks `mfaRequired` sessions here (same shape as V0's
 * check-email hold). The screen lists the verified TOTP factor, verifies one
 * 6-digit code, and then does nothing: the verify upgrades the session to
 * aal2, the auth context re-resolves to `authenticated`, and the gate swaps
 * to the tabs. Escape is sign-out (an aal1 session must not linger).
 */
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, GhostButton, LogoMark, PrimaryButton, TextField } from '@/components';
import { runSeedUser, signOut } from '@/features/auth';
import {
  listMfaFactors,
  validateMfaCode,
  verifiedTotpFactorId,
  verifyTotpCode,
} from '@/features/mfa';
import { dictionaryFor, useLanguage } from '@/i18n';
import { colors, radius, spacing, typography } from '@/theme';

export default function MfaChallengeScreen() {
  const insets = useSafeAreaInsets();
  const language = useLanguage();
  const t = dictionaryFor(language).mfa;

  const [factorId, setFactorId] = useState<string | null>(null);
  const [loadingFactors, setLoadingFactors] = useState(true);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  // One factors read on mount (promise callback, never sync setState in the
  // effect body — same lint rule as every other provider/screen).
  useEffect(() => {
    let cancelled = false;
    listMfaFactors()
      .then(({ all }) => {
        if (cancelled) return;
        setFactorId(verifiedTotpFactorId(all));
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setCodeError(cause instanceof Error ? cause.message : t.challenge.fail);
      })
      .finally(() => {
        if (!cancelled) setLoadingFactors(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t.challenge.fail]);

  async function onSubmit() {
    const message = validateMfaCode(code, language);
    setCodeError(message);
    if (message || !factorId || busy) return;
    setBusy(true);
    try {
      await verifyTotpCode(factorId, code);
      // Idempotent — covers a login whose own seed hit the network gap.
      await runSeedUser().catch(() => undefined);
      // The gate reacts to the aal2 session and swaps to the tabs.
    } catch (cause) {
      setCodeError(cause instanceof Error ? cause.message : t.challenge.fail);
    } finally {
      setBusy(false);
    }
  }

  async function onBackToLogin() {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await signOut();
      // The gate swaps to Login; nothing to navigate here.
    } catch {
      setSigningOut(false);
      setCodeError(t.challenge.fail);
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
          <Text style={[typography.headlineLg, styles.title]}>{t.challenge.title}</Text>
          <Text style={[typography.bodyMd, styles.subtitle]}>{t.challenge.subtitle}</Text>
        </View>

        <Card testID="mfa-challenge-screen" style={styles.card}>
          <View>
            <Text style={[typography.labelUppercase, styles.fieldLabel]}>
              {t.enroll.codeLabel}
            </Text>
            <TextField
              testID="mfa-challenge-code"
              accessibilityLabel={t.enroll.codeLabel}
              placeholder={t.enroll.codePlaceholder}
              keyboardType="number-pad"
              textContentType="oneTimeCode"
              autoComplete="one-time-code"
              maxLength={9}
              value={code}
              hasError={Boolean(codeError)}
              onChangeText={(text) => {
                setCode(text);
                if (codeError) setCodeError(validateMfaCode(text, language));
              }}
              onSubmitEditing={() => void onSubmit()}
            />
            {codeError ? (
              <Text testID="mfa-challenge-error" style={styles.fieldError}>
                {codeError}
              </Text>
            ) : null}
            {!loadingFactors && !factorId && !codeError ? (
              <Text testID="mfa-challenge-error" style={styles.fieldError}>
                {t.challenge.noFactor}
              </Text>
            ) : null}
          </View>

          <PrimaryButton
            testID="mfa-challenge-submit"
            label={t.challenge.submit}
            onPress={() => void onSubmit()}
            loading={busy || loadingFactors}
            disabled={!factorId}
            style={styles.cta}
          />
        </Card>

        <View style={styles.footer}>
          <GhostButton
            testID="mfa-challenge-back"
            label={signingOut ? t.enroll.cancel : t.challenge.backToLogin}
            onPress={() => void onBackToLogin()}
            disabled={signingOut}
          />
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
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
