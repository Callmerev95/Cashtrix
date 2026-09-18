/**
 * Range segmented control (PRD §2.3 Epic D / DESIGN.md §5).
 *
 * Gold pill + glow on the active range, muted label on the rest. The pill is
 * gold-filled (not just gold-bordered) because this is a *filter* control, not
 * the Expense/Income toggle — DESIGN.md §5 calls out "gold fill on filters".
 */
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, layout, radius, shadows, spacing, typography } from '@/theme';

import { RANGE_PRESETS, rangeLabels, type RangePreset } from '../domain';

export function RangeSegmentedControl({
  value,
  onChange,
  testID = 'analytics-range',
}: {
  value: RangePreset;
  onChange: (value: RangePreset) => void;
  testID?: string;
}) {
  return (
    <View testID={testID} style={styles.well}>
      {RANGE_PRESETS.map((preset) => {
        const active = preset === value;
        return (
          <Pressable
            key={preset}
            testID={`range-option-${preset}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`Rentang ${rangeLabels[preset]}`}
            onPress={() => onChange(preset)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text
              style={[
                typography.bodyMd,
                styles.label,
                active && styles.labelActive,
              ]}
            >
              {rangeLabels[preset]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Wallet filter chips — horizontal scroller, "Semua" first. Active chip is
 * gold-bordered with gold text (DESIGN.md §5 "Filter chips active").
 */
export function WalletFilterChips({
  wallets,
  value,
  onChange,
  testID = 'analytics-wallet-filter',
}: {
  wallets: { id: string; name: string }[];
  value: string | null;
  onChange: (value: string | null) => void;
  testID?: string;
}) {
  if (wallets.length === 0) return null;

  return (
    <ScrollView
      testID={testID}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.chips}
    >
      <FilterChip
        label="Semua"
        active={value === null}
        testID="wallet-filter-all"
        onPress={() => onChange(null)}
      />
      {wallets.map((wallet) => (
        <FilterChip
          key={wallet.id}
          label={wallet.name}
          active={value === wallet.id}
          testID={`wallet-filter-${wallet.id}`}
          onPress={() => onChange(wallet.id)}
        />
      ))}
    </ScrollView>
  );
}

function FilterChip({
  label,
  active,
  onPress,
  testID,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[styles.chip, active && styles.chipActive]}
    >
      <Text
        style={[typography.bodySm, styles.chipLabel, active && styles.chipLabelActive]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  well: {
    flexDirection: 'row',
    padding: spacing.xs,
    gap: spacing.xs,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  segment: {
    flex: 1,
    minHeight: layout.minTapTarget - spacing.xs * 2,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  segmentActive: {
    backgroundColor: colors.accent,
    shadowColor: shadows.shadowColor,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
  },
  label: {
    color: colors.textSecondary,
  },
  labelActive: {
    color: colors.textOnAccent,
  },
  chips: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  chip: {
    minHeight: layout.minTapTarget - spacing.sm,
    paddingHorizontal: spacing.md,
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
  chipLabel: {
    color: colors.textSecondary,
  },
  chipLabelActive: {
    color: colors.accent,
  },
});
