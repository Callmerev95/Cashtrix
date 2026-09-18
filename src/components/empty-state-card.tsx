/**
 * Empty state card with Obsidian minimalist abstract background glow & motifs.
 * Avoids consumer fintech cliparts; uses geometric glows & Material Icons.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';
import { GhostButton } from './button';

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>['name'];

export function EmptyStateCard({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  testID,
}: {
  icon: MaterialIconName;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}) {
  return (
    <View testID={testID} style={styles.card}>
      <View style={styles.ambience} pointerEvents="none" />
      <View style={styles.iconWell}>
        <MaterialIcons name={icon} size={28} color={colors.accent} />
      </View>
      <Text style={[typography.headlineSm, styles.title]}>{title}</Text>
      <Text style={[typography.bodyMd, styles.description]}>{description}</Text>
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <GhostButton
            label={actionLabel}
            onPress={onAction}
            testID={testID ? `${testID}-action` : undefined}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    padding: spacing.lg,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    overflow: 'hidden',
    position: 'relative',
    marginVertical: spacing.xs,
  },
  ambience: {
    position: 'absolute',
    top: -40,
    width: 120,
    height: 120,
    borderRadius: radius.full,
    backgroundColor: colors.accentAmbience,
  },
  iconWell: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    marginBottom: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.xs,
  },
  description: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  action: {
    marginTop: spacing.sm,
  },
});
