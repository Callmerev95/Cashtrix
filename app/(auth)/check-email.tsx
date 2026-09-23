/**
 * Check Email screen — V0: shown when the user has a session but the email
 * is not confirmed (see the `unconfirmed` gate in `app/_layout.tsx`), and
 * right after register when signup returns no session.
 *
 * Two jobs: re-send the confirmation email, and — when the user taps the
 * email link on this same device — exchange the attached code for a session
 * so the gate drops them straight into the tabs (no second login).
 */
import { Link, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, GhostButton, LogoMark, PrimaryButton } from '@/components';
import { exchangeAuthCallback, resendSignupEmail, useAuth } from '@/features/auth';
import { dictionaryFor, fill, useLanguage } from '@/i18n';
import { colors, radius, spacing, typography } from '@/theme';

export default function CheckEmailScreen() {
  const insets = useSafeAreaInsets();
  // C6: copy follows the OS language (ADR-0008).
  const language = useLanguage();
  const t = dictionaryFor(language);
  const { session } = useAuth();
  const { email: paramEmail } = useLocalSearchParams<{ email?: string }>();
  // Register passes the address as a param; the gate-driven path has no
  // param, so fall back to the session's email — otherwise resend is dead.
  const email = paramEmail ?? session?.user.email ?? '';
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState('');
  const [callbackError, setCallbackError] = useState('');

  // A confirmation tap on this device arrives as a deep link carrying the
  // credential. Exchange it; the auth gate reacts to the new session.
  // State updates live inside promise callbacks (never synchronously in the
  // effect body) per the `react-hooks/set-state-in-effect` rule.
  useEffect(() => {
    function handle(url: string) {
      exchangeAuthCallback(url).catch(() => {
        setCallbackError(t.auth.checkEmail.invalidLink);
      });
    }
    Linking.getInitialURL()
      .then((url) => {
        if (url) handle(url);
      })
      .catch(() => undefined);
    const subscription = Linking.addEventListener('url', ({ url }) => handle(url));
    return () => {
      subscription.remove();
    };
    // `t` is stable for the component lifetime (resolved once per mount).
  }, [t]);

  async function onResend() {
    if (!email.trim() || resending) return;
    setResending(true);
    setResendMessage('');
    try {
      await resendSignupEmail(email);
      setResendMessage(t.auth.checkEmail.resentOk);
    } catch {
      setResendMessage(t.auth.checkEmail.resendFail);
    } finally {
      setResending(false);
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
          <Text style={[typography.headlineLg, styles.title]}>{t.auth.checkEmail.title}</Text>
        </View>

        <Card style={styles.card}>
          <View style={styles.message}>
            <Text style={[typography.bodyMd, styles.subtitle]}>
              {email
                ? fill(t.auth.checkEmail.bodyWithEmail, { email })
                : t.auth.checkEmail.bodyWithoutEmail}
            </Text>
          </View>

          {callbackError ? (
            <Text style={[typography.bodySm, styles.callbackError]}>{callbackError}</Text>
          ) : null}

          {resendMessage ? (
            <Text style={[typography.bodySm, styles.resendMessage]}>{resendMessage}</Text>
          ) : null}

          <View style={styles.actions}>
            <PrimaryButton
              testID="check-email-resend"
              label={resending ? t.auth.checkEmail.resending : t.auth.checkEmail.resend}
              onPress={onResend}
              loading={resending}
              style={styles.resendButton}
            />
            <Link href="/(auth)/login" asChild>
              <GhostButton label={t.auth.checkEmail.toLogin} testID="check-email-to-login" />
            </Link>
          </View>
        </Card>
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
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.xl,
  },
  message: {
    gap: spacing.sm,
  },
  subtitle: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  callbackError: {
    color: colors.error,
    textAlign: 'center',
  },
  resendMessage: {
    color: colors.accent,
    textAlign: 'center',
  },
  actions: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  resendButton: {
    width: '100%',
  },
});
