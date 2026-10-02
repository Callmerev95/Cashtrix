/**
 * Google Sign-In button per the GSI dark-theme spec (Continue/Sign up with
 * Google): `#131314` surface, `#8e918f` border, 20px radius, official G icon.
 * Height is the repo tap target (48) rather than the spec's 40px. Brand hex
 * lives in `googleButton` tokens (theme.ts is the only hex-allowed file).
 */
import { ActivityIndicator, Image, Pressable, StyleSheet, Text } from 'react-native';

import { fontFamily, googleButton, spacing } from '@/theme';
import { pressedFeedback } from '@/components/pressed';

type GoogleButtonProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  testID?: string;
};

export function GoogleButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  testID,
}: GoogleButtonProps) {
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
        styles.frame,
        inactive && styles.inactive,
        pressed && !inactive && pressedFeedback,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={googleButton.label} />
      ) : (
        <>
          <Image
            source={require('../../assets/google-g.png')}
            style={styles.icon}
            accessibilityIgnoresInvertColors
          />
          <Text style={styles.label}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: googleButton.height,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: googleButton.iconGap,
    paddingHorizontal: spacing.md,
    borderRadius: googleButton.borderRadius,
    backgroundColor: googleButton.surface,
    borderWidth: 1,
    borderColor: googleButton.border,
  },
  inactive: {
    opacity: 0.38,
  },
  icon: {
    width: googleButton.iconSize,
    height: googleButton.iconSize,
    resizeMode: 'contain',
  },
  label: {
    color: googleButton.label,
    fontFamily: fontFamily.medium,
    fontSize: 14,
    fontWeight: '500',
    letterSpacing: 0.25,
  },
});
