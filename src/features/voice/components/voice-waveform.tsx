import { StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/theme';

/**
 * Waveform placeholder (B1, ADR-0016, item d) — a static View-only bar row
 * shown while the AI prefill is in flight.
 *
 * Deliberately a placeholder, not a live meter: there is no audio level
 * stream on this path (dictation comes from the OS keyboard mic), so an
 * animated "listening" visual would be a honesty violation (same rule as
 * the fixed 0.42 scan confidence). The AI6 record path owns the live
 * waveform; this one just marks "AI is working" next to the status copy.
 * Decorative: hidden from accessibility services.
 */
const BAR_HEIGHTS = [
  8, 14, 22, 12, 26, 18, 30, 20, 10, 24, 16, 28, 14, 22, 10, 18, 26, 12,
];

export function VoiceWaveform() {
  return (
    <View
      testID="voice-waveform"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={styles.row}
    >
      {BAR_HEIGHTS.map((height, index) => (
        <View key={index} style={[styles.bar, { height }]} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 36,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    opacity: 0.85,
  },
  bar: {
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
});
