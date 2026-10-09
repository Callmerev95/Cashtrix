/**
 * Animated number, native twin (P1a).
 *
 * Isolated ON PURPOSE (scan-corners pattern): real reanimated hooks live
 * only here; `animated-number.tsx` lazy-loads this module and falls back
 * to static text in Jest / Expo Go / reduce-motion. Never import this file
 * statically from anywhere Jest touches.
 *
 * Text flows through state (reaction + runOnJS) rather than animatedProps:
 * the `text` native prop is not in the v4 typed surface, and a 600ms
 * small-subtree re-render is indistinguishable visually.
 *
 * CRITICAL: the reaction ships only the raw number across the bridge.
 * Evaluating `format()` (Intl + closures) on the UI thread crashes the
 * app at mount (device lesson) — formatting stays on the JS thread, in
 * render.
 */
import { useEffect, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import {
  runOnJS,
  useAnimatedReaction,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

const ROLL_MS = 600;

export function AnimatedNumberNative({
  value,
  format,
  testID,
  style,
  numberOfLines,
  adjustsFontSizeToFit,
  minimumFontScale,
}: {
  value: number;
  format: (n: number) => string;
  testID?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
  adjustsFontSizeToFit?: boolean;
  minimumFontScale?: number;
}) {
  const position = useSharedValue(0);
  const [raw, setRaw] = useState(value);

  useEffect(() => {
    position.value = withTiming(value, { duration: ROLL_MS });
  }, [value, position]);

  useAnimatedReaction(
    () => position.value,
    (current) => {
      runOnJS(setRaw)(current);
    },
    [],
  );

  return (
    <Text
      testID={testID}
      style={style}
      numberOfLines={numberOfLines}
      adjustsFontSizeToFit={adjustsFontSizeToFit}
      minimumFontScale={minimumFontScale}
    >
      {format(raw)}
    </Text>
  );
}
