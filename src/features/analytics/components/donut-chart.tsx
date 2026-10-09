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

import { formatGrouped } from '../../transactions/domain';
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
  share: number;
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
    const rotation = -90 + cursor;
    parts.push({
      key: slice.id,
      sliceId: slice.id,
      label: slice.label,
      share: slice.share,
      color: sliceColor(index),
      rotation,
      dash: degToLen(show),
      gap: circumference,
      dimmed: selectedId !== null && selectedId !== slice.id,
    });
    cursor += sweep;
  });

  return (
    <View testID={testID} style={styles.wrap}>
      <View style={[styles.pie, { width: size, height: size }]}>
        <Svg width={size} height={size}>
          <G>
            {AnimatedDonutArcs && !reduceMotion ? (
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
                    strokeLinecap="butt"
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
