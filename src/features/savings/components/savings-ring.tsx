/**
 * Savings progress ring (SV3, `specs/cashtrix-savings.md`).
 *
 * Static on purpose: unlike the budget ring there is no animated number and
 * no reanimated bridge, so this works in Jest/Expo Go without a native twin.
 * The arc is one stroked circle; the percentage is centred in the hole and
 * the status/date/amount live outside it. Eye-hidden draws the track only.
 */
import { StyleSheet, Text, View } from 'react-native';
import { Circle, G, Svg } from 'react-native-svg';

import { colors, typography } from '@/theme';

import { formatRingPercent } from '../../budgets/domain';
import { MASKED_SAVINGS_PERCENT, ringFillFor } from '../domain';

export function SavingsRing({
  percent,
  size = 72,
  thickness,
  hidden = false,
  accessibilityLabel,
  testID = 'savings-ring',
}: {
  percent: number;
  size?: number;
  thickness?: number;
  hidden?: boolean;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const band = thickness ?? Math.max(7, Math.round(size * 0.12));
  const center = size / 2;
  const radius = (size - band) / 2;
  const circumference = 2 * Math.PI * radius;
  const fill = hidden ? 0 : ringFillFor(percent);
  const isFull = fill >= 1;
  const dash = fill * circumference;
  const percentStyle = size >= 72 ? typography.currencySm : typography.bodySm;

  return (
    <View
      testID={testID}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={accessibilityLabel}
      accessibilityValue={
        hidden
          ? undefined
          : { min: 0, max: 100, now: Math.min(Math.max(percent, 0), 100) }
      }
      style={[styles.wrap, { width: size, height: size }]}
    >
      <Svg width={size} height={size}>
        <G>
          <Circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={colors.surfaceElevated}
            strokeWidth={band}
          />
          {fill > 0 ? (
            <Circle
              testID={`${testID}-fill`}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={colors.accent}
              strokeWidth={band}
              strokeLinecap={isFull ? 'butt' : 'round'}
              strokeDasharray={
                isFull ? undefined : `${dash} ${circumference}`
              }
              transform={`rotate(-90 ${center} ${center})`}
            />
          ) : null}
        </G>
      </Svg>
      <Text
        testID={`${testID}-percent`}
        style={[percentStyle, styles.percent]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {hidden ? MASKED_SAVINGS_PERCENT : formatRingPercent(percent)}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  percent: {
    position: 'absolute',
    color: colors.textPrimary,
  },
});
