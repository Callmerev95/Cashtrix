/**
 * Tab focus pop, native twin (P1b).
 *
 * Isolated ON PURPOSE (scan-corners pattern): real reanimated imports live
 * only here; `tab-pop.tsx` lazy-loads this module. Never import this file
 * statically from anywhere Jest touches.
 */
import { useEffect } from 'react';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';

import type { TabPopProps } from './tab-pop';

export function TabPopNative({ focused, children, style }: TabPopProps) {
  const scale = useSharedValue(1);
  useEffect(() => {
    if (!focused) return;
    scale.value = withTiming(1.22, { duration: 120 }, (finished) => {
      if (finished) {
        scale.value = withSpring(1, { damping: 9, stiffness: 220 });
      }
    });
  }, [focused, scale]);

  const springStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return <Animated.View style={[style, springStyle]}>{children}</Animated.View>;
}
