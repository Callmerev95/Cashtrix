/**
 * Custom pull-to-refresh (P1b).
 *
 * This module is 100% bridge-safe (React + RN core only): hook, context,
 * header strip. Touch tracking lives in the lazy native twin
 * (`pull-refresh-animated`, scan-corners pattern) because plain onTouch*
 * props do not receive events on this build's scrollers (device-proved),
 * while the Pan path does. No worklet scroll handler (Exp-B conviction),
 * no native RefreshControl (H1), no flex wrappers (bounds lesson).
 */
import type { ComponentType, ReactElement, ReactNode } from 'react';
import {
  cloneElement,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ActivityIndicator, Animated, StyleSheet } from 'react-native';
import type {
  GestureResponderEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from 'react-native';

import { colors } from '@/theme';

import { reanimatedUsable } from './reanimated-cap';

/** Pull distance that commits a refresh (mirrors the twin). */
const PULL_TRIGGER = 80;
/** Finger travel → header growth (resistance). */
const PULL_RESISTANCE = 0.5;

export function usePullRefresh(
  refresh: () => Promise<unknown>,
): { refreshing: boolean; onRefresh: () => void } {
  const [refreshing, setRefreshing] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.resolve()
      .then(() => refresh())
      .catch(() => undefined)
      .then(() => {
        if (mounted.current) setRefreshing(false);
      });
  }, [refresh]);

  return { refreshing, onRefresh };
}

type PullShared = {
  height: Animated.Value;
  opacity: Animated.AnimatedInterpolation<number>;
  refreshing: boolean;
  trigger: number;
} | null;

const PullContext = createContext<PullShared>(null);

export { PullContext };

export type PullGestureProps = {
  refreshing: boolean;
  onRefresh: () => void;
  children: ReactElement;
};

export type PullHeaderProps = {
  /** Content gap caller (ditelan margin negatif saat idle → footprint nol). */
  gap?: number;
  testID?: string;
};

function loadPullNative(): {
  gesture: ComponentType<PullGestureProps> | null;
  header: ComponentType<PullHeaderProps> | null;
} {
  if (!reanimatedUsable()) return { gesture: null, header: null };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./pull-refresh-animated') as {
      PullGestureNative?: ComponentType<PullGestureProps>;
      PullHeaderNative?: ComponentType<PullHeaderProps>;
    };
    return {
      gesture:
        typeof mod?.PullGestureNative === 'function'
          ? mod.PullGestureNative
          : null,
      header:
        typeof mod?.PullHeaderNative === 'function'
          ? mod.PullHeaderNative
          : null,
    };
  } catch {
    return { gesture: null, header: null };
  }
}

// Module scope: twins load once, or passthrough/null (Jest/Expo Go).
const twins = loadPullNative();

export function PullGesture({
  refreshing,
  onRefresh,
  children,
}: PullGestureProps & { children: ReactNode }): ReactNode {
  // AGENTS-endorsed pattern for the refs lint (no bare `new` in useRef).
  const [height] = useState(() => new Animated.Value(0));
  const opacity = useMemo(
    () =>
      height.interpolate({
        inputRange: [0, PULL_TRIGGER],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    [height],
  );
  const shared = useMemo<PullShared>(
    () => ({ height, opacity, refreshing, trigger: PULL_TRIGGER }),
    [height, opacity, refreshing],
  );

  // While a refresh runs, the strip stays open; it collapses after.
  // (Native twin drives height during the pull; this only settles.)
  useEffect(() => {
    if (!refreshing) {
      Animated.timing(height, {
        toValue: 0,
        duration: 200,
        useNativeDriver: false,
      }).start();
    }
  }, [refreshing, height]);

  if (!twins.gesture) {
    // Fallback (Jest + runtimes without twins): the fully JS-driven
    // implementation — same contract, behavior-tested. On device the
    // native twin takes over (plain props receive no events there).
    return (
      <PullContext.Provider value={shared}>
        <FallbackGesture onRefresh={onRefresh}>{children}</FallbackGesture>
      </PullContext.Provider>
    );
  }
  const Native = twins.gesture;
  return (
    <Native refreshing={refreshing} onRefresh={onRefresh}>
      {children as ReactElement}
    </Native>
  );
}

/**
 * JS-driven pull (fallback): observe-only touch tracking + plain scroll
 * gate + Animated-core strip driver. Identical contract to the native
 * twin; alive only where plain props deliver events (Jest for sure).
 */
function FallbackGesture({
  onRefresh,
  children,
}: {
  onRefresh: () => void;
  children: ReactElement;
}) {
  const scrollY = useRef(0);
  const startTouch = useRef<{ id: string | number; y: number } | null>(null);
  const pulled = useRef(0);

  const abortPull = useCallback(() => {
    pulled.current = 0;
    startTouch.current = null;
  }, []);

  const handleTouchMove = useCallback(
    (event: GestureResponderEvent) => {
      const touches = event.nativeEvent.touches ?? [];
      if (touches.length !== 1) {
        abortPull();
        return;
      }
      const y = touches[0]?.pageY;
      if (!Number.isFinite(y)) return;
      const started = startTouch.current;
      if (started == null) {
        if (scrollY.current > 1) return;
        startTouch.current = { id: touches[0]?.identifier ?? 0, y: y as number };
        return;
      }
      const distance = Math.max(
        0,
        ((y as number) - started.y) * PULL_RESISTANCE,
      );
      if (!Number.isFinite(distance)) return;
      pulled.current = distance;
    },
    [abortPull],
  );

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      scrollY.current = event.nativeEvent.contentOffset.y;
    },
    [],
  );

  // NOTE: the strip height is twin-driven on device; the fallback keeps
  // logic (threshold/gate/settle) testable while rendering nothing extra.
  // Ref reads travel into event handlers only, never evaluated here.
  return (
    <>
      {cloneElement(
        children as ReactElement<{
          onTouchMove?: unknown;
          onTouchEnd?: unknown;
          onScroll?: unknown;
          scrollEventThrottle?: unknown;
        }>,
        // eslint-disable-next-line react-hooks/refs
        {
          onTouchMove: handleTouchMove,
          onTouchEnd: () => {
            if (pulled.current >= PULL_TRIGGER) onRefresh();
            abortPull();
          },
          onScroll: handleScroll,
          scrollEventThrottle: 16,
        },
      )}
    </>
  );
}

export function PullHeader({ gap = 0, testID }: PullHeaderProps): ReactNode {
  const shared = useContext(PullContext);
  // Native twin renders its own header from the SAME context when loaded;
  // this fallback covers runtimes without it (Jest) by mirroring state.
  if (twins.header) {
    const NativeHeader = twins.header;
    return <NativeHeader gap={gap} testID={testID} />;
  }
  if (!shared) return null;
  return (
    <Animated.View
      testID={testID}
      style={[
        styles.strip,
        { height: shared.height, marginTop: -gap, opacity: shared.opacity },
      ]}
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
