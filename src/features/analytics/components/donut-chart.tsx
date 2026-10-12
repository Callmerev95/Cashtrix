/**
 * Donut chart — top-8 expense categories + tail (PRD §2.3 Epic D).
 *
 * 2.1.0 Analytics Overhaul: rendered with `react-native-svg` (one preview
 * rebuild, ADR-0017). Each slice is a ring segment drawn as a stroked
 * `<Circle>` with a dash gap — the same geometry the old View-wedge stack
 * produced (cursor starts at the top, 1° gap per edge, slivers ≤3° and lone
 * pies gapless), but as real arcs instead of rotated masks. The hollow
 * centre stays a View disc so the total keeps its typography.
 *
 * Touch: each slice's visible arc toggles the shared `selectedId`
 * (non-selected arcs dim per-element); the breakdown rows stay the primary
 * accessible path. No glow underlay: any paint outside the band reads as a
 * leak on device (2.1.0 crisp-edge decision) — rank 0 is distinguished by
 * the brightest ramp colour alone.
 *
 * Centre label and currency prefix follow the OS language (i18n-sweep).
 *
 * Arcs thinner than `MIN_ARC_SHARE` (0.5%) are already filtered out by
 * `toDonutSlices`, so the wheel never draws invisible slivers.
 */
import type { ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Circle, G, Svg } from 'react-native-svg';

import { colors, spacing, typography } from '@/theme';
import { dictionaryFor, fill, useLanguage } from '@/i18n';
import { useReducedMotion } from '@/components';

import { reanimatedUsable } from '../../../components/reanimated-cap';

import { formatGrouped } from '../../transactions/domain';
import { roundCapSpan, shouldRoundCaps } from '../domain';
import { ChartTooltip } from './chart-tooltip';
import { sliceColor } from './slice-ramp';

/** Half-gap on each wedge edge — the card shows through as a separator. */
const EDGE_GAP_DEG = 1;

/** Wedges at or below this sweep skip the gap so slivers never vanish. */
const GAP_MIN_SWEEP_DEG = 3;

/** One rendered arc (shared by the static and animated paths). */
export type DonutArcPart = {
  key: string;
  sliceId: string;
  label: string;
  value: number;
  share: number;
  sweep: number;
  /** Round caps iff long enough (shouldRoundCaps); else flat hugging. */
  round: boolean;
  color: string;
  rotation: number;
  dash: number;
  gap: number;
  dimmed: boolean;
};

type AnimatedDonutArcsProps = {
  parts: DonutArcPart[];
  animKey: string;
  center: number;
  radius: number;
  thickness: number;
  selectedId: string | null;
  onSelect: ((id: string | null) => void) | undefined;
  sliceA11y: (label: string, share: number) => string;
  testID: string;
};

function loadAnimatedDonutArcs(): ComponentType<AnimatedDonutArcsProps> | null {
  if (!reanimatedUsable()) return null;
  
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./donut-arcs-animated') as {
      AnimatedDonutArcs?: ComponentType<AnimatedDonutArcsProps>;
    };
    return typeof mod?.AnimatedDonutArcs === 'function'
      ? mod.AnimatedDonutArcs
      : null;
  } catch {
    return null;
  }
}

// Module scope: the native twin either loads once or the session renders
// static arcs (Jest, Expo Go).
const AnimatedDonutArcs = loadAnimatedDonutArcs();

