/**
 * Shared distribution-ramp accessor — the single source for pie-slice fills
 * and legend swatches, so the wheel and its legend can never diverge again
 * (they previously used two independent alpha ramps).
 *
 * Rank 0 is the brightest gold with the glow; the tail recedes into stone
 * neutrals per the Stitch Analytics reference. Colours live in
 * `theme.chartRamp`.
 */
import { chartRamp } from '@/theme';

/** Fill colour for the slice/swatch at distribution rank `index`. */
export function sliceColor(index: number): string {
  return chartRamp[Math.min(Math.max(index, 0), chartRamp.length - 1)];
}
