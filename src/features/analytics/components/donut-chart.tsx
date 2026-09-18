/**
 * Donut wheel — top-8 expense categories + "Other" (PRD §2.3 Epic D).
 *
 * There is **no `react-native-svg`** in this project, and T5 already avoided
 * adding a native module (the date picker) for the same reason: a new native
 * dependency forces a dev-client rebuild. So the ring is composed from plain
 * `View`s: `DONUT_SEGMENTS` small ticks are placed evenly around a circle and
 * each is rotated to sit on its radius; a tick's colour is decided by which
 * slice owns its angle (`donutSegmentSliceIndices`, a pure function that is
 * unit-tested rather than eyeballed).
 *
 * Arcs thinner than `MIN_ARC_SHARE` (0.5%) are already filtered out by
 * `toDonutSlices`, so the wheel never draws invisible slivers. The centre
 * shows the range's total expense.
 */
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme';

import { formatGrouped } from '../../transactions/domain';
import { DONUT_SEGMENTS, donutSegmentSliceIndices } from '../domain';

/**
 * Gold-family ramp for the slices. The palette is deliberately monochrome-gold
 * (DESIGN.md §1 — accent is reserved), so a slice is distinguished by *opacity*
 * rather than a new hue: the first slice is full gold, later ones step down.
 */
const SLICE_ALPHAS = [1, 0.9, 0.8, 0.72, 0.64, 0.56, 0.48, 0.4, 0.38];

export function DonutChart({
  slices,
  total,
  size = 208,
  thickness = 24,
  testID = 'analytics-donut',
}: {
  slices: { id: string; label: string; value: number; share: number }[];
  total: number;
  size?: number;
  thickness?: number;
  testID?: string;
}) {
  const inner = size - thickness * 2;
  const owners = donutSegmentSliceIndices(slices, DONUT_SEGMENTS);

  return (
    <View testID={testID} style={styles.wrap}>
      <View style={[styles.ring, { width: size, height: size }]}>
        {owners.map((ownerIndex, segment) => {
          const turn = segment / DONUT_SEGMENTS;
          const alpha =
            ownerIndex >= 0 ? (SLICE_ALPHAS[ownerIndex] ?? 0.18) : 0;
          const slice = ownerIndex >= 0 ? slices[ownerIndex] : undefined;

          return (
            <View
              key={segment}
              testID={
                slice ? `${testID}-seg-${slice.id}-${segment}` : undefined
              }
              style={[
                styles.tickWrap,
                {
                  width: size,
                  height: size,
                  transform: [{ rotate: `${turn * 360}deg` }],
                },
              ]}
              pointerEvents="none"
            >
              <View
                style={[
                  styles.tick,
                  {
                    width: thickness,
                    height: thickness,
                    borderRadius: thickness / 2,
                    backgroundColor:
                      alpha > 0
                        ? withAlpha(colors.accent, alpha)
                        : colors.surfaceElevated,
                  },
                ]}
              />
            </View>
          );
        })}

        <View
          style={[
            styles.hole,
            { width: inner, height: inner, borderRadius: inner / 2 },
          ]}
        >
          <Text style={[typography.labelUppercase, styles.holeLabel]}>
            Pengeluaran
          </Text>
          <Text
            testID={`${testID}-total`}
            style={[typography.currencySm, styles.holeValue]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            Rp {formatGrouped(total)}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** `#RRGGBB` + alpha → `rgba(...)`. Keeps a single accent hue, stepped. */
function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  tickWrap: {
    position: 'absolute',
    alignItems: 'center',
  },
  tick: {
    // Sits at the top of the rotated wrapper, so rotation of the wrapper places
    // the tick on its radius. The wrapper is `size` wide, so `alignItems`
    // centres the tick horizontally on the ring's diameter.
    marginTop: 0,
  },
  hole: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    paddingHorizontal: spacing.md,
    gap: 2,
  },
  holeLabel: {
    color: colors.textSecondary,
  },
  holeValue: {
    color: colors.textPrimary,
  },
});
