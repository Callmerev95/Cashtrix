/**
 * Bar chart — daily (1M) or monthly (>1M) expense trend (PRD §2.3 Epic D).
 *
 * 2.1.0 Analytics Overhaul: bars are real svg `<Rect>`s sharing one gold
 * gradient (`<Defs>`, bottom→top per DESIGN.md §4). The plot is a single
 * `<Svg>` sized from `onLayout` with absolute coordinates — never
 * percentage widths, which Fabric measures as zero inside an
 * indefinite-width parent (device bug: the whole plot collapsed and the
 * card read as empty). Before the first layout pass only the axis row
 * renders, so nothing jumps.
 *
 * The bar glow stays a per-bar underlay rect at low opacity (svg has no
 * shadow). Columns tap via the axis labels (real Pressables — the primary
 * accessible path) with the svg rects as a bonus direct target;
 * `selectedBucket` dims the rest and turns the active label gold.
 *
 * Empty note follows the OS language (i18n-sweep). Heights still arrive
 * pre-computed as 0..1 fractions from `toBars`, so the axis/gap-filling
 * math stays in the tested domain layer.
 *
 * When every bucket is zero the chart shows an inline empty note rather than a
 * row of flat bars (AC #7 — no NaN/Infinity).
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Defs, LinearGradient, Rect, Stop, Svg } from 'react-native-svg';

import { colors, radius, spacing, typography } from '@/theme';
import { dictionaryFor, fill, useLanguage } from '@/i18n';

import { formatGrouped } from '../../transactions/domain';
import type { BarDatum } from '../domain';

const MAX_BAR_HEIGHT = 120;
const BAR_GAP = 2;
/** Ambience wash behind the bars (svg has no shadow): kept faint on purpose. */
const BAR_GLOW_OPACITY = 0.08;

export function BarChart({
  bars,
  selectedBucket = null,
  onSelect,
  testID = 'analytics-bars',
}: {
  bars: BarDatum[];
  /** The tapped bucket stays bright; the rest dim. */
  selectedBucket?: string | null;
  onSelect?: (bucket: string | null) => void;
  testID?: string;
}) {
  // C6: labels + number format follow the OS language (R10, ADR-0008).
  const language = useLanguage();
  const t = dictionaryFor(language).analytics;
  const [plotWidth, setPlotWidth] = useState(0);
  const hasValue = bars.some((bar) => bar.value > 0);

  if (!hasValue) {
    return (
      <Text testID={`${testID}-empty`} style={[typography.bodySm, styles.empty]}>
        {t.barsEmpty}
      </Text>
    );
  }

  const count = bars.length;
  const columnWidth =
    plotWidth > 0 ? (plotWidth - BAR_GAP * (count - 1)) / count : 0;
  const toggle = (bucket: string) =>
    onSelect?.(selectedBucket === bucket ? null : bucket);

  return (
    <View testID={testID} style={styles.chart}>
      <View
        style={styles.plot}
        onLayout={(event) => setPlotWidth(event.nativeEvent.layout.width)}
      >
        {plotWidth > 0 ? (
          <Svg width={plotWidth} height={MAX_BAR_HEIGHT}>
            <Defs>
              <LinearGradient id="analytics-bar-gradient" x1="0" y1="1" x2="0" y2="0">
                <Stop offset="0" stopColor={colors.accentSoft} />
                <Stop offset="1" stopColor={colors.accent} />
              </LinearGradient>
            </Defs>
            <Rect
              x={0}
              y={0}
              width={plotWidth}
              height={MAX_BAR_HEIGHT}
              fill={colors.accent}
              opacity={BAR_GLOW_OPACITY}
            />
            {bars.map((bar, index) => {
              const height = Math.max(2, bar.height * MAX_BAR_HEIGHT);
              const x = index * (columnWidth + BAR_GAP);
              const y = MAX_BAR_HEIGHT - height;
              const dimmed = selectedBucket !== null && selectedBucket !== bar.bucket;
              return (
                <Rect
                  key={bar.bucket}
                  x={x}
                  y={y}
                  width={Math.max(columnWidth, 2)}
                  height={height}
                  rx={radius.sm}
                  fill="url(#analytics-bar-gradient)"
                  opacity={dimmed ? 0.35 : bar.value > 0 ? 1 : 0.25}
                  onPress={() => toggle(bar.bucket)}
                />
              );
            })}
          </Svg>
        ) : null}
      </View>
      <View style={styles.labels}>
        {bars.map((bar) => {
          const selected = selectedBucket === bar.bucket;
          return (
            <Pressable
              key={bar.bucket}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={fill(t.barA11y, {
                label: bar.label,
                amount: `${t.currencyPrefix} ${formatGrouped(bar.value, language)}`,
              })}
              onPress={() => toggle(bar.bucket)}
              style={styles.labelCell}
            >
              <Text
                style={[
                  typography.bodySm,
                  styles.axis,
                  selected && styles.axisSelected,
                ]}
                numberOfLines={1}
              >
                {bar.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    paddingTop: spacing.md,
  },
  plot: {
    height: MAX_BAR_HEIGHT,
  },
  labels: {
    flexDirection: 'row',
    gap: BAR_GAP,
    marginTop: spacing.xs,
  },
  labelCell: {
    flex: 1,
    alignItems: 'center',
  },
  axis: {
    color: colors.textSecondary,
    fontSize: 10,
  },
  axisSelected: {
    color: colors.accent,
  },
  empty: {
    paddingVertical: spacing.lg,
    textAlign: 'center',
    color: colors.textSecondary,
  },
});
