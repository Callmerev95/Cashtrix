/**
 * Dashboard hero card — the combined balance (PRD §2.3 Epic B2, DESIGN.md §6),
 * dressed as an obsidian card: 1.58 aspect, outline chip, CASHTRIX wordmark,
 * eye toggle, JetBrains Mono total, bottom row with the cardholder name (left)
 * and the wallet count (right).
 *
 * Proportional scale (bug fix, 19 Okt 2026): the mock is drawn at a 350pt-wide
 * card and its content fits the box only at that width — at 1.58 the box
 * shrinks faster than fixed-size type, so the bottom row clipped on a 360dp
 * phone. Every mock-measured dimension, type included, is multiplied by
 * `cardScaleFor(screenWidth, margin)`, so the box and its content always agree
 * at any width (the scale caps at 1.3 for tablets).
 *
 * Mock-exact pass (owner reference `polish-card.png`, 19 Okt 2026): the
 * field is three fitted SVG radial layers on a 158×100 viewBox (the card's
 * 1.58 aspect in user units, so they scale with the card and need no
 * measurement) — a dark centre core under two corner orbs, cool top-left and
 * gold bottom-right — and micro-noise that kills gradient banding on OLED.
 * Every gradient stop is hex + `stopOpacity` (an `rgba()` string as
 * `stopColor` was this card's only such use and is not trusted on Android).
 * The frame is a muted `heroBorder` hairline with no glow, and the type
 * scale, chip and divider follow the mock's measurements (the kicker/amount/
 * REV gaps were re-aligned to the scanned mock positions: ink at 79pt, Rp at
 * 123pt, divider at ~183pt on the 350pt reference). The frost, bevel
 * and vignette layers of the earlier glass pass were dropped to match the
 * mock (owner decision, same date). The sheen stays: a slow gold bar sweeping
 * edge to edge on a ping-pong loop, silenced under reduce-motion like every
 * other animation (DESIGN.md §8). Colours stay theme tokens.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect, useMemo, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
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
  cardScaleFor,
  formatCurrency,
  MASKED_BALANCE_HERO,
  useBalanceHidden,
} from '@/features/wallets';
import { dictionaryFor, fill, useLanguage } from '@/i18n';
import { colors, layout, radius, spacing, typography } from '@/theme';
import { pressedFeedback } from '@/components/pressed';

/** Mock-measured card corner radius (44px at the mock's scale). */
const CARD_RADIUS = 28;
/** Mock-measured eye icon size; slop grows it to layout.minTapTarget at any scale. */
const EYE_SIZE = 22;
/** Mock eye padding — also the slop floor, so the tap target never shrinks. */
const EYE_SLOP_FLOOR = 11;

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

  // One design object: the card and its type scale together (bug fix above).
  const s = cardScaleFor(screenWidth, layout.screenMargin);
  const styles = useMemo(() => buildCardStyles(s), [s]);
  const eyeSlop = Math.max(
    EYE_SLOP_FLOOR,
    Math.ceil((layout.minTapTarget - EYE_SIZE * s) / 2),
  );

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
    <View testID="total-balance-card" style={[styles.frame, styles.aspect]}>
      <View style={styles.inner}>
        {/* Field layers, fitted against the mock: the dark centre core holds
            the middle down (painted first), then the corner orbs — cool
            top-left, gold bottom-right — fade to nothing so the centre stays
            dark. The falloff is the glow — no blur layer needed. */}
        <Svg style={styles.fill} viewBox="0 0 158 100" testID="balance-orbs">
          <Defs>
            <RadialGradient id="fieldCore">
              <Stop offset="0" stopColor={colors.heroCore} stopOpacity={0.55} />
              <Stop
                offset="0.6"
                stopColor={colors.heroCore}
                stopOpacity={0.22}
              />
              <Stop offset="1" stopColor={colors.heroCore} stopOpacity={0} />
            </RadialGradient>
            <RadialGradient id="orbCool">
              <Stop
                offset="0"
                stopColor={colors.heroOrbCool}
                stopOpacity={0.1}
              />
              <Stop
                offset="0.6"
                stopColor={colors.heroOrbCool}
                stopOpacity={0.045}
              />
              <Stop
                offset="1"
                stopColor={colors.heroOrbCool}
                stopOpacity={0}
              />
            </RadialGradient>
            <RadialGradient id="orbGold">
              <Stop offset="0" stopColor={colors.accent} stopOpacity={0.1} />
              <Stop offset="0.6" stopColor={colors.accent} stopOpacity={0.04} />
              <Stop offset="1" stopColor={colors.accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx="66.4" cy="50" r="79" fill="url(#fieldCore)" />
          <Circle cx="4" cy="4" r="95" fill="url(#orbCool)" />
          <Circle cx="154" cy="96" r="126" fill="url(#orbGold)" />
        </Svg>
        <Image
          testID="balance-noise"
          source={require('../../../../assets/noise.png')}
          resizeMode="repeat"
          style={styles.noise}
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

        <View style={styles.topRow}>
          {/* Outline chip (mock): two horizontal traces, no fill, no NFC. */}
          <View style={styles.chip}>
            <View style={styles.chipH1} />
            <View style={styles.chipH2} />
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
            hitSlop={eyeSlop}
            onPress={toggleHidden}
            style={({ pressed }) => [
              styles.eye,
              pressed && pressedFeedback,
            ]}
          >
            <MaterialIcons
              name={hidden ? 'visibility-off' : 'visibility'}
              size={EYE_SIZE * s}
              color={colors.accentSoft}
            />
          </Pressable>
        </View>
        {loading ? (
          <SkeletonBlock
            testID="total-balance-skeleton"
            width={180 * s}
            height={38 * s}
            borderRadius={radius.sm * s}
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
        <View style={styles.holderRow}>
          <Text
            style={[typography.bodySm, styles.holder]}
            numberOfLines={1}
          >
            {holderName.toUpperCase()}
          </Text>
          <Text
            style={[typography.bodySm, styles.count]}
            numberOfLines={1}
          >
            {fill(t.wallets.card.count, { count: walletCount })}
          </Text>
        </View>
      </View>
    </View>
  );
}

/**
 * Every mock-measured value × the proportional scale `s` — type included
 * (owner decision, 19 Okt 2026: the card reads as one designed object). The
 * absolute decorative layers (sheen, noise, SVG orbs) stay unscaled: they are
 * not part of the mock's vertical rhythm.
 */
function buildCardStyles(s: number) {
  return StyleSheet.create({
    frame: {
      borderRadius: CARD_RADIUS * s,
      // Muted uniform gold hairline, no glow (mock): the card floats on the
      // canvas with nothing under it.
      borderWidth: s,
      borderColor: colors.heroBorder,
    },
    aspect: {
      aspectRatio: 1.58,
    },
    inner: {
      flex: 1,
      backgroundColor: colors.heroBase,
      borderRadius: (CARD_RADIUS - 1) * s,
      overflow: 'hidden',
      // Mock rhythm: generous top, tight bottom (the holder row sits close to
      // the edge). Card-local margins below follow the same source.
      paddingTop: layout.heroPadding * s,
      paddingHorizontal: layout.heroPadding * s,
      paddingBottom: spacing.sm * s,
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
    topRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    chip: {
      width: 48 * s,
      height: 35 * s,
      borderRadius: 6 * s,
      borderWidth: 2.5 * s,
      borderColor: colors.heroGold,
    },
    chipH1: {
      position: 'absolute',
      top: '30.6%',
      left: 0,
      right: 0,
      height: 1.5 * s,
      backgroundColor: colors.heroGold,
    },
    chipH2: {
      position: 'absolute',
      top: '69.4%',
      left: 0,
      right: 0,
      height: 1.5 * s,
      backgroundColor: colors.heroGold,
    },
    watermark: {
      color: colors.heroGold,
      fontSize: 14 * s,
      lineHeight: 18 * s,
      letterSpacing: 1.68 * s, // 0.12em
    },
    kickerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      // Mock-measured: the kicker ink sits 79pt from the top on the 350pt
      // reference card (was 14 — 10 after the scanned realignment).
      marginTop: 10 * s,
    },
    kicker: {
      color: colors.textSecondary,
      fontSize: 14 * s,
      lineHeight: 18 * s,
      letterSpacing: 1.68 * s, // 0.12em
    },
    eye: {
      padding: spacing.xs * s,
    },
    amount: {
      // Mock-measured: "Rp" ink at 123pt on the reference card (was 20).
      marginTop: spacing.md * s,
      color: colors.textBright,
      fontSize: 30 * s,
      lineHeight: 38 * s,
      letterSpacing: -0.9 * s, // -0.03em
    },
    skeletonAmount: {
      marginTop: spacing.md * s,
    },
    holderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderStrong,
      // Mock-measured: the divider sits ~183pt from the top and the "REV" ink
      // ~197pt on the reference card (padding was 12).
      paddingTop: spacing.sm * s,
      marginTop: 30 * s,
    },
    holder: {
      flexShrink: 1,
      color: colors.textSecondary,
      fontSize: 14 * s,
      lineHeight: 20 * s,
      letterSpacing: 2 * s,
    },
    count: {
      marginLeft: spacing.sm * s,
      color: colors.textSecondary,
      fontSize: 14 * s,
      lineHeight: 20 * s,
    },
  });
}
