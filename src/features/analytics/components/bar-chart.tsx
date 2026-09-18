/**
 * Bar chart — daily (1M) or monthly (>1M) expense trend (PRD §2.3 Epic D).
 *
 * Bars are plain `View`s with an `expo-linear-gradient` fill (already a
 * dependency), gold gradient + glow per DESIGN.md §4. Heights come pre-computed
 * as 0..1 fractions from `toBars`, so this component only lays out pixels —
 * the axis/gap-filling math stays in the tested domain layer.
 *
 * When every bucket is zero the chart shows an inline empty note rather than a
 * row of flat bars (AC #7 — no NaN/Infinity).
 */
import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, shadows, spacing, typography } from '@/theme';

import type { BarDatum } from '../domain';

const MAX_BAR_HEIGHT = 120;

export function BarChart({
  bars,
  testID = 'analytics-bars',
}: {
  bars: BarDatum[];
  testID?: string;
}) {
  const hasValue = bars.some((bar) => bar.value > 0);

  if (!hasValue) {
    return (
      <Text testID={`${testID}-empty`} style={[typography.bodySm, styles.empty]}>
        Tidak ada pengeluaran pada rentang ini.
      </Text>
    );
  }

  return (
    <View testID={testID} style={styles.chart}>
      <View style={styles.plot}>
        {bars.map((bar) => (
          <View key={bar.bucket} style={styles.column}>
            <View style={styles.barSlot}>
              <LinearGradient
                colors={[...barGradient]}
                start={{ x: 0, y: 1 }}
                end={{ x: 0, y: 0 }}
                style={[
                  styles.bar,
                  {
                    height: Math.max(2, bar.height * MAX_BAR_HEIGHT),
                    opacity: bar.value > 0 ? 1 : 0.25,
                  },
                ]}
              />
            </View>
            <Text style={[typography.bodySm, styles.axis]} numberOfLines={1}>
              {bar.label}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** Gold gradient bars (DESIGN.md §4 — chart bars: gold gradient + glow). */
const barGradient = [colors.accentSoft, colors.accent] as const;

const styles = StyleSheet.create({
  chart: {
    paddingTop: spacing.md,
  },
  plot: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: MAX_BAR_HEIGHT + 24,
    gap: 2,
  },
  column: {
    flex: 1,
    alignItems: 'center',
    gap: spacing.xs,
  },
  barSlot: {
    height: MAX_BAR_HEIGHT,
    justifyContent: 'flex-end',
  },
  bar: {
    width: '100%',
    minWidth: 3,
    borderRadius: radius.sm,
    shadowColor: shadows.shadowColor,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  axis: {
    color: colors.textSecondary,
    fontSize: 10,
  },
  empty: {
    paddingVertical: spacing.lg,
    textAlign: 'center',
    color: colors.textSecondary,
  },
});
