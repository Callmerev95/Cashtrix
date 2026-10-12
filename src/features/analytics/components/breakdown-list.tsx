/**
 * Category breakdown rows — the legend beneath the donut (PRD §2.3 Epic D,
 * "Analytics" screen: donut → bar chart → category breakdown rows).
 *
 * One row per rendered slice (so the rows and the wheel always match), with
 * the slice's ramp colour (`sliceColor`, shared with the pie), the category
 * name/icon, the amount and the share percentage.
 *
 * 2.1.0 PR2: rows are the accessible selection path — each is a button that
 * toggles the shared `selectedId` (the wheel dims in sync). Amount prefix
 * comes from the dictionary (i18n-sweep).
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Polyline, Svg } from 'react-native-svg';

import { colors, layout, radius, spacing, typography } from '@/theme';
import { dictionaryFor, fill, useLanguage } from '@/i18n';
import { Stagger } from '@/components/stagger';

import { formatGrouped } from '../../transactions/domain';
import type { Sparkline } from '../domain';
import { sliceColor } from './slice-ramp';

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>['name'];

/** Sparkline footprint: readable at a glance, cheap to draw. */
const SPARK_W = 64;
const SPARK_H = 20;

export function BreakdownList({
  slices,
  sparks = [],
  selectedId = null,
  onSelect,
  testID = 'analytics-breakdown',
}: {
  slices: { id: string; label: string; icon: string; value: number; share: number }[];
  /** Per-slice normalised shapes from `toSparklines` (best-effort). */
  sparks?: Sparkline[];
  /** Shared with the donut: the selected row stays bright, the rest dim. */
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  testID?: string;
}) {
  // C6: amount format + strings follow the OS language (R10, ADR-0008).
  const language = useLanguage();
  const t = dictionaryFor(language).analytics;
  if (slices.length === 0) return null;
  const sparkById = new Map(sparks.map((spark) => [spark.id, spark.values]));

  return (
    <View testID={testID} style={styles.list}>
      {slices.map((slice, index) => {
        const selected = selectedId === slice.id;
        const dimmed = selectedId !== null && !selected;
        const spark = sparkById.get(slice.id) ?? null;
        return (
          <Stagger key={slice.id} index={index}>
          <Pressable
            testID={`${testID}-row-${slice.id}`}
            accessibilityRole="button"
            accessibilityState={{ selected }}
            accessibilityLabel={fill(t.sliceA11y, {
              label: slice.label,
              share: `${Math.round(slice.share * 100)}`,
            })}
            onPress={() => onSelect?.(selected ? null : slice.id)}
            style={[styles.row, dimmed && styles.dimmed]}
          >
            <View
              style={[styles.swatch, { backgroundColor: sliceColor(index) }]}
            >
              <MaterialIcons
                name={slice.icon as MaterialIconName}
                size={16}
                color={colors.textOnAccent}
              />
            </View>

            <View style={styles.texts}>
              <Text style={[typography.bodyMd, styles.name]} numberOfLines={1}>
                {slice.label}
              </Text>
              {spark != null && spark.length > 1 ? (
                <Svg
                  testID={`${testID}-spark-${slice.id}`}
                  width={SPARK_W}
                  height={SPARK_H}
                >
                  <Polyline
                    points={spark
                      .map(
                        (value, position) =>
                          `${((position / (spark.length - 1)) * (SPARK_W - 4) + 2).toFixed(1)},${(SPARK_H - 2 - value * (SPARK_H - 4)).toFixed(1)}`,
                      )
                      .join(' ')}
                    fill="none"
                    stroke={sliceColor(index)}
                    strokeWidth={1.5}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    opacity={dimmed ? 0.35 : 0.9}
                  />
                </Svg>
              ) : null}
            </View>

            <Text style={[typography.bodySm, styles.share]} numberOfLines={1}>
              {(slice.share * 100).toFixed(0)}%
            </Text>

            <Text
              style={[typography.currencySm, styles.amount]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {t.currencyPrefix} {formatGrouped(slice.value, language)}
            </Text>
          </Pressable>
          </Stagger>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.xs,
  },
  row: {
    minHeight: layout.minTapTarget - spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dimmed: {
    opacity: 0.45,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    flex: 1,
    color: colors.textPrimary,
  },
  texts: {
    flex: 1,
    gap: 2,
  },
  nameSelected: {
    color: colors.accent,
  },
  share: {
    color: colors.textSecondary,
    minWidth: 40,
    textAlign: 'right',
  },
  amount: {
    color: colors.textPrimary,
    minWidth: 96,
    textAlign: 'right',
  },
});