export function DonutChart({
  slices,
  total,
  size = 208,
  thickness = 24,
  selectedId = null,
  onSelect,
  testID = 'analytics-donut',
}: {
  slices: { id: string; label: string; value: number; share: number }[];
  total: number;
  size?: number;
  thickness?: number;
  /** Shared with the breakdown rows: non-selected arcs dim. */
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
  testID?: string;
}) {
  // C6: center-total format + strings follow the OS language (R10).
  const language = useLanguage();
  const t = dictionaryFor(language).analytics;
  const reduceMotion = useReducedMotion();
  const inner = size - thickness * 2;
  const center = size / 2;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  const degToLen = (deg: number) => (deg / 360) * circumference;

  const parts: DonutArcPart[] = [];
  let cursor = 0;
  const gapless = slices.length <= 1;
  slices.forEach((slice, index) => {
    const sweep = slice.share * 360;
    if (sweep <= 0) return;
    const trim =
      !gapless && sweep > GAP_MIN_SWEEP_DEG ? EDGE_GAP_DEG * 2 : 0;
    const show = Math.max(sweep - trim, 0.5);
    // Round caps only on arcs long enough to carry them (shouldRoundCaps):
    // small arcs stay flat-ended so they hug the ring instead of floating
    // off as dots that collide. Rank colour is flat (legend twin).
    const round = shouldRoundCaps(show, thickness, circumference);
    const span = round
      ? roundCapSpan(-90 + cursor, show, thickness, circumference)
      : { rotation: -90 + cursor, dash: degToLen(show) };
    parts.push({
      key: slice.id,
      sliceId: slice.id,
      label: slice.label,
      value: slice.value,
      share: slice.share,
      sweep,
      round,
      color: sliceColor(index),
      rotation: span.rotation,
      dash: span.dash,
      gap: circumference,
      dimmed: selectedId !== null && selectedId !== slice.id,
    });
    cursor += sweep;
  });

  const selected = parts.find((part) => part.sliceId === selectedId) ?? null;
  // A lone full wheel is a solid ring, not an arc: caps meeting at one
  // point leave a 1px AA seam (same device proof as the budget ring).
  const fullPart =
    gapless && parts.length === 1 && cursor >= 359.9 ? parts[0] : null;

  return (
    <View testID={testID} style={styles.wrap}>
      <View style={[styles.pie, { width: size, height: size }]}>
        <Svg width={size} height={size}>
          <G>
            {fullPart != null ? (
              <Circle
                testID={`${testID}-slice-${fullPart.sliceId}`}
                cx={center}
                cy={center}
                r={radius}
                fill="none"
                stroke={fullPart.color}
                strokeWidth={thickness}
                opacity={fullPart.dimmed ? 0.35 : 1}
                accessible
                accessibilityLabel={fill(t.sliceA11y, {
                  label: fullPart.label,
                  share: `${Math.round(fullPart.share * 100)}`,
                })}
                onPress={() =>
                  onSelect?.(
                    selectedId === fullPart.sliceId ? null : fullPart.sliceId,
                  )
                }
              />
            ) : AnimatedDonutArcs && !reduceMotion ? (
              <AnimatedDonutArcs
                parts={parts}
                animKey={parts.map((p) => `${p.sliceId}:${p.dash}`).join('|')}
                center={center}
                radius={radius}
                thickness={thickness}
                selectedId={selectedId}
                onSelect={onSelect}
                sliceA11y={(label: string, share: number) =>
                  fill(t.sliceA11y, {
                    label,
                    share: `${Math.round(share * 100)}`,
                  })
                }
                testID={testID}
              />
            ) : (
              parts.map((part) => (
                <G key={part.key}>
                  <Circle
                    testID={`${testID}-slice-${part.sliceId}`}
                    cx={center}
                    cy={center}
                    r={radius}
                    fill="none"
                    stroke={part.color}
                    strokeWidth={thickness}
                    strokeLinecap={part.round ? 'round' : 'butt'}
                    opacity={part.dimmed ? 0.35 : 1}
                    strokeDasharray={`${part.dash} ${part.gap}`}
                    transform={`rotate(${part.rotation} ${center} ${center})`}
                    accessible
                    accessibilityLabel={fill(t.sliceA11y, {
                      label: part.label,
                      share: `${Math.round(part.share * 100)}`,
                    })}
                    onPress={() =>
                      onSelect?.(
                        selectedId === part.sliceId ? null : part.sliceId,
                      )
                    }
                  />
                </G>
              ))
            )}
          </G>
        </Svg>

        <View
          style={[
            styles.hole,
            { width: inner, height: inner, borderRadius: inner / 2 },
          ]}
        >
          <Text style={[typography.labelUppercase, styles.holeLabel]}>
            {t.donutCenter}
          </Text>
          <Text
            testID={`${testID}-total`}
            style={[typography.currencySm, styles.holeValue]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {t.currencyPrefix} {formatGrouped(total, language)}
          </Text>
        </View>
      </View>

      {selected != null ? (
        <ChartTooltip
          swatch={selected.color}
          title={selected.label}
          lines={[
            `${t.currencyPrefix} ${formatGrouped(selected.value, language)}`,
            `${Math.round(selected.share * 100)}%`,
          ]}
          a11yLabel={fill(t.sliceA11y, {
            label: selected.label,
            share: `${Math.round(selected.share * 100)}`,
          })}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    paddingVertical: spacing.md,
    gap: spacing.sm,
  },
  pie: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  hole: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    // Solid card fill, not transparent: the arcs meet underneath, so the
    // hollow centre is a disc punched visually out of the ring. The card
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
