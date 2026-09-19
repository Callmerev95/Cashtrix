/**
 * Top app bar — the Stitch header present on every tab screen: brand mark +
 * `CASHTRIX` wordmark on the left, account avatar on the right.
 *
 * The avatar is a prop (never fetched here) so this generic component stays
 * decoupled from the profile feature; tab screens pass `avatarSignedUrl` from
 * `useProfile()` and navigate to `/profile` on press.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useState } from 'react';

import { colors, layout, radius, spacing, typography } from '@/theme';

import { LogoMark } from './logo-mark';

export function AppHeader({
  avatarUri,
  testID = 'app-header',
}: {
  avatarUri?: string | null;
  testID?: string;
}) {
  // A dead signed URL (expired, revoked, corrupt upload) renders as a blank
  // box — degrade to the fallback icon instead. The "seen" URI is state
  // (never a ref, never an effect — see the lint rules); a new URI resets
  // the flag during render, before commit.
  const [broken, setBroken] = useState(false);
  const [seenUri, setSeenUri] = useState(avatarUri);
  if (seenUri !== avatarUri) {
    setSeenUri(avatarUri);
    setBroken(false);
  }

  return (
    <View testID={testID} style={styles.bar}>
      <View style={styles.brand}>
        <LogoMark size={32} />
        <Text style={[typography.headlineSm, styles.wordmark]}>CASHTRIX</Text>
      </View>
      <Pressable
        testID={`${testID}-avatar`}
        accessibilityRole="button"
        accessibilityLabel="Buka profil"
        onPress={() => router.push('/(tabs)/profile')}
        style={styles.avatarFrame}
      >
        {avatarUri && !broken ? (
          <Image
            source={{ uri: avatarUri }}
            style={styles.avatar}
            onError={() => setBroken(true)}
          />
        ) : (
          <View style={[styles.avatar, styles.avatarFallback]}>
            <MaterialIcons
              name="person"
              size={20}
              color={colors.textSecondary}
            />
          </View>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  brand: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  wordmark: {
    color: colors.textPrimary,
    letterSpacing: 2,
  },
  avatarFrame: {
    width: layout.minTapTarget,
    height: layout.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
