/**
 * Budget progress ring (DESIGN.md §5 "Progress").
 *
 * No `react-native-svg` (same reason as the analytics pie — a native module
 * would force a dev-client rebuild). The fill is a solid gold arc: a
 * right-half mask (`overflow: hidden`) over a rotating layer carrying a right
 * semicircle, rotated so the visible wedge is exactly
 * `[start, start + sweep]` (same geometry as the analytics pie, single
 * slice). The unfilled remainder is a thin `#2C2C2E` track ring.
 * `exceeded` fills the whole wheel and adds the blur-ring halo
 * (`rgba(212,175,55,0.25)`).
 *
 * This stays a gauge, not a pie: it shows one percent (which can exceed 100%,
 * something a parts-of-whole pie cannot represent) with a state label.
 * The centre shows the percent in JetBrains Mono (`currency-*` tokens) and the
 * state label beneath it — never red (DESIGN.md §1: no error reds in charts).
 */
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme';
import { useLanguage } from '@/i18n';

import {
  budgetStateLabel,
  ringFillFor,
  type BudgetState,
} from '../domain';

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
  const fill = ringFillFor(percent);
  const sweep = Math.min(Math.max(fill, 0), 1) * 360;
  const inner = size - thickness * 2;
  const half = size / 2;
  // Track circle radius R−t/2 so the track band [R−t, R] aligns exactly with
  // the visible fill annulus left exposed by the hole.
  const trackSize = size - thickness;

  // Sweeps above 180° split into a full half plus a remainder wedge.
  const parts: { start: number; sweep: number }[] = [];
  let rest = sweep;
  let offset = 0;
  while (rest > 0) {
    const part = Math.min(rest, 180);
    parts.push({ start: -90 + offset, sweep: part });
    offset += part;
    rest -= part;
  }

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
        <View
          style={[
            styles.track,
            {
              width: trackSize,
              height: trackSize,
              borderRadius: trackSize / 2,
              borderWidth: thickness,
            },
          ]}
          pointerEvents="none"
        />
        {parts.map((part, index) => (
          <View
            key={index}
            testID={index === 0 ? `${testID}-fill` : undefined}
            style={[
              styles.wedge,
              {
                width: size,
                height: size,
                transform: [{ rotate: `${part.start}deg` }],
              },
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
                    styles.arc,
                    {
                      width: half,
                      height: size,
                      marginLeft: half,
                      borderTopRightRadius: half,
                      borderBottomRightRadius: half,
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
          <Text
            testID={`${testID}-percent`}
            style={[typography.currencySm, styles.holePercent]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {formatRingPercent(percent)}
          </Text>
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
  /** Full thin track ring underneath the fill. */
  track: {
    position: 'absolute',
    borderColor: colors.surfaceElevated,
    backgroundColor: 'transparent',
  },
  /** Full-size layer rotated to the arc start; later parts paint on top. */
  wedge: {
    position: 'absolute',
  },
  /** Right-half mask — only the arc's home half stays visible. */
  mask: {
    overflow: 'hidden',
  },
  /** Full-size so its centre is the ring centre; carries the semicircle. */
  rotor: {
    backgroundColor: 'transparent',
  },
  arc: {
    // Progress-fill glow (`0 0 12px rgba(242,202,80,0.5)` in the catalog).
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.5,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  hole: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    // Same treatment as the Insight pie: a disc in the card colour, so the
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
