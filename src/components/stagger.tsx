/**
 * Entrance stagger (P1b) — PARKED.
 *
 * Device lesson: `entering` on mounting rows crashes intermittently during
 * fast scroll (virtualized history worst). This module renders a plain View
 * until a stable entrance technique lands. Structure and testIDs unchanged;
 * the native twin (`stagger-animated.tsx`) is kept for that attempt.
 */
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

export type StaggerProps = {
  /** Zero-based position: delay = index × step (honored when re-enabled). */
  index: number;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

export function Stagger({ children, style, testID }: StaggerProps) {
  return (
    <View testID={testID} style={style}>
      {children}
    </View>
  );
}
