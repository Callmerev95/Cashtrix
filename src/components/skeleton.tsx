/**
 * Skeleton loading placeholders (Preloader + skeleton).
 *
 * Scheme: flat `#2C2C2E` blocks (surface-elevated — already in the palette,
 * no new token) shaped like the element they stand in for, one opacity pulse
 * per group. Pulse, not sweep: a travelling gradient would need a dependency
 * or an `expo-linear-gradient` inside every block — the View-only rule (T6
 * donut / T7 ring / V5 calendar) says no.
 *
 * Respects the OS reduce-motion setting
 * (`AccessibilityInfo.isReduceMotionEnabled`): when set, the pulse
 * never starts and blocks rest at `SKELETON_REST_OPACITY`.
 */

import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import {
  AccessibilityInfo,
  Animated,
  StyleSheet,
  View,
  type DimensionValue,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, layout, radius, spacing } from '@/theme';

/** DESIGN.md §8 — motion spec. */
export const SKELETON_REST_OPACITY = 0.5;
export const SKELETON_PEAK_OPACITY = 1;
const SKELETON_PULSE_MS = 700;

/** OS reduce-motion setting; shared with the cold-open fade (app/_layout). */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((value) => {
        if (active) setReduced(value);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);
  return reduced;
}

/**
 * One opacity pulse shared by every block inside — blocks pulse in unison
 * instead of shimmering out of phase, and only one loop runs per group.
 */
export function Skeleton({
  children,
  style,
  testID,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  const reduced = useReducedMotion();
  const [opacity] = useState(() => new Animated.Value(SKELETON_REST_OPACITY));

  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: SKELETON_PEAK_OPACITY,
          duration: SKELETON_PULSE_MS,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: SKELETON_REST_OPACITY,
          duration: SKELETON_PULSE_MS,
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [opacity, reduced]);

  return (
    <View testID={testID}>
      <Animated.View
        style={[{ opacity }, style]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {children}
      </Animated.View>
    </View>
  );
}

/** A single shimmer block, sized like the element it replaces. */
export function SkeletonBlock({
  width,
  height = 16,
  borderRadius = radius.sm,
  style,
  testID,
}: {
  width?: DimensionValue;
  height?: number;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor: colors.surfaceElevated,
        },
        style,
      ]}
    />
  );
}

/** A list row: icon well + two text lines + amount block (row shape, DESIGN.md §3). */
export function SkeletonRow({ testID }: { testID?: string }) {
  return (
    <View testID={testID} style={styles.row}>
      <View style={styles.well} />
      <View style={styles.rowBody}>
        <SkeletonBlock width="55%" height={14} />
        <SkeletonBlock width="35%" height={12} />
      </View>
      <SkeletonBlock width={64} height={18} />
    </View>
  );
}

/** A stacked list of skeleton rows under one pulse. */
export function SkeletonList({
  rows = 5,
  testID,
  style,
}: {
  rows?: number;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Skeleton testID={testID} style={style}>
      {Array.from({ length: rows }, (_, index) => (
        <SkeletonRow key={index} />
      ))}
    </Skeleton>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: layout.minTapTarget + spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm + spacing.xs,
  },
  well: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
});