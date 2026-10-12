/**
 * Budget progress ring (DESIGN.md §5 "Progress").
 *
 * 2.1.0 Analytics Overhaul: rendered with `react-native-svg` (one preview
 * rebuild, ADR-0017). The fill is a single stroked `<Circle>` with a dash
 * gap starting at the top. No glow underlay: any paint outside the band
 * reads as a leak on device (2.1.0 crisp-edge decision) — the `exceeded`
 * halo (a real View shadow on the container) is the only glow that stays.
 * The thin track underneath stays a full stroked circle.
 *
 * This stays a gauge, not a pie: it shows one percent (which can exceed 100%,
 * something a parts-of-whole pie cannot represent) with a state label.
 * The centre shows the percent in JetBrains Mono (`currency-*` tokens) and the
 * state label beneath it — never red (DESIGN.md §1: no error reds in charts).
 */
import type { ComponentType } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Circle, Defs, G, LinearGradient, Stop, Svg } from 'react-native-svg';

import { colors, spacing, typography } from '@/theme';
import { useLanguage } from '@/i18n';
import { useReducedMotion } from '@/components';

import { reanimatedUsable } from '../../../components/reanimated-cap';

import {
  budgetStateLabel,
  ringFillFor,
  type BudgetState,
} from '../domain';
import { AnimatedNumber } from '../../analytics/components/animated-number';
import {
  arcGradientVector,
  roundCapSpan,
  shouldRoundCaps,
} from '../../analytics/domain';

type AnimatedRingArcProps = {
  dash: number;
  circumference: number;
  center: number;
  radius: number;
  thickness: number;
  gradientId: string;
  rotation: number;
  round: boolean;
  testID: string;
};

function loadAnimatedRingArc(): ComponentType<AnimatedRingArcProps> | null {
  if (!reanimatedUsable()) return null;
  
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./budget-ring-animated') as {
      AnimatedRingArc?: ComponentType<AnimatedRingArcProps>;
    };
    return typeof mod?.AnimatedRingArc === 'function'
      ? mod.AnimatedRingArc
      : null;
  } catch {
    return null;
  }
}

// Module scope: the native twin either loads once or the session renders
// a static arc (Jest, Expo Go).
const AnimatedRingArc = loadAnimatedRingArc();

/** Tick-era segment count — kept for the public seam; the ring is now solid. */
export const RING_SEGMENTS = 48;

export function BudgetRing({
  percent,
  state,
  size = 120,
  thickness = 14,
  testID = 'budget-ring',
}: {
  percent: number;
  state: BudgetState;
  size?: number;
  thickness?: number;
  testID?: string;
}) {
  // C6: state label follows the OS language (ADR-0008).
  const language = useLanguage();
  const reduceMotion = useReducedMotion();
  const fill = ringFillFor(percent);
  const sweep = Math.min(Math.max(fill, 0), 1) * 360;
  const inner = size - thickness * 2;
  const center = size / 2;
  const radius = (size - thickness) / 2;
  const circumference = 2 * Math.PI * radius;
  // P2a: along-arc sheen (accent → pale tip) + round caps pre-trimmed so
  // the tip stays exactly on the true percent.
  const gradientId = 'budget-ring-gradient';
  const round = sweep > 0 && shouldRoundCaps(sweep, thickness, circumference);
  const span = round
    ? roundCapSpan(-90, sweep, thickness, circumference)
    : { rotation: -90, dash: (sweep / 360) * circumference };
  const gradientVector = arcGradientVector(
    center,
    center,
    radius,
    span.rotation,
    (span.dash / circumference) * 360,
  );
  const trimmedDash = span.dash;
  const trimmedRotation = span.rotation;

  return (
    <View testID={testID} style={styles.wrap}>
      <View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            ...(state === 'exceeded' ? styles.halo : null),
          },
        ]}
      >
        <Svg width={size} height={size}>
          <Defs>
            <LinearGradient
              id={gradientId}
              gradientUnits="userSpaceOnUse"
              x1={gradientVector.x1}
              y1={gradientVector.y1}
              x2={gradientVector.x2}
              y2={gradientVector.y2}
            >
              <Stop offset="0" stopColor={colors.accent} />
              <Stop offset="1" stopColor={colors.accentSoft} />
            </LinearGradient>
          </Defs>
          <G>
            <Circle
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={colors.surfaceElevated}
              strokeWidth={thickness}
            />
            {sweep > 0 ? (
              AnimatedRingArc && !reduceMotion ? (
                <AnimatedRingArc
                  dash={trimmedDash}
                  circumference={circumference}
                  center={center}
                  radius={radius}
                  thickness={thickness}
                  gradientId={gradientId}
                  rotation={trimmedRotation}
                  round={round}
                  testID={testID}
                />
              ) : (
                <Circle
                  testID={`${testID}-fill`}
                  cx={center}
                  cy={center}
                  r={radius}
                  fill="none"
                  stroke={`url(#${gradientId})`}
                  strokeWidth={thickness}
                  strokeLinecap={round ? 'round' : 'butt'}
                  strokeDasharray={`${trimmedDash} ${circumference}`}
                  transform={`rotate(${trimmedRotation} ${center} ${center})`}
                />
              )
            ) : null}
          </G>
        </Svg>

        <View
          style={[
            styles.hole,
            { width: inner, height: inner, borderRadius: inner / 2 },
          ]}
        >
          <AnimatedNumber
            testID={`${testID}-percent`}
            value={percent}
            format={(n) => formatRingPercent(n)}
            style={[typography.currencySm, styles.holePercent]}
            numberOfLines={1}
            adjustsFontSizeToFit
          />
          <Text style={[typography.bodySm, styles.holeState]} numberOfLines={1}>
            {budgetStateLabel(state, language)}
          </Text>
        </View>
      </View>
    </View>
  );
}

/** Integer percent for the ring centre (`80%`, `120%`) — never `NaN`. */
export function formatRingPercent(percent: number): string {
  if (!Number.isFinite(percent) || percent <= 0) return '0%';
  return `${Math.round(percent)}%`;
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    // Blur-ring glow for the exceeded state (DESIGN.md §4 catalog). Classic
    // shadow props, like the primary button — no `boxShadow` strings.
    shadowColor: colors.accent,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  hole: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    // Same treatment as the Insight donut: a disc in the card colour, so the
    // centre reads as punched out rather than black (true transparency is
    // impossible — the fill meets underneath).
    backgroundColor: colors.surfaceCard,
    paddingHorizontal: spacing.sm,
    gap: 2,
  },
  holePercent: {
    color: colors.textPrimary,
  },
  holeState: {
    color: colors.textSecondary,
  },
});
