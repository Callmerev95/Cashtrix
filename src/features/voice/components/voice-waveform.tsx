import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';

import { useReducedMotion } from '@/components/skeleton';

/**
 * Waveform indicator (B1, ADR-0016 item d; Stitch adoption) — an 18-bar
 * gold row shown while the AI prefill is in flight.
 *
 * Stagger, not a live meter: each bar breathes scaleY 0.45 ↔ 1 with a
 * per-index delay, purely marking "AI is working" next to the status copy.
 * There is no audio level stream on this path (dictation comes from the OS
 * keyboard mic), so a level-driven visual would be a honesty violation
 * (same rule as the fixed 0.42 scan confidence). Dead under reduce-motion:
 * bars render static at rest. Decorative: hidden from accessibility
 * services.
 */
const BAR_HEIGHTS = [
  8, 14, 22, 12, 26, 18, 30, 20, 10, 24, 16, 28, 14, 22, 10, 18, 26, 12,
];

/** Per-bar stagger offset in ms. */
export const WAVEFORM_STAGGER_MS = 90;
const WAVEFORM_HALF_MS = 350;

function WaveBar({
  height,
  index,
  animate,
}: {
  height: number;
  index: number;
  animate: boolean;
}) {
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    if (!animate) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: WAVEFORM_HALF_MS,
          delay: index * WAVEFORM_STAGGER_MS,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: WAVEFORM_HALF_MS,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [animate, index, pulse]);
  const scaleY = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.45, 1],
  });
  return (
    <Animated.View
      style={[styles.bar, { height }, animate && { transform: [{ scaleY }] }]}
    />
  );
}

export function VoiceWaveform() {
  const reduceMotion = useReducedMotion();
  const animate = !reduceMotion;
  return (
    <View
      testID="voice-waveform"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.row}
    >
      {BAR_HEIGHTS.map((height, index) => (
        <WaveBar key={index} height={height} index={index} animate={animate} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    opacity: 0.85,
  },
  bar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
});
