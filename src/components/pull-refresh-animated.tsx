/**
 * Custom pull-to-refresh, native twin (P1b final).
 *
 * Isolated ON PURPOSE (scan-corners pattern): gesture-handler + reanimated
 * imports live only here; `pull-refresh.tsx` lazy-loads this module.
 * Never import this file statically from anywhere Jest touches.
 *
 * Device-settled design (falsification ladder complete):
 * - Pan + Simultaneous detector (touch tracking that provably delivers on
 *   device; plain onTouch* props do not).
 * - NO worklet scroll handler (Exp-B: per-frame scroll worklet on a plain
 *   scroller correlates with the scroll crash). The top-only gate uses a
 *   PLAIN onScroll writing a shared value from the JS thread.
 * - Stable gesture identity (mid-touch swaps crash the next stream).
 * - Spinner = header row inside the scroller (zero footprint when idle).
 */
import { cloneElement, createContext, useContext, useEffect, useMemo } from 'react';
import type { ReactElement } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { colors } from '@/theme';

import type { PullGestureProps, PullHeaderProps } from './pull-refresh';

/** Twin-local shared pull state (worklet-driven; mirrors the JS shape). */
type TwinShared = {
  pull: { value: number };
  refreshing: boolean;
  trigger: number;
} | null;

const TwinPullContext = createContext<TwinShared>(null);

/** Pull distance that commits a refresh. */
const PULL_TRIGGER = 80;
/** Finger travel → header growth (resistance). */
const PULL_RESISTANCE = 0.5;
/** Open header height (spinner spinner strip). */
const HEADER_OPEN_H = 56;

export function PullGestureNative({
  refreshing,
  onRefresh,
  children,
}: PullGestureProps) {
  const pull = useSharedValue(0);
  const scrollY = useSharedValue(0);
  // Refreshing mirrored into a shared value so the gesture object keeps
  // ONE identity per mount (mid-touch swaps crash the next touch stream).
  const refreshingSV = useSharedValue(false);
  useEffect(() => {
    refreshingSV.value = refreshing;
  }, [refreshing, refreshingSV]);

  // PLAIN handler (not a worklet): writes the shared value from JS.
  // Replaces the worklet scroll handler convicted in Exp-B.
  const handleScroll = (event: {
    nativeEvent: { contentOffset: { y: number } };
  }) => {
    scrollY.value = event.nativeEvent.contentOffset.y;
  };

  const gesture = useMemo(() => {
    const pan = Gesture.Pan()
      .onUpdate((event) => {
        if (scrollY.value <= 0) {
          pull.value = Math.max(0, event.translationY * PULL_RESISTANCE);
        }
      })
      .onEnd(() => {
        if (!refreshingSV.value && pull.value >= PULL_TRIGGER) {
          runOnJS(onRefresh)();
        }
        pull.value = withTiming(0, { duration: 220 });
      });
    return Gesture.Simultaneous(pan, Gesture.Native());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onRefresh]);

  const scroller = useMemo(
    () =>
      cloneElement(
        children as ReactElement<{
          onScroll?: unknown;
          scrollEventThrottle?: unknown;
        }>,
        {
          // The twin owns the only onScroll: no screen sets its own (verified).
          onScroll: handleScroll,
          scrollEventThrottle: 16,
        },
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [children],
  );

  const shared = useMemo(
    () => ({ pull, refreshing, trigger: PULL_TRIGGER }),
    [pull, refreshing],
  );

  return (
    <TwinPullContext.Provider value={shared}>
      <GestureDetector gesture={gesture}>{scroller}</GestureDetector>
    </TwinPullContext.Provider>
  );
}

export function PullHeaderNative({ gap = 0, testID }: PullHeaderProps) {
  const shared = useContext(TwinPullContext);
  if (!shared) return null;
  return (
    <PullHeaderInner
      pull={shared.pull}
      refreshing={shared.refreshing}
      trigger={shared.trigger}
      gap={gap}
      testID={testID}
    />
  );
}

function PullHeaderInner({
  pull,
  refreshing,
  trigger,
  gap,
  testID,
}: {
  pull: { value: number };
  refreshing: boolean;
  trigger: number;
  gap: number;
  testID?: string;
}) {
  const open = useDerivedValue(() =>
    refreshing ? HEADER_OPEN_H : Math.min(pull.value, HEADER_OPEN_H + 24),
  );
  const style = useAnimatedStyle(() => ({
    height: open.value,
    marginTop: -gap,
    opacity: open.value < 1 ? 0 : Math.min(1, open.value / trigger),
  }));

  return (
    <Animated.View
      testID={testID}
      style={[styles.strip, style]}
      pointerEvents="none"
    >
      <ActivityIndicator color={colors.accent} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  strip: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
