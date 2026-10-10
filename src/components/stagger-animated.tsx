/**
 * Entrance stagger, native twin (P1b).
 *
 * Isolated ON PURPOSE (scan-corners pattern): real reanimated imports live
 * only here; `stagger.tsx` lazy-loads this module. Never import this file
 * statically from anywhere Jest touches.
 */
import Animated, { FadeInDown } from 'react-native-reanimated';

import type { StaggerProps } from './stagger';

/** Per-row step: the sequence reads as one motion, not popcorn. */
const STAGGER_STEP_MS = 40;

export function StaggerNative({ index, children, style, testID }: StaggerProps) {
  return (
    <Animated.View
      testID={testID}
      style={style}
      entering={FadeInDown.duration(280).delay(index * STAGGER_STEP_MS)}
    >
      {children}
    </Animated.View>
  );
}
