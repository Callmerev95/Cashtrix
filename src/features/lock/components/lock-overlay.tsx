/**
 * Full-screen lock overlay (B4, ADR-0007) — rides above the whole stack so no
 * balance, name, or amount stays visible while locked. Only the unlock
 * button is interactive; it drives the OS biometric prompt (with device
 * passcode fallback), so the app itself never holds a secret. If the native
 * module is absent (Expo Go before the rebuild) the attempt simply fails and
 * the overlay shows a retry message — never a crash.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { PrimaryButton } from '@/components';
import { dictionaryFor, useLanguage } from '@/i18n';
import { colors, layout, spacing, typography } from '@/theme';

import { useLock } from '../lock-context';

export function LockOverlay() {
  const { unlock } = useLock();
  const language = useLanguage();
  const t = dictionaryFor(language);
  const ts = t.lock;
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  async function onUnlock() {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const ok = await unlock(ts.unlockPrompt);
    setBusy(false);
    if (!ok) setFailed(true);
  }

  return (
    <View
      testID="lock-overlay"
      style={styles.overlay}
      accessibilityViewIsModal
    >
      <View style={styles.card}>
        <MaterialIcons name="lock" size={28} color={colors.accent} />
        <Text style={[typography.headlineMd, styles.title]}>
          {ts.title}
        </Text>
        <Text style={[typography.bodyMd, styles.subtitle]}>
          {failed ? ts.failedBody : ts.body}
        </Text>
        <PrimaryButton
          testID="lock-unlock"
          label={busy ? ts.unlocking : ts.unlock}
          onPress={() => void onUnlock()}
          disabled={busy}
          loading={busy}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 100,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    minWidth: layout.minTapTarget,
  },
  title: {
    color: colors.textPrimary,
  },
  subtitle: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
});