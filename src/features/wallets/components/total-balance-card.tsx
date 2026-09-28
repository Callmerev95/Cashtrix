/**
 * Dashboard hero card — the combined balance (PRD §2.3 Epic B2, DESIGN.md §6),
 * dressed as an obsidian card: fixed 1.58 aspect, EMV chip + NFC mark,
 * CASHTRIX watermark, eye toggle, JetBrains Mono total, cardholder name.
 *
 * The background stays alive (owner direction): a slow gold sheen sweeps the
 * card on a ping-pong loop, silenced under reduce-motion like every other
 * animation (DESIGN.md §8). Everything is plain `View`s + one
 * `LinearGradient` — no native module, no dev-client rebuild. Colours stay
 * theme tokens; the Stitch mock is a layout reference only.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { SkeletonBlock, useReducedMotion } from '@/components/skeleton';
import { formatCurrency } from '@/features/wallets';
import { dictionaryFor, fill, useLanguage } from '@/i18n';
import { colors, gradients, radius, spacing, typography } from '@/theme';
import { pressedFeedback } from '@/components/pressed';

import { readBalanceHidden, writeBalanceHidden } from '../visibility';

export function TotalBalanceCard({
  total,
  walletCount,
  holderName,
  loading,
}: {
  total: number;
  walletCount: number;
  /** Cardholder line — the profile display name (never blank upstream). */
  holderName: string;
  loading?: boolean;
}) {
  // C6: copy + amount format follow the OS language (ADR-0008, R10).
  const language = useLanguage();
  const t = dictionaryFor(language);
  const reduceMotion = useReducedMotion();
  const { width: screenWidth } = useWindowDimensions();

  // Device display preference (never purged on sign-out): read once on
  // mount, toggle persisted best-effort. Promise callback, never
  // synchronous setState (`react-hooks/set-state-in-effect`).
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    let cancelled = false;
    readBalanceHidden().then((value) => {
      if (!cancelled) setHidden(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function toggleHidden() {
    const next = !hidden;
    setHidden(next);
    void writeBalanceHidden(next);
  }

  // Ambient sheen: a soft gold bar sweeping edge to edge and back (ping-pong
  // has no loop-seam jump). Dead under reduce-motion. State-initialised like
  // the root cold-open fade (never a render-read ref).
  const [sheen] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (reduceMotion) return;
    const sweep = Animated.sequence([
      Animated.timing(sheen, {
        toValue: 1,
        duration: 7000,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(sheen, {
        toValue: 0,
        duration: 7000,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    const loop = Animated.loop(sweep);
    loop.start();
    return () => loop.stop();
  }, [sheen, reduceMotion]);
  const sheenX = sheen.interpolate({
    inputRange: [0, 1],
    outputRange: [-screenWidth, screenWidth],
  });

  return (
    <LinearGradient
      testID="total-balance-card"
      colors={[...gradients.cardBorder]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.frame, styles.aspect]}
    >
      <View style={styles.inner}>
        <View style={styles.ambience} pointerEvents="none" />
        <View style={styles.ambienceLow} pointerEvents="none" />
        <View style={styles.sheenClip} pointerEvents="none">
          <Animated.View
            style={[styles.sheenBar, { transform: [{ translateX: sheenX }] }]}
          >
            <LinearGradient
              colors={['transparent', colors.accentAmbience, 'transparent']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.sheenFill}
            />
          </Animated.View>
        </View>
        <LinearGradient
          colors={['transparent', colors.accent, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.rim}
          pointerEvents="none"
        />

        <View style={styles.topRow}>
          <View style={styles.chipRow}>
            <LinearGradient
              colors={[...gradients.primary]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.chipOuter}
            >
              <View style={styles.chipInner}>
                <View style={styles.chipH} />
                <View style={styles.chipVLeft} />
                <View style={styles.chipVRight} />
                <View style={styles.chipPad} />
              </View>
            </LinearGradient>
            <MaterialIcons
              name="nfc"
              size={18}
              color={colors.textSecondary}
            />
          </View>
          <Text style={[typography.labelUppercase, styles.watermark]}>
            Cashtrix
          </Text>
        </View>

        <View style={styles.kickerRow}>
          <Text style={[typography.labelUppercase, styles.kicker]}>
            {t.wallets.card.total}
          </Text>
          <Pressable
            testID="balance-visibility"
            accessibilityRole="button"
            accessibilityLabel={
              hidden
                ? t.wallets.card.showBalance
                : t.wallets.card.hideBalance
            }
            onPress={toggleHidden}
            style={({ pressed }) => [
              styles.eye,
              pressed && pressedFeedback,
            ]}
          >
            <MaterialIcons
              name={hidden ? 'visibility-off' : 'visibility'}
              size={16}
              color={colors.textSecondary}
            />
          </Pressable>
        </View>
        {loading ? (
          <SkeletonBlock
            testID="total-balance-skeleton"
            width={180}
            height={40}
            borderRadius={radius.sm}
            style={styles.skeletonAmount}
          />
        ) : (
          <Text
            testID="total-balance"
            style={[typography.currencyDisplay, styles.amount]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {hidden ? 'Rp ••••••' : formatCurrency(total, 'Rp', language)}
          </Text>
        )}
        <Text style={[typography.bodySm, styles.meta]}>
          {fill(t.wallets.card.count, { count: walletCount })}
        </Text>

        <View style={styles.holderRow}>
          <Text
            style={[typography.bodySm, styles.holder]}
            numberOfLines={1}
          >
            {holderName.toUpperCase()}
          </Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.xxl,
    padding: StyleSheet.hairlineWidth,
    shadowColor: colors.accent,
    shadowOpacity: 0.08,
    shadowRadius: 32,
    shadowOffset: { width: 0, height: 8 },
  },
  aspect: {
    aspectRatio: 1.58,
  },
  inner: {
    flex: 1,
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.xxl - 1,
    backgroundColor: colors.surfaceCard,
    overflow: 'hidden',
  },
  ambience: {
    position: 'absolute',
    top: -72,
    right: -48,
    width: 168,
    height: 168,
    borderRadius: radius.full,
    backgroundColor: colors.accentAmbience,
  },
  ambienceLow: {
    position: 'absolute',
    bottom: -84,
    left: -56,
    width: 180,
    height: 180,
    borderRadius: radius.full,
    backgroundColor: colors.accentAmbience,
  },
  sheenClip: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  sheenBar: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 160,
  },
  sheenFill: {
    flex: 1,
  },
  rim: {
    position: 'absolute',
    top: 0,
    left: 24,
    right: 24,
    height: StyleSheet.hairlineWidth,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  chipOuter: {
    width: 40,
    height: 30,
    borderRadius: 5,
    padding: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipInner: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  chipH: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.accent,
    opacity: 0.5,
  },
  chipVLeft: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '33%',
    width: 1,
    backgroundColor: colors.accent,
    opacity: 0.5,
  },
  chipVRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: '33%',
    width: 1,
    backgroundColor: colors.accent,
    opacity: 0.5,
  },
  chipPad: {
    width: 10,
    height: 8,
    borderRadius: 2,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  watermark: {
    color: colors.accent,
  },
  kickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kicker: {
    color: colors.textSecondary,
  },
  eye: {
    padding: spacing.xs,
  },
  amount: {
    marginTop: spacing.xs,
    color: colors.textPrimary,
  },
  skeletonAmount: {
    marginTop: spacing.xs,
  },
  meta: {
    marginTop: spacing.xs,
    color: colors.textSecondary,
  },
  holderRow: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  holder: {
    color: colors.textPrimary,
    letterSpacing: 2,
  },
});
