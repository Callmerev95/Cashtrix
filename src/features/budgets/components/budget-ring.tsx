/**
 * Budget progress ring (DESIGN.md §5 "Progress").
 *
 * No `react-native-svg` (same reason as the analytics donut in T6 — a native
 * module would force a dev-client rebuild). The ring is `RING_SEGMENTS` plain
 * ticks around a circle: filled ticks run gold (`accent`, full glow like the
 * progress-fill token `0 0 12px rgba(242,202,80,0.5)`), the rest sit on the
 * `#2C2C2E` track. `exceeded` fills the whole wheel and adds the blur-ring
 * halo (`rgba(212,175,55,0.25)`).
 *
 * The centre shows the percent in JetBrains Mono (`currency-*` tokens) and the
 * state label beneath it — never red (DESIGN.md §1: no error reds in charts).
 */
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme';

import {
  budgetStateLabels,
  ringFillFor,
  type BudgetState,
} from '../domain';

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
  const fill = ringFillFor(percent);
  const filled = Math.round(fill * RING_SEGMENTS);
  const inner = size - thickness * 2;

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
        {Array.from({ length: RING_SEGMENTS }, (_, segment) => {
          const isFilled = segment < filled;
          return (
            <View
              key={segment}
              testID={isFilled ? `${testID}-fill-${segment}` : undefined}
              style={[
                styles.tickWrap,
                {
                  width: size,
                  height: size,
                  transform: [{ rotate: `${(segment / RING_SEGMENTS) * 360}deg` }],
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
                    backgroundColor: isFilled
                      ? colors.accent
                      : colors.surfaceElevated,
                    ...(isFilled ? styles.tickGlow : null),
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
          <Text
            testID={`${testID}-percent`}
            style={[typography.currencySm, styles.holePercent]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatRingPercent(percent)}
          </Text>
          <Text style={[typography.bodySm, styles.holeState]} numberOfLines={1}>
            {budgetStateLabels[state]}
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
  tickWrap: {
    position: 'absolute',
    alignItems: 'center',
  },
  tick: {
    marginTop: 0,
  },
  tickGlow: {
    // Progress-fill glow (`0 0 12px rgba(242,202,80,0.5)` in the catalog).
    shadowColor: colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  hole: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
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
