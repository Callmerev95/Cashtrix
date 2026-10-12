/**
 * Net area chart (P2b): surplus above and deficit below one zero line.
 *
 * Same buckets and labels as the bar chart, but values keep their sign —
 * normalised in `toNetPoints` against the largest absolute extreme so a
 * dip and a peak share one honest scale. The dashed zero line renders only
 * for mixed-sign windows; one-sided windows anchor to the plot edge.
 */
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Defs, Line, LinearGradient, Path, Stop, Svg } from 'react-native-svg';

import { colors, spacing, typography } from '@/theme';
import { dictionaryFor, useLanguage } from '@/i18n';

import type { NetPoint } from '../domain';

const MAX_AREA_HEIGHT = 120;

export function NetAreaChart({
  points,
  zeroY,
  testID = 'analytics-net',
}: {
  points: NetPoint[];
  zeroY: number;
  testID?: string;
}) {
  const language = useLanguage();
  const t = dictionaryFor(language).analytics;
  const [plotWidth, setPlotWidth] = useState(0);
  const hasValue = points.some((point) => point.value !== 0);

  if (!hasValue) {
    return (
      <Text testID={`${testID}-empty`} style={[typography.bodySm, styles.empty]}>
        {t.barsEmpty}
      </Text>
    );
  }

  const zeroPx = MAX_AREA_HEIGHT - zeroY * MAX_AREA_HEIGHT;
  const toPx = (point: NetPoint): string =>
    `${(point.x * plotWidth).toFixed(1)} ${(MAX_AREA_HEIGHT - point.y * MAX_AREA_HEIGHT).toFixed(1)}`;
  const line =
    points.length > 0 ? `M ${points.map(toPx).join(' L ')}` : '';
  const first = points[0];
  const last = points[points.length - 1];
  const area =
    first && last
      ? `${line} L ${(last.x * plotWidth).toFixed(1)} ${zeroPx.toFixed(1)} L ${(first.x * plotWidth).toFixed(1)} ${zeroPx.toFixed(1)} Z`
      : '';
  const step = Math.max(1, Math.ceil(points.length / 8));
  const showZeroLine = zeroY > 0 && zeroY < 1;

  return (
    <View testID={testID} style={styles.chart}>
      <View
        style={styles.plot}
        onLayout={(event) => setPlotWidth(event.nativeEvent.layout.width)}
      >
        {plotWidth > 0 ? (
          <Svg width={plotWidth} height={MAX_AREA_HEIGHT}>
            <Defs>
              <LinearGradient id="analytics-net-fill" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0" stopColor={colors.accent} stopOpacity={0.35} />
                <Stop offset="1" stopColor={colors.accent} stopOpacity={0.05} />
              </LinearGradient>
            </Defs>
            {showZeroLine ? (
              <Line
                x1={0}
                y1={zeroPx}
                x2={plotWidth}
                y2={zeroPx}
                stroke={colors.textSecondary}
                strokeWidth={1}
                strokeDasharray="4 4"
                opacity={0.6}
              />
            ) : null}
            {area !== '' ? (
              <Path d={area} fill="url(#analytics-net-fill)" />
            ) : null}
            {line !== '' ? (
              <Path
                testID={`${testID}-line`}
                d={line}
                fill="none"
                stroke={colors.accent}
                strokeWidth={2}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ) : null}
          </Svg>
        ) : null}
        {plotWidth > 0
          ? points.map((point, index) =>
              index % step === 0 ? (
                <Text
                  key={point.bucket}
                  style={[
                    typography.bodySm,
                    styles.axis,
                    { left: point.x * plotWidth },
                  ]}
                  numberOfLines={1}
                >
                  {point.label}
                </Text>
              ) : null,
            )
          : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chart: {
    paddingTop: spacing.md,
  },
  plot: {
    height: MAX_AREA_HEIGHT + spacing.lg,
  },
  axis: {
    position: 'absolute',
    bottom: 0,
    color: colors.textSecondary,
    fontSize: 10,
    transform: [{ translateX: -8 }],
  },
  empty: {
    paddingVertical: spacing.lg,
    textAlign: 'center',
    color: colors.textSecondary,
  },
});
