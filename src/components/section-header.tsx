/**
 * Section header — the Stitch structural separator: a `label-uppercase`
 * kicker on the left, an optional gold micro-action on the right
 * (`Kelola`, `6 Categories`, `Lihat semua →`).
 *
 * Sections are divided by these kickers, not by heavy divider lines
 * (DESIGN.md §2). One component so the kicker/action pairing never drifts
 * between Dashboard, Budgets and the form screens.
 */
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme';

export function SectionHeader({
  title,
  actionLabel,
  onAction,
  testID,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}) {
  return (
    <View testID={testID} style={styles.row}>
      <Text style={[typography.labelUppercase, styles.title]}>{title}</Text>
      {actionLabel && onAction ? (
        <Pressable
          testID={testID ? `${testID}-action` : undefined}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
          onPress={onAction}
          hitSlop={spacing.sm}
        >
          <Text style={[typography.labelUppercase, styles.action]}>
            {actionLabel}
          </Text>
        </Pressable>
      ) : actionLabel ? (
        <Text style={[typography.labelUppercase, styles.meta]}>
          {actionLabel}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.textSecondary,
  },
  action: {
    color: colors.accent,
  },
  meta: {
    color: colors.textSecondary,
  },
});
