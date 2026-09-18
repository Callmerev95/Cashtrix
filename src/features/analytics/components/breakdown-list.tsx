/**
 * Category breakdown rows — the legend beneath the donut (PRD §2.3 Epic D,
 * "Analytics" screen: donut → bar chart → category breakdown rows).
 *
 * One row per rendered slice (so the rows and the wheel always match), with the
 * gold swatch at the slice's opacity, the category name/icon, the amount and
 * the share percentage.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, layout, radius, spacing, typography } from '@/theme';

import { formatGrouped } from '../../transactions/domain';

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>['name'];

const SWATCH_ALPHAS = [1, 0.82, 0.68, 0.56, 0.47, 0.39, 0.32, 0.26, 0.2];

export function BreakdownList({
  slices,
  testID = 'analytics-breakdown',
}: {
  slices: { id: string; label: string; icon: string; value: number; share: number }[];
  testID?: string;
}) {
  if (slices.length === 0) return null;

  return (
    <View testID={testID} style={styles.list}>
      {slices.map((slice, index) => (
        <View key={slice.id} testID={`${testID}-row-${slice.id}`} style={styles.row}>
          <View
            style={[
              styles.swatch,
              {
                backgroundColor: withAlpha(
                  colors.accent,
                  SWATCH_ALPHAS[index] ?? 0.2,
                ),
              },
            ]}
          >
            <MaterialIcons
              name={slice.icon as MaterialIconName}
              size={16}
              color={colors.textOnAccent}
            />
          </View>

          <Text style={[typography.bodyMd, styles.name]} numberOfLines={1}>
            {slice.label}
          </Text>

          <Text style={[typography.bodySm, styles.share]} numberOfLines={1}>
            {(slice.share * 100).toFixed(0)}%
          </Text>

          <Text style={[typography.currencySm, styles.amount]} numberOfLines={1}>
            Rp {formatGrouped(slice.value)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function withAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const styles = StyleSheet.create({
  list: {
    gap: spacing.xs,
  },
  row: {
    minHeight: layout.minTapTarget - spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  swatch: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: {
    flex: 1,
    color: colors.textPrimary,
  },
  share: {
    color: colors.textSecondary,
    minWidth: 40,
    textAlign: 'right',
  },
  amount: {
    color: colors.textPrimary,
    minWidth: 96,
    textAlign: 'right',
  },
});
