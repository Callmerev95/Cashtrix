/**
 * Pie chart — top-8 expense categories + "Other" (PRD §2.3 Epic D).
 *
 * There is **no `react-native-svg`** in this project, and T5 already avoided
 * adding a native module (the date picker) for the same reason: a new native
 * dependency forces a dev-client rebuild. So each slice is a wedge composed
 * from plain `View`s: an outer layer rotated to the slice's start angle, a
 * right-half mask (`overflow: hidden`), and a rotating layer carrying a right
 * semicircle. The rotating layer is full-size so its centre coincides with
 * the pie centre; rotating the semicircle by `sweep - 180` inside the mask
 * yields exactly the wedge `[start, start + sweep]` for sweeps ≤ 180°.
 * Sweeps above 180° are split into a full half plus a remainder wedge.
 *
 * The visual concept matches the Stitch wheel: monochrome-gold slices
 * (distinguished by opacity, DESIGN.md §1) around a hollow centre showing
 * the range's total expense. Arcs thinner than `MIN_ARC_SHARE` (0.5%) are
 * already filtered out by `toDonutSlices`, so the pie never draws invisible
 * slivers.
 */
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme';

import { formatGrouped } from '../../transactions/domain';

/**
 * Gold-family ramp for the slices. The palette is deliberately monochrome-gold
 * (DESIGN.md §1 — accent is reserved), so a slice is distinguished by *opacity*
 * rather than a new hue: the first slice is full gold, later ones step down.
 */
const SLICE_ALPHAS = [1, 0.9, 0.8, 0.72, 0.64, 0.56, 0.48, 0.4, 0.38];

/** Hairline overlap into the next slice so pixel seams never show canvas. */
const SEAM_OVERLAP_DEG = 1;

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
    start: number;
    sweep: number;
    color: string;
  };
  const parts: WedgePart[] = [];
  let cursor = -90;
  slices.forEach((slice, index) => {
    const sweep = slice.share * 360;
    if (sweep <= 0) return;
    const color = withAlpha(colors.accent, SLICE_ALPHAS[index] ?? 0.38);
    let rest = sweep;
    let offset = 0;
    while (rest > 0) {
      const part = Math.min(rest, 180);
      // Extend into the next wedge (drawn later, on top) to hide seams —
      // except on full halves, where an extension would break the geometry.
      const drawn = part < 180 - SEAM_OVERLAP_DEG ? part + SEAM_OVERLAP_DEG : part;
      parts.push({
        key: `${slice.id}-${offset}`,
        sliceId: slice.id,
        start: cursor + offset,
        sweep: drawn,
        color,
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
              { width: size, height: size, transform: [{ rotate: `${part.start}deg` }] },
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
                    transform: [{ rotate: `${part.sweep - 180}deg` }],
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
    color: colors.textPrimary,
  },
});
