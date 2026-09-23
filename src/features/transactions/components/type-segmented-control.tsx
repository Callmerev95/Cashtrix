/**
 * Expense/Income/Transfer segmented toggle (DESIGN.md §5 / AC #15, V2).
 *
 * The active pill is gold with a glow and an obsidian label; the inactive
 * option is muted. Selection is owned by the caller so the last choice can be
 * persisted and restored when the form reopens.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, layout, radius, spacing, typography } from '@/theme';
import { useLanguage } from '@/i18n';

import {
  TRANSACTION_TYPES,
  transactionTypeLabel,
  type TransactionType,
} from '../domain';

export function TypeSegmentedControl({
  value,
  onChange,
  testID,
}: {
  value: TransactionType;
  onChange: (value: TransactionType) => void;
  testID?: string;
}) {
  // C6: labels follow the OS language (ADR-0008).
  const language = useLanguage();
  return (
    <View testID={testID} style={styles.well}>
      {TRANSACTION_TYPES.map((option) => {
        const active = option === value;
        const label = transactionTypeLabel(option, language);
        return (
          <Pressable
            key={option}
            testID={`type-option-${option}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={label}
            onPress={() => onChange(option)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <Text
              style={[
                typography.bodyMd,
                styles.label,
                active && styles.labelActive,
              ]}
            >
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
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
    shadowColor: colors.accent,
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
});
