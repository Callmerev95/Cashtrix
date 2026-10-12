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

/** Mount fill duration (opacity of motion, not data). */
const RING_MOUNT_MS = 700;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export function AnimatedRingArc({
  dash,
  circumference,
  center,
  radius,
  thickness,
  gradientId,
  rotation,
  round,
  testID,
}: {
  dash: number;
  circumference: number;
  center: number;
  radius: number;
  thickness: number;
  gradientId: string;
  rotation: number;
  round: boolean;
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
      stroke={`url(#${gradientId})`}
      strokeWidth={thickness}
      strokeLinecap={round ? 'round' : 'butt'}
      transform={`rotate(${rotation} ${center} ${center})`}
      animatedProps={animatedProps}
    />
  );
}
