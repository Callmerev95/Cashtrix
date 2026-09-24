/**
 * MFA enroll screen (C2, #53) — root modal opened from the Profile 2FA row.
 *
 * Flow: auto-enroll on mount → show the secret → verify one 6-digit code →
 * refresh the MFA status and go back. Cancel best-effort unenrolls the still
 * unverified factor so no orphan lingers in `listFactors().all`.
 *
 * No QR image on purpose: `mfa.enroll` returns the QR as an SVG data-URL and
 * this app ships no SVG renderer (adding `react-native-svg` would force a
 * dev-client rebuild — the same reason the T6 donut and T7 ring are
 * View-composed). The native equivalent is the `otpauth://` URI handed to
 * the authenticator app via `Linking` plus the secret as selectable text
 * for manual entry — every authenticator app accepts both.
 */
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { Card, GhostButton, PrimaryButton, Screen, TextField } from '@/components';
import {
  enrollTotp,
  unenrollMfaFactor,
  useMfa,
  validateMfaCode,
  verifyTotpCode,
  type TotpEnrollment,
} from '@/features/mfa';
import { dictionaryFor, useLanguage } from '@/i18n';
import { colors, fontFamily, radius, spacing, typography } from '@/theme';

export default function MfaEnrollScreen() {
  const language = useLanguage();
  const t = dictionaryFor(language).mfa;
  const { refresh } = useMfa();

  const [enrollment, setEnrollment] = useState<TotpEnrollment | null>(null);
  const [starting, setStarting] = useState(true);
  const [startError, setStartError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [leaving, setLeaving] = useState(false);
  // Set once the code verifies — cancel after this point must NOT delete
  // the now-live factor.
  const verified = useRef(false);

  // Auto-enroll once (promise callback, never sync setState in the effect).
  useEffect(() => {
    let cancelled = false;
    enrollTotp()
      .then((result) => {
        if (cancelled) return;
        setEnrollment(result);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setStartError(
          cause instanceof Error ? cause.message : t.enroll.startFail,
        );
      })
      .finally(() => {
        if (!cancelled) setStarting(false);
      });
    return () => {
      cancelled = true;
    };
  }, [t.enroll.startFail]);

  async function onCancel() {
    if (leaving) return;
    setLeaving(true);
    try {
      if (enrollment && !verified.current) {
        await unenrollMfaFactor(enrollment.factorId).catch(() => undefined);
      }
    } finally {
      router.back();
    }
  }

  async function onSubmit() {
    const message = validateMfaCode(code, language);
    setCodeError(message);
    if (message || !enrollment || busy) return;
    setBusy(true);
    try {
      await verifyTotpCode(enrollment.factorId, code);
      verified.current = true;
      await refresh();
      router.back();
    } catch (cause) {
      setCodeError(
        cause instanceof Error ? cause.message : t.enroll.verifyFail,
      );
    } finally {
      setBusy(false);
    }
  }

  function onOpenAuthenticator() {
    if (!enrollment) return;
    Linking.openURL(enrollment.uri).catch(() => undefined);
  }

  return (
    <Screen style={styles.frame} testID="mfa-enroll-screen">
      <View style={styles.header}>
        <Text style={[typography.headlineMd, styles.title]}>{t.enroll.title}</Text>
        <GhostButton
          testID="mfa-enroll-cancel"
          label={t.enroll.cancel}
          onPress={() => void onCancel()}
          disabled={leaving}
        />
      </View>

      <Text style={[typography.bodyMd, styles.intro]}>{t.enroll.intro}</Text>

      {starting ? (
        <Text style={[typography.bodyMd, styles.hint]}>{t.enroll.starting}</Text>
      ) : startError ? (
        <Card style={styles.card}>
          <Text testID="mfa-enroll-error" style={[typography.bodyMd, styles.errorText]}>
            {startError}
          </Text>
        </Card>
      ) : enrollment ? (
        <Card style={styles.card}>
          <Text style={[typography.labelUppercase, styles.kicker]}>
            {t.enroll.secretLabel}
          </Text>
          <Text
            testID="mfa-enroll-secret"
            selectable
            style={[typography.bodyMd, styles.secret]}
          >
            {enrollment.secret}
          </Text>
          <GhostButton
            testID="mfa-enroll-open"
            label={t.enroll.openAuth}
            onPress={onOpenAuthenticator}
          />

          <Text style={[typography.labelUppercase, styles.kicker]}>
            {t.enroll.codeLabel}
          </Text>
          <TextField
            testID="mfa-enroll-code"
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
            <Text testID="mfa-enroll-error" style={[typography.bodySm, styles.errorText]}>
              {codeError}
            </Text>
          ) : null}

          <PrimaryButton
            testID="mfa-enroll-submit"
            label={t.enroll.submit}
            onPress={() => void onSubmit()}
            loading={busy}
          />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  frame: {
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  title: {
    flex: 1,
    color: colors.textPrimary,
  },
  intro: {
    color: colors.textSecondary,
  },
  hint: {
    color: colors.textSecondary,
  },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
  },
  kicker: {
    color: colors.textSecondary,
  },
  secret: {
    color: colors.textPrimary,
    fontFamily: fontFamily.monoMedium,
    letterSpacing: 1,
  },
  errorText: {
    color: colors.error,
  },
});
