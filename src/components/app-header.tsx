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
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import { useState } from 'react';

import { colors, gradients, layout, radius, spacing, typography } from '@/theme';

import { LogoMark } from './logo-mark';

export type AppHeaderBell = {
  unread: boolean;
  accessibilityLabel: string;
  onPress: () => void;
};

export function AppHeader({
  avatarUri,
  bell = null,
  testID = 'app-header',
}: {
  avatarUri?: string | null;
  bell?: AppHeaderBell | null;
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
      <View style={styles.actions}>
        {bell ? (
          <Pressable
            testID={`${testID}-bell`}
            accessibilityRole="button"
            accessibilityLabel={bell.accessibilityLabel}
            onPress={bell.onPress}
            style={styles.bellFrame}
          >
            <MaterialIcons
              name={bell.unread ? 'notifications-active' : 'notifications-none'}
              size={22}
              color={bell.unread ? colors.accent : colors.textSecondary}
            />
            {bell.unread ? <View style={styles.bellDot} /> : null}
          </Pressable>
        ) : null}
        <Pressable
          testID={`${testID}-avatar`}
          accessibilityRole="button"
          accessibilityLabel="Buka profil"
          onPress={() => router.push('/(tabs)/profile')}
          style={styles.avatarFrame}
        >
          <LinearGradient
            colors={[...gradients.cardBorder]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.ring}
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
          </LinearGradient>
        </Pressable>
      </View>
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
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  bellFrame: {
    width: layout.minTapTarget,
    height: layout.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bellDot: {
    position: 'absolute',
    top: 10,
    right: 11,
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
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
  ring: {
    width: layout.minTapTarget,
    height: layout.minTapTarget,
    borderRadius: radius.full,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatar: {
    width: 40,
    height: 40,
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
