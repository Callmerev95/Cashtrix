/**
 * Animated number (P1a): counts from the previous value to the next instead
 * of swapping text. Mount counts up from zero; later updates glide from the
 * current position.
 *
 * The native twin lives in `animated-number-native` (scan-corners pattern):
 * real reanimated hooks crash at import without the native bridge, so this
 * module lazy-loads it and renders pixel-identical static text in Jest /
 * Expo Go / reduce-motion (DESIGN.md §8) — same testIDs, same strings.
 */
import type { ComponentType } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';

import { useReducedMotion } from '@/components';

import { reanimatedUsable } from '../../../components/reanimated-cap';

export type AnimatedNumberProps = {
  value: number;
  format: (n: number) => string;
  testID?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
};

function loadAnimatedNumberNative(): ComponentType<AnimatedNumberProps> | null {
  if (!reanimatedUsable()) return null;
  
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./animated-number-native') as {
      AnimatedNumberNative?: ComponentType<AnimatedNumberProps>;
    };
    return typeof mod?.AnimatedNumberNative === 'function'
      ? mod.AnimatedNumberNative
      : null;
  } catch {
    return null;
  }
}

// Module scope (not render): the native twin either loads once or the
// session degrades to static text (Jest, Expo Go).
const AnimatedNumberNative = loadAnimatedNumberNative();

export function AnimatedNumber({
  value,
  format,
  testID,
  style,
  numberOfLines,
  adjustsFontSizeToFit,
  minimumFontScale,
}: AnimatedNumberProps) {
  const reduceMotion = useReducedMotion();
  const safe = Number.isFinite(value) ? value : 0;
  if (!AnimatedNumberNative || reduceMotion) {
    return (
      <Text
        testID={testID}
        style={style}
        numberOfLines={numberOfLines}
        adjustsFontSizeToFit={adjustsFontSizeToFit}
        minimumFontScale={minimumFontScale}
      >
        {format(safe)}
      </Text>
    );
  }
  return (
    <AnimatedNumberNative
      value={safe}
      format={format}
      testID={testID}
      style={style}
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit={adjustsFontSizeToFit}
      minimumFontScale={minimumFontScale}
    />
  );
}
