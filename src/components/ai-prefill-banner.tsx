import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, radius, spacing } from '@/theme';

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
  children,
}: {
  testID?: string;
  /** Stagger offset in ms — pass `index * AI_BANNER_STAGGER_MS` for rows. */
  delay?: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
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
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
