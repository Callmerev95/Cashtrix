/**
 * Animated donut arcs, native twin (P1a).
 *
 * Isolated ON PURPOSE (scan-corners pattern): real reanimated hooks live
 * only here; `donut-chart.tsx` lazy-loads this module and falls back to
 * static arcs in Jest / Expo Go / reduce-motion. Never import this file
 * statically from anywhere Jest touches.
 */
import { useEffect } from 'react';
import { Circle, G } from 'react-native-svg';
import Animated, {
  useAnimatedProps,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import type { DonutArcPart } from './donut-chart';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** Transition sweep duration + per-slice stagger (motion only). */
const DONUT_SWEEP_MS = 500;
const DONUT_STAGGER_MS = 60;

/** Arcs grow from zero on mount and on every data change (static twin in the chart). */
export function AnimatedDonutArcs({
  parts,
  animKey,
  center,
  radius,
  thickness,
  selectedId,
  onSelect,
  sliceA11y,
  testID,
}: {
  parts: DonutArcPart[];
  animKey: string;
  center: number;
  radius: number;
  thickness: number;
  selectedId: string | null;
  onSelect: ((id: string | null) => void) | undefined;
  sliceA11y: (label: string, share: number) => string;
  testID: string;
}) {
  return (
    <>
      {parts.map((part, index) => (
        <AnimatedDonutArc
          key={part.key}
          part={part}
          animKey={animKey}
          center={center}
          radius={radius}
          thickness={thickness}
          delayMs={index * DONUT_STAGGER_MS}
          selected={selectedId === part.sliceId}
          onSelect={onSelect}
          a11yLabel={sliceA11y(part.label, part.share)}
          testID={testID}
        />
      ))}
    </>
  );
}

function AnimatedDonutArc({
  part,
  animKey,
  center,
  radius,
  thickness,
  delayMs,
  selected,
  onSelect,
  a11yLabel,
  testID,
}: {
  part: DonutArcPart;
  animKey: string;
  center: number;
  radius: number;
  thickness: number;
  delayMs: number;
  selected: boolean;
  onSelect: ((id: string | null) => void) | undefined;
  a11yLabel: string;
  testID: string;
}) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = 0;
    progress.value = withDelay(
      delayMs,
      withTiming(1, { duration: DONUT_SWEEP_MS }),
    );
  }, [animKey, delayMs, progress]);

  const animatedProps = useAnimatedProps(() => ({
    strokeDasharray: `${progress.value * part.dash} ${part.gap}`,
    opacity: part.dimmed ? 0.35 : 1,
  }));

  return (
    <G key={part.key}>
      <AnimatedCircle
        testID={`${testID}-slice-${part.sliceId}`}
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={part.color}
        strokeWidth={thickness}
        strokeLinecap="butt"
        transform={`rotate(${part.rotation} ${center} ${center})`}
        accessible
        accessibilityLabel={a11yLabel}
        onPress={() => onSelect?.(selected ? null : part.sliceId)}
        animatedProps={animatedProps}
      />
    </G>
  );
}
