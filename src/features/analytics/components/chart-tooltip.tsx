/**
 * Selection detail, one line (P2a slim pass): a bordered card for three
 * data points wastes a ~70px box with dead space on the right. One inline
 * row — dot + `name · amount · share` — carries identical info in ~28px,
 * borderless so it dissolves into the card. Same testID and accessibility
 * contract as before.
 */
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme';

export function ChartTooltip({
  swatch,
  title,
  lines,
  a11yLabel,
  testID = 'analytics-tooltip',
}: {
  /** Rank colour dot (matches the selected arc/bar). */
  swatch: string;
  title: string;
  lines: string[];
  a11yLabel: string;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={a11yLabel}
      style={styles.row}
    >
      <View style={[styles.dot, { backgroundColor: swatch }]} />
      <Text style={[typography.bodyMd, styles.text]} numberOfLines={1}>
        {[title, ...lines].join(' · ')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  text: {
    flex: 1,
    color: colors.textPrimary,
  },
});
