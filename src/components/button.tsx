/**
 * Buttons per DESIGN.md §5: primary = gradient gold, obsidian label, 52px,
 * radius 16, tap scale(0.99); ghost = transparent with gold text.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, gradients, layout, radius, spacing, typography } from '@/theme';

type CommonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  testID?: string;
};

/**
 * Props for a button wrapped in `<Link asChild>`: expo-router injects the
 * press handler, and the explicit `onPress` must be omitted or it would shadow
 * the navigation.
 */
export type LinkButtonProps = Omit<CommonProps, 'onPress'> & {
  onPress?: () => void;
};

export function PrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  style,
  testID,
}: LinkButtonProps) {
  const inactive = disabled || loading;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      accessibilityLabel={label}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [
        styles.primaryFrame,
        style,
        inactive && styles.primaryInactive,
        pressed && styles.pressed,
      ]}
    >
      <LinearGradient
        colors={[...gradients.primary]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.primaryFill}
      >
        {loading ? (
          <ActivityIndicator color={colors.textOnAccent} />
        ) : (
          <Text style={styles.primaryLabel}>{label}</Text>
        )}
      </LinearGradient>
    </Pressable>
  );
}

export function GhostButton({
  label,
  onPress,
  disabled,
  danger = false,
  style,
  testID,
}: LinkButtonProps & { danger?: boolean }) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }: { pressed: boolean }) => [
        styles.ghost,
        style,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.ghostLabel, danger && styles.ghostLabelDanger]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  primaryFrame: {
    height: layout.buttonHeight,
    borderRadius: radius.md,
    overflow: 'hidden',
    shadowColor: colors.accent,
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  primaryFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryInactive: {
    opacity: 0.5,
  },
  primaryLabel: {
    color: colors.textOnAccent,
    ...typography.bodyLg,
  },
  ghost: {
    minHeight: layout.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  ghostLabel: {
    color: colors.accent,
    ...typography.bodyMd,
  },
  ghostLabelDanger: {
    color: colors.error,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
});
