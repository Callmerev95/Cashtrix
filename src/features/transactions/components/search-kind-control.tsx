/**
 * Search kind filter (A3) — Semua/Pengeluaran/Pemasukan/Transfer.
 *
 * Chip language from the Analytics wallet filter (`FilterChip`, DESIGN.md §5
 * "Filter chips active: gold border + gold text"), per owner review: the
 * segmented well read as a second form toggle, while these are filters.
 * Contract (testIDs, accessibilityState, onChange) is unchanged.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, layout, radius, spacing, typography } from '@/theme';

import { KIND_FILTER_OPTIONS, type TransactionKindFilter } from '../domain';

export function SearchKindControl({
  value,
  onChange,
  testID = 'search-kind',
}: {
  value: TransactionKindFilter;
  onChange: (value: TransactionKindFilter) => void;
  testID?: string;
}) {
  return (
    <View testID={testID} style={styles.row}>
      {KIND_FILTER_OPTIONS.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            testID={`search-kind-${option.value}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={option.label}
            onPress={() => onChange(option.value)}
            style={[styles.chip, active && styles.chipActive]}
          >
            <Text
              style={[
                typography.bodySm,
                styles.label,
                active && styles.labelActive,
              ]}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.75}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  chip: {
    flex: 1,
    height: layout.minTapTarget - spacing.sm,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: 'transparent',
  },
  label: {
    color: colors.textSecondary,
  },
  labelActive: {
    color: colors.accent,
  },
});
