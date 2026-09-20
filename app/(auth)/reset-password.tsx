/**
 * Reset Password screen — V0: handles the deep link
 * `cashtrix://reset-password` from the recovery email, then shows the new
 * password form (Epic A rules, same as Register).
 *
 * The recovery link carries a PKCE `code` (or hash tokens). The client runs
 * with `detectSessionInUrl: false`, so this screen exchanges the credential
 * itself: verifying → form → success. The auth gate moves the user to the
 * tabs once the recovery session lands.
 */
import { Link } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card, GhostButton, LogoMark, PrimaryButton, TextField } from '@/components';
import {
  exchangeAuthCallback,
  isValidPassword,
  PASSWORD_MIN_LENGTH,
  updatePassword,
  useAuth,
  type FieldErrors,
} from '@/features/auth';
import { colors, radius, spacing, typography } from '@/theme';

type Phase = 'verifying' | 'form' | 'success';

export default function ResetPasswordScreen() {
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const [phase, setPhase] = useState<Phase>('verifying');
  const [linkError, setLinkError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  // Exchange the recovery credential from the incoming deep link. A session
  // that already exists (re-open, or the gate settled first) skips this.
  // State updates live inside promise callbacks, never synchronously in the
  // effect body (`react-hooks/set-state-in-effect`).
  useEffect(() => {
    let active = true;
    function settle(ok: boolean, message = '') {
      if (!active) return;
      if (ok) {
        setPhase('form');
      } else {
        setLinkError(message);
      }
    }
    function handle(url: string) {
      exchangeAuthCallback(url).then(
        (exchanged) => {
          // An ordinary deep link carries no credential — leave the form up
          // if a session already exists, otherwise report the link problem.
          if (exchanged) settle(true);
          else if (!session) {
            settle(false, 'Tautan reset tidak valid atau kedaluwarsa. Minta tautan baru dari layar Masuk.');
          } else settle(true);
        },
        () => {
          settle(false, 'Tautan reset tidak valid atau kedaluwarsa. Minta tautan baru dari layar Masuk.');
        },
      );
    }
    if (session) {
      settle(true);
    } else {
      Linking.getInitialURL()
        .then((url) => {
          if (!active) return;
          if (url) handle(url);
          else {
            settle(false, 'Buka tautan dari email reset password untuk mengatur password baru.');
          }
        })
        .catch(() => {
          settle(false, 'Buka tautan dari email reset password untuk mengatur password baru.');
        });
      const subscription = Linking.addEventListener('url', ({ url }) => handle(url));
      return () => {
        active = false;
        subscription.remove();
      };
    }
    return () => {
      active = false;
    };
    // `session` read once on mount: the exchange itself produces the session,
    // and re-running on every session change would loop the listener setup.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onSubmit() {
    const next: FieldErrors = {};
    if (!isValidPassword(password)) {
      next.password =
        password.length < PASSWORD_MIN_LENGTH
          ? 'Password minimal 8 karakter'
          : 'Password harus memuat huruf dan angka';
    }
    if (!confirmPassword) {
      next.confirmPassword = 'Konfirmasi password wajib diisi';
    } else if (password !== confirmPassword) {
      next.confirmPassword = 'Password tidak cocok';
    }
    setErrors(next);
    setFormError('');
    if (next.password !== undefined || next.confirmPassword !== undefined) return;

    setBusy(true);
    try {
      await updatePassword(password);
      setPhase('success');
    } catch {
      setFormError('Gagal mengubah password. Coba lagi sebentar lagi.');
    } finally {
      setBusy(false);
    }
  }

  if (phase === 'verifying') {
    return (
      <View style={[styles.flex, styles.centered]}>
        <LogoMark size={72} />
        <Text style={[typography.labelUppercase, styles.kicker]}>Cashtrix</Text>
        <Text style={[typography.bodyMd, styles.subtitle]}>Memeriksa tautan reset…</Text>
      </View>
    );
  }

  if (phase === 'success') {
    return (
      <View style={[styles.flex, styles.centeredWrap]}>
        <View style={styles.header}>
          <LogoMark size={72} />
          <Text style={[typography.labelUppercase, styles.kicker]}>Cashtrix</Text>
          <Text style={[typography.headlineLg, styles.title]}>Password diubah</Text>
          <Text style={[typography.bodyMd, styles.subtitle]}>
            Password baru Anda sudah tersimpan. Anda sudah masuk — lanjutkan ke aplikasi.
          </Text>
        </View>
        <Link href="/" asChild>
          <PrimaryButton label="Buka aplikasi" testID="reset-password-done" />
        </Link>
      </View>
    );
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
          <Text style={[typography.headlineLg, styles.title]}>Atur Password Baru</Text>
          <Text style={[typography.bodyMd, styles.subtitle]}>
            Masukkan password baru Anda. Password harus minimal 8 karakter dengan huruf dan angka.
          </Text>
        </View>

        <Card style={styles.card}>
          {linkError ? <Text style={styles.formError}>{linkError}</Text> : null}
          <View>
            <Text style={[typography.labelUppercase, styles.fieldLabel]}>Password Baru</Text>
            <TextField
              testID="reset-password-new"
              accessibilityLabel="Password Baru"
              placeholder="••••••••"
              icon="lock-outline"
              secureToggle
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              value={password}
              hasError={Boolean(errors.password)}
              onChangeText={setPassword}
              onSubmitEditing={onSubmit}
            />
            {errors.password ? <Text style={styles.fieldError}>{errors.password}</Text> : null}
          </View>

          <View>
            <Text style={[typography.labelUppercase, styles.fieldLabel]}>Konfirmasi Password</Text>
            <TextField
              testID="reset-password-confirm"
              accessibilityLabel="Konfirmasi Password"
              placeholder="••••••••"
              icon="lock-outline"
              secureToggle
              autoCapitalize="none"
              autoComplete="new-password"
              textContentType="newPassword"
              value={confirmPassword}
              hasError={Boolean(errors.confirmPassword)}
              onChangeText={setConfirmPassword}
              onSubmitEditing={onSubmit}
            />
            {errors.confirmPassword ? (
              <Text style={styles.fieldError}>{errors.confirmPassword}</Text>
            ) : null}
          </View>

          {formError ? <Text style={styles.formError}>{formError}</Text> : null}

          <PrimaryButton
            testID="reset-password-submit"
            label="Simpan Password Baru"
            onPress={onSubmit}
            loading={busy}
            style={styles.cta}
          />
        </Card>

        <View style={styles.footer}>
          <Text style={[typography.bodySm, styles.footerText]}>Ingat password?</Text>
          <Link href="/(auth)/login" asChild>
            <GhostButton label="Kembali ke Masuk" testID="reset-password-to-login" />
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
  centered: {
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.xs,
  },
  centeredWrap: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    paddingHorizontal: spacing.margin,
    gap: spacing.xl,
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
});
