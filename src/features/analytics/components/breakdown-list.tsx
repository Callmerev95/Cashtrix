/**
 * Category breakdown rows — the legend beneath the donut (PRD §2.3 Epic D,
 * "Analytics" screen: donut → bar chart → category breakdown rows).
 *
 * One row per rendered slice (so the rows and the wheel always match), with
 * the slice's ramp colour (`sliceColor`, shared with the pie), the category
 * name/icon, the amount and the share percentage.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, layout, radius, spacing, typography } from '@/theme';

import { formatGrouped } from '../../transactions/domain';
import { sliceColor } from './slice-ramp';

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>['name'];

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
            style={[styles.swatch, { backgroundColor: sliceColor(index) }]}
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
