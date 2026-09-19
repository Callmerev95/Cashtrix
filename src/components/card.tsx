/**
 * L1 container card — the single "gradient card" language (Paket G, #26).
 *
 * Subtle tonal gradient (`surfaceCard → background`, the `cardFill` token)
 * with a hairline border: top-light that fades into the canvas, never a
 * gold tint (gold stays a scalpel — CTA, income, active states). Small and
 * interactive elements (chips, cells, inputs, segmented wells, plain rows)
 * stay solid; bottom sheets and scaffolds are overlay surfaces, not cards.
 *
 * Radius/padding/border overrides ride on `style` (last wins); `borderColor`
 * exists for the destructive variant (delete-account warning, danger rows).
 */
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, type ViewProps } from 'react-native';

import { colors, gradients, radius } from '@/theme';

export function Card({
  children,
  style,
  testID,
  borderColor,
}: ViewProps & { borderColor?: string }) {
  return (
    <LinearGradient
      testID={testID}
      colors={[...gradients.cardFill]}
      style={[
        styles.base,
        borderColor ? { borderColor } : null,
        style,
      ]}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
