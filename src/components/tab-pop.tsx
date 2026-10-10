/**
 * Tab focus pop (P1b): the active tab icon springs on focus change.
 *
 * The native twin lives in `tab-pop-animated` (scan-corners pattern):
 * reanimated crashes at import without the bridge, so this module
 * lazy-loads it and renders a plain View in Jest / Expo Go /
 * reduce-motion — layout-identical, motionless.
 */
import type { ComponentType, ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { useReducedMotion } from '@/components/skeleton';

import { reanimatedUsable } from './reanimated-cap';

export type TabPopProps = {
  focused: boolean;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
};

function loadTabPopNative(): ComponentType<TabPopProps> | null {
  if (!reanimatedUsable()) return null;
  
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./tab-pop-animated') as {
      TabPopNative?: ComponentType<TabPopProps>;
    };
    return typeof mod?.TabPopNative === 'function' ? mod.TabPopNative : null;
  } catch {
    return null;
  }
}

// Module scope: the native twin either loads once or the session renders
// static tabs (Jest, Expo Go).
const TabPopNative = loadTabPopNative();

export function TabPop({ focused, children, style }: TabPopProps) {
  const reduceMotion = useReducedMotion();
  if (!TabPopNative || reduceMotion) {
    return <View style={style}>{children}</View>;
  }
  return (
    <TabPopNative focused={focused} style={style}>
      {children}
    </TabPopNative>
  );
}
