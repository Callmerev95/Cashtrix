/**
 * Viewfinder corner brackets with a breathing pulse (Fintech-Pro polish).
 *
 * Split from `scan-viewfinder` ON PURPOSE: `react-native-reanimated` crashes
 * at import in Jest (native worklets, no bridge), so this module is loaded
 * lazily with try/catch and the caller falls back to plain corners. Same
 * lazy pattern as `lock/api`, `expo-audio`, `expo-camera`. Never import
 * this file statically from anywhere Jest touches.
 */
import { useEffect } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { View } from 'react-native';
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { useReducedMotion } from '@/components/skeleton';

export function ScanCorners({
  corner,
  glow,
}: {
  corner: {
    tl: StyleProp<ViewStyle>;
    tr: StyleProp<ViewStyle>;
    bl: StyleProp<ViewStyle>;
    br: StyleProp<ViewStyle>;
  };
  glow: StyleProp<ViewStyle>;
}) {
  const reduceMotion = useReducedMotion();
  const breathe = useSharedValue(1);
  useEffect(() => {
    if (reduceMotion) return;
    breathe.value = withRepeat(
      withSequence(
        withTiming(0.8, { duration: 1500 }),
        withTiming(1, { duration: 1500 }),
      ),
      -1,
      false,
    );
    return () => {
      cancelAnimation(breathe);
    };
  }, [breathe, reduceMotion]);
  const pulseStyle = useAnimatedStyle(() => ({
    opacity: breathe.value,
    transform: [{ scale: breathe.value }],
  }));
  const corners = [
    { key: 'tl', style: corner.tl },
    { key: 'tr', style: corner.tr },
    { key: 'bl', style: corner.bl },
    { key: 'br', style: corner.br },
  ];
  return (
    <>
      {corners.map(({ key, style }) => (
        <Animated.View
          key={key}
          testID="scan-corner"
          style={[style, glow, reduceMotion ? null : pulseStyle]}
          pointerEvents="none"
        />
      ))}
    </>
  );
}

/** Static twin for runtimes without the native module (Jest, Expo Go). */
export function ScanCornersFallback({
  corner,
  glow,
}: {
  corner: {
    tl: StyleProp<ViewStyle>;
    tr: StyleProp<ViewStyle>;
    bl: StyleProp<ViewStyle>;
    br: StyleProp<ViewStyle>;
  };
  glow: StyleProp<ViewStyle>;
}) {
  const corners = [
    { key: 'tl', style: corner.tl },
    { key: 'tr', style: corner.tr },
    { key: 'bl', style: corner.bl },
    { key: 'br', style: corner.br },
  ];
  return (
    <>
      {corners.map(({ key, style }) => (
        <View
          key={key}
          testID="scan-corner"
          style={[style, glow]}
          pointerEvents="none"
        />
      ))}
    </>
  );
}
