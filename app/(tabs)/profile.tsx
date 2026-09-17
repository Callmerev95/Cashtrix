/**
 * Profile tab — T8 owns the full screen (name, avatar, categories, currency).
 *
 * T3 adds the sign-out action it is responsible for (PRD §2.3 Epic A): drop the
 * session and all local data, then let the routing gate send the user to Login.
 * The rest stays a scaffold until T8 lands.
 */
import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';

import { GhostButton, ScaffoldScreen } from '@/components';
import { signOut, useAuth } from '@/features/auth';
import { colors, spacing, typography } from '@/theme';

export default function ProfileScreen() {
  const { session } = useAuth();
  const [busy, setBusy] = useState(false);

  async function confirmSignOut() {
    setBusy(true);
    try {
      await signOut();
      // AuthGate swaps to Login; nothing to navigate here.
    } catch {
      setBusy(false);
      Alert.alert('Gagal keluar', 'Coba lagi sebentar lagi.');
    }
  }

  function onSignOutPress() {
    Alert.alert('Keluar dari Cashtrix?', 'Sesi dan data lokal di perangkat ini akan dihapus.', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Keluar', style: 'destructive', onPress: confirmSignOut },
    ]);
  }

  return (
    <View style={styles.container}>
      <ScaffoldScreen kicker="Account" title="Profile" />
      <View style={styles.session}>
        <Text style={[typography.bodySm, styles.email]} numberOfLines={1}>
          {session?.user.email ?? ''}
        </Text>
        <GhostButton
          testID="sign-out"
          label={busy ? 'Keluar…' : 'Keluar'}
          onPress={onSignOutPress}
          disabled={busy}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  session: {
    alignItems: 'flex-start',
    gap: spacing.xs,
    paddingHorizontal: spacing.margin,
    paddingBottom: spacing.lg,
  },
  email: {
    color: colors.textSecondary,
  },
});
