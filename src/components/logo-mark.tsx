/**
 * Brand mark — the Cashtrix "C" in a gold-ringed obsidian disc.
 *
 * The Stitch logo is a 120px squircle with a gold gradient stroke and glow;
 * this project has no `react-native-svg` (T6 reasoning: a native chart module
 * would force a dev-client rebuild), so the mark is composed from plain
 * `View`s: a 1px gradient frame (gold → border, like the hero card) around an
 * obsidian disc with a gold `C`. One component, so the header, auth screens
 * and sheets never drift apart.
 */
import { StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, gradients, typography } from '@/theme';

export function LogoMark({ size = 40 }: { size?: number }) {
  const disc = size - 2;
  const glyphSize = Math.round(size * 0.52);

  return (
    <LinearGradient
      colors={[...gradients.cardBorder]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.frame, { width: size, height: size, borderRadius: size / 2 }]}
    >
      <View
        style={[
          styles.disc,
          { width: disc, height: disc, borderRadius: disc / 2 },
        ]}
      >
        <Text
          style={[
            typography.headlineMd,
            styles.glyph,
            { fontSize: glyphSize, lineHeight: glyphSize * 1.2 },
          ]}
        >
          C
        </Text>
        <View
          style={[
            styles.spark,
            {
              width: glyphSize * 0.22,
              height: glyphSize * 0.22,
              borderRadius: glyphSize * 0.11,
              right: glyphSize * 0.28,
            },
          ]}
        />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  frame: {
    padding: StyleSheet.hairlineWidth,
    shadowColor: colors.accent,
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  disc: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    overflow: 'hidden',
  },
  glyph: {
    color: colors.accent,
  },
  spark: {
    position: 'absolute',
    backgroundColor: colors.accentSoft,
  },
});
