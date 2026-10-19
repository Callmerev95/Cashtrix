/**
 * Dashboard hero card — the combined balance (PRD §2.3 Epic B2, DESIGN.md §6),
 * dressed as an obsidian card: fixed 1.58 aspect, EMV chip + NFC mark,
 * CASHTRIX watermark, eye toggle, JetBrains Mono total, cardholder name.
 *
 * The background stays alive (owner direction): a slow gold sheen sweeps the
 * card on a ping-pong loop, silenced under reduce-motion like every other
 * animation (DESIGN.md §8). The glass pass (owner direction, 19 Okt 2026):
 * SVG radial-falloff orbs under an `expo-blur` frost layer, micro-noise and
 * a top bevel. Both native pieces ride modules already compiled into the
 * binary (`react-native-svg` since PR1, `expo-blur` since the scaffold), so
 * this ships over OTA; below Android 12 the frost degrades to a tint and the
 * orbs carry the look alone. Colours stay theme tokens; the Stitch mock is a
 * layout reference only.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { BlurTargetView, BlurView } from 'expo-blur';
import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { Circle, Defs, RadialGradient, Stop, Svg } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';

import { SkeletonBlock, useReducedMotion } from '@/components/skeleton';
import {
  formatCurrency,
  MASKED_BALANCE_HERO,
  useBalanceHidden,
} from '@/features/wallets';
import { dictionaryFor, fill, useLanguage } from '@/i18n';
import { colors, gradients, radius, spacing, typography } from '@/theme';
import { pressedFeedback } from '@/components/pressed';

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

  // Android frost samples an explicit target (expo-blur ≥ 57 API); iOS
  // ignores it and blurs the backdrop sitting behind the BlurView.
  const blurTargetRef = useRef<View>(null);

  // Device display preference (never purged on sign-out), shared with every
  // wallet row through the module store.
  const { hidden, toggle: toggleHidden } = useBalanceHidden();

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
      <LinearGradient
        colors={[...gradients.obsidian]}
        locations={[0, 0.35, 0.7, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.inner}
      >
        {/* Glass ambience: the orbs are SVG radial falloffs on a 158×100
            viewBox (the card's 1.58 aspect in user units), so they scale
            with the card and need no measurement. The falloff is the blur;
            the frost layer above just softens everything once more. */}
        <BlurTargetView ref={blurTargetRef} style={styles.fill}>
          <Svg
            style={styles.fill}
            viewBox="0 0 158 100"
            testID="balance-orbs"
          >
            <Defs>
              <RadialGradient id="orbGold">
                <Stop offset="0" stopColor={colors.accentAmbienceCore} />
                <Stop offset="0.55" stopColor={colors.accentAmbienceMid} />
                <Stop
                  offset="1"
                  stopColor={colors.accentAmbienceMid}
                  stopOpacity={0}
                />
              </RadialGradient>
              <RadialGradient id="orbLow">
                <Stop offset="0" stopColor={colors.accentAmbienceLow} />
                <Stop
                  offset="1"
                  stopColor={colors.accentAmbienceLow}
                  stopOpacity={0}
                />
              </RadialGradient>
              <RadialGradient id="orbSpec">
                <Stop offset="0" stopColor={colors.accentAmbienceSpec} />
                <Stop
                  offset="1"
                  stopColor={colors.accentAmbienceSpec}
                  stopOpacity={0}
                />
              </RadialGradient>
            </Defs>
            <Circle cx="148" cy="-4" r="64" fill="url(#orbGold)" />
            <Circle cx="8" cy="104" r="66" fill="url(#orbLow)" />
            <Circle cx="132" cy="12" r="11" fill="url(#orbSpec)" />
          </Svg>
          <Image
            testID="balance-noise"
            source={require('../../../../assets/noise.png')}
            resizeMode="repeat"
            style={styles.noise}
          />
        </BlurTargetView>
        <BlurView
          testID="balance-frost"
          blurTarget={blurTargetRef}
          blurMethod="dimezisBlurViewSdk31Plus"
          tint="dark"
          intensity={Platform.OS === 'ios' ? 26 : 20}
          pointerEvents="none"
          style={styles.fill}
        />
        <LinearGradient
          colors={[colors.bevelGlow, 'transparent']}
          start={{ x: 0.5, y: 0 }}
          end={{ x: 0.5, y: 1 }}
          style={styles.bevelGlow}
          pointerEvents="none"
        />
        <LinearGradient
          colors={['transparent', colors.bevelHighlight, 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.bevelLine}
          pointerEvents="none"
        />
        <View style={styles.sheenClip} pointerEvents="none">
          <Animated.View
            style={[styles.sheenBar, { transform: [{ translateX: sheenX }] }]}
          >
            <View style={styles.sheenTilt}>
              <LinearGradient
                colors={['transparent', colors.accentAmbience, 'transparent']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.sheenFill}
              />
            </View>
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
                <View style={styles.chipH1} />
                <View style={styles.chipH2} />
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
            {hidden ? MASKED_BALANCE_HERO : formatCurrency(total, 'Rp', language)}
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
      </LinearGradient>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderRadius: radius.xxl,
    padding: StyleSheet.hairlineWidth,
    // Floating gold edge (card-reference.png): soft outer glow, brighter
    // up top via the offset. iOS renders the gold tint; Android ignores
    // shadowColor (grey elevation only), where the gold frame + contrast
    // carry the effect instead.
    shadowColor: colors.accent,
    shadowOpacity: 0.28,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
  },
  aspect: {
    aspectRatio: 1.58,
  },
  inner: {
    flex: 1,
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.xxl - 1,
    overflow: 'hidden',
  },
  fill: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  noise: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.035,
  },
  bevelGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 36,
  },
  bevelLine: {
    position: 'absolute',
    top: 2,
    left: 16,
    right: 16,
    height: StyleSheet.hairlineWidth,
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
  // Static tilt lives on its own wrapper (owner direction: diagonal sweep).
  // translateX above stays in screen space so the bar sweeps horizontally;
  // merging rotate + translate in one transform array would send it off on
  // a diagonal path instead. The wrapper overhangs top/bottom so the tilt
  // never exposes uncovered corners.
  sheenTilt: {
    position: 'absolute',
    top: '-100%',
    bottom: '-100%',
    left: 0,
    right: 0,
    transform: [{ rotate: '15deg' }],
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
  chipH1: {
    position: 'absolute',
    top: '36%',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.accent,
    opacity: 0.5,
  },
  chipH2: {
    position: 'absolute',
    top: '64%',
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
    left: '28%',
    width: 1,
    backgroundColor: colors.accent,
    opacity: 0.5,
  },
  chipVRight: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: '28%',
    width: 1,
    backgroundColor: colors.accent,
    opacity: 0.5,
  },
  chipPad: {
    width: 12,
    height: 9,
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
