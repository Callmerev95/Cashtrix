/**
 * Animated ring fill, native twin (P1a).
 *
 * Isolated ON PURPOSE (scan-corners pattern): real reanimated hooks live
 * only here; `budget-ring.tsx` lazy-loads this module and falls back to a
 * static arc in Jest / Expo Go / reduce-motion. Never import this file
 * statically from anywhere Jest touches.
 */
import { useEffect } from 'react';
import { Circle } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import { colors } from '@/theme';

/** Mount fill duration (opacity of motion, not data). */
const RING_MOUNT_MS = 700;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function AnimatedRingArc({
  dash,
  circumference,
  center,
  radius,
  thickness,
  testID,
}: {
  dash: number;
  circumference: number;
  center: number;
  radius: number;
  thickness: number;
  testID: string;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(1, { duration: RING_MOUNT_MS });
  }, [progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDasharray: `${progress.value * dash} ${circumference}`,
  }));

  return (
    <AnimatedCircle
      testID={`${testID}-fill`}
      cx={center}
      cy={center}
      r={radius}
      fill="none"
      stroke={colors.accent}
      strokeWidth={thickness}
      strokeLinecap="butt"
      transform={`rotate(-90 ${center} ${center})`}
      animatedProps={animatedProps}
    />
  );
}
