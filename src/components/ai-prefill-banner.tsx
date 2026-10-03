import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';
import { dictionaryFor, useLanguage } from '@/i18n';

import { useReducedMotion } from './skeleton';

/**
 * AI prefill banner — the single indicator shown when an AI prefill lands
 * (voice prefill, voice split rows, scan result). One shared visual language
 * so the two sensors never drift apart.
 *
 * Minimalist by rule: `surface-card` fill + one hairline `border`, no icon.
 * Gold (`#D4AF37`) lives ONLY on the caller's text string — never on this
 * background (DESIGN.md §1/§7: gold is a scalpel, never a broad flat fill).
 *
 * Entrance is View-only (OTA-safe, no native module): opacity 0 → 1 plus
 * `translateY` 20 → 0, with an optional `delay` so consecutive rows stagger.
 * Dead under reduce-motion like every other animation.
 */
export const AI_BANNER_STAGGER_MS = 60;

export function AiPrefillBanner({
  testID = 'ai-prefill-banner',
  delay = 0,
  style,
  header,
  children,
}: {
  testID?: string;
  /** Stagger offset in ms — pass `index * AI_BANNER_STAGGER_MS` for rows. */
  delay?: number;
  style?: StyleProp<ViewStyle>;
  /**
   * Override the header line. Defaults to the `✨ {aiAutoTitle}` +
   * `Terverifikasi` pill (Stitch landing copy, via the dictionary).
   * Pass `null` to render a bare banner (split rows already carry it).
   */
  header?: ReactNode | null;
  children: ReactNode;
}) {
  const language = useLanguage();
  const common = dictionaryFor(language).common;
  const reduceMotion = useReducedMotion();
  const [opacity] = useState(
    () => new Animated.Value(reduceMotion ? 1 : 0),
  );
  const [translateY] = useState(
    () => new Animated.Value(reduceMotion ? 0 : 20),
  );
  useEffect(() => {
    if (reduceMotion) return;
    const entrance = Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 300,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 350,
        delay,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);
    entrance.start();
    return () => entrance.stop();
  }, [delay, opacity, reduceMotion, translateY]);

  return (
    <Animated.View
      testID={testID}
      style={[styles.banner, { opacity, transform: [{ translateY }] }, style]}
    >
      {header === null ? null : (
        <View testID={`${testID}-header`} style={styles.header}>
          <Text style={[typography.bodySm, styles.title]}>
            ✨ {header ?? common.aiAutoTitle}
          </Text>
          <View style={styles.verified}>
            <View style={styles.verifiedDot} />
            <Text style={[typography.bodySm, styles.verifiedLabel]}>
              {common.verified}
            </Text>
          </View>
        </View>
      )}
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    gap: spacing.xs,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    color: colors.accent,
  },
  verified: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs / 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
  },
  verifiedDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: colors.gain,
  },
  verifiedLabel: {
    color: colors.textSecondary,
  },
});
