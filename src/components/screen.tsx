/**
 * Screen wrapper — applies the canonical screen frame:
 *  - canvas background colour
 *  - 20px horizontal margin (DESIGN.md §3)
 *  - ≥96px bottom clearance + safe-area inset so the floating nav never
 *    occludes content (DESIGN.md §3 / PRD §2.2)
 *
 * Screens compose their own scrollable content inside this frame; the frame
 * reserves the clearance, so lists never need to remember it.
 */
import { StyleSheet, View, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, layout } from '@/theme';

export function Screen({ style, children, ...rest }: ViewProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.canvas,
        {
          paddingHorizontal: layout.screenMargin,
          paddingBottom: layout.navClearance + insets.bottom,
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
