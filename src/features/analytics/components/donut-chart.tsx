/**
 * Pie chart — top-8 expense categories + "Other" (PRD §2.3 Epic D).
 *
 * There is **no `react-native-svg`** in this project, and T5 already avoided
 * adding a native module (the date picker) for the same reason: a new native
 * dependency forces a dev-client rebuild. So each slice is a wedge composed
 * from plain `View`s: an outer layer rotated to the slice's start angle, a
 * right-half mask (`overflow: hidden`), and a rotating layer carrying a right
 * semicircle. The rotating layer is full-size so its centre coincides with
 * the pie centre; showing `[a, b]` means outer rotation `a + 90` and inner
 * rotation `(b - a) - 180`. Sweeps above 180° are split into a full half
 * plus a remainder wedge.
 *
 * The visual concept follows the Stitch Analytics reference: a gold→stone
 * ramp (`theme.chartRamp`, shared with the legend via `sliceColor`) with a
 * gap between wedges and a glow on the top slice, around a hollow centre
 * showing the range's total expense. Arcs thinner than `MIN_ARC_SHARE`
 * (0.5%) are already filtered out by `toDonutSlices`, so the pie never draws
 * invisible slivers.
 */
import { StyleSheet, Text, View } from 'react-native';

import { colors, shadows, spacing, typography } from '@/theme';

import { formatGrouped } from '../../transactions/domain';
import { sliceColor } from './slice-ramp';

/** Half-gap on each wedge edge — the card shows through as a separator. */
const EDGE_GAP_DEG = 1;

/** Wedges at or below this sweep skip the gap so slivers never vanish. */
const GAP_MIN_SWEEP_DEG = 3;

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
  const half = size / 2;

  type WedgePart = {
    key: string;
    sliceId: string;
    /** Outer rotation: visible arc starts at `outer - 90`. */
    outer: number;
    /** Inner rotation: visible arc spans `inner + 180`. */
    inner: number;
    color: string;
    glow: boolean;
  };
  const parts: WedgePart[] = [];
  let cursor = -90;
  const gapless = slices.length <= 1;
  slices.forEach((slice, index) => {
    const sweep = slice.share * 360;
    if (sweep <= 0) return;
    const color = sliceColor(index);
    const glow = index === 0;
    let rest = sweep;
    let offset = 0;
    const pieces = sweep > 180 ? 2 : 1;
    for (let piece = 0; piece < pieces; piece += 1) {
      const part = Math.min(rest, 180);
      const first = piece === 0;
      const last = piece === pieces - 1;
      // Gaps only on the slice's outer edges — never through the middle of
      // a split slice, and never on slivers or a lone full pie.
      const trimStart =
        !gapless && first && sweep > GAP_MIN_SWEEP_DEG ? EDGE_GAP_DEG : 0;
      const trimEnd =
        !gapless && last && sweep > GAP_MIN_SWEEP_DEG ? EDGE_GAP_DEG : 0;
      const showStart = cursor + offset + trimStart;
      const showSweep = Math.max(part - trimStart - trimEnd, 0.5);
      parts.push({
        key: `${slice.id}-${piece}`,
        sliceId: slice.id,
        outer: showStart + 90,
        inner: showSweep - 180,
        color,
        glow,
      });
      offset += part;
      rest -= part;
    }
    cursor += sweep;
  });

  return (
    <View testID={testID} style={styles.wrap}>
      <View style={[styles.pie, { width: size, height: size }]}>
        {parts.map((part) => (
          <View
            key={part.key}
            testID={`${testID}-slice-${part.sliceId}`}
            style={[
              styles.wedge,
              { width: size, height: size, transform: [{ rotate: `${part.outer}deg` }] },
            ]}
            pointerEvents="none"
          >
            <View
              style={[
                styles.mask,
                { width: half, height: size, marginLeft: half },
              ]}
            >
              <View
                style={[
                  styles.rotor,
                  {
                    width: size,
                    height: size,
                    marginLeft: -half,
                    transform: [{ rotate: `${part.inner}deg` }],
                  },
                ]}
              >
                <View
                  style={[
                    styles.halfDisc,
                    {
                      width: half,
                      height: size,
                      marginLeft: half,
                      borderTopRightRadius: half,
                      borderBottomRightRadius: half,
                      backgroundColor: part.color,
                    },
                    part.glow && styles.topGlow,
                  ]}
                />
              </View>
            </View>
          </View>
        ))}

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

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  pie: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Full-size layer rotated to the wedge start; later wedges paint on top. */
  wedge: {
    position: 'absolute',
  },
  /** Right-half mask — only the wedge's home half stays visible. */
  mask: {
    overflow: 'hidden',
  },
  /** Full-size so its centre is the pie centre; carries the semicircle. */
  rotor: {
    backgroundColor: 'transparent',
  },
  halfDisc: {
    backgroundColor: 'transparent',
  },
  /** Gold glow on the top-ranked slice, per the Stitch reference. */
  topGlow: {
    shadowColor: shadows.shadowColor,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
  },
  hole: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    // Solid card fill, not transparent: the wedges meet underneath, so the
    // hollow centre is a disc punched visually out of the pie. The card
    // gradient is subtle enough that the seam is invisible.
    backgroundColor: colors.surfaceCard,
    paddingHorizontal: spacing.md,
    gap: 2,
  },
  holeLabel: {
    color: colors.textSecondary,
  },
  holeValue: {
    color: colors.expense,
  },
});
