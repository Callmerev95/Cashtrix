/**
 * Text field following the canonical input pattern (DESIGN.md §5): Layer-2
 * fill, hairline `border-strong`, radius 16, gold focus border at 60%.
 *
 * Owns focus/blur/password-visibility because every auth screen needs the same
 * behaviour; validation and copy stay with the caller.
 */
import { useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

import { colors, layout, radius, spacing, typography } from '@/theme';

export type TextFieldProps = TextInputProps & {
  /** Renders the error state (error border) — message copy is the caller's. */
  hasError?: boolean;
  /** Eye toggle for password fields. */
  secureToggle?: boolean;
};

export function TextField({
  hasError = false,
  secureToggle = false,
  style,
  ...rest
}: TextFieldProps) {
  const [focused, setFocused] = useState(false);
  const [hidden, setHidden] = useState(secureToggle);

  return (
    <View
      style={[
        styles.well,
        focused && styles.wellFocused,
        hasError && styles.wellError,
      ]}
    >
      <TextInput
        {...rest}
        style={[styles.input, style]}
        placeholderTextColor={colors.textSecondary}
        selectionColor={colors.accent}
        secureTextEntry={secureToggle ? hidden : rest.secureTextEntry}
        onFocus={(event) => {
          setFocused(true);
          rest.onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          rest.onBlur?.(event);
        }}
      />
      {secureToggle ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={hidden ? 'Tampilkan password' : 'Sembunyikan password'}
          hitSlop={spacing.sm}
          onPress={() => setHidden((value) => !value)}
        >
          <MaterialIcons
            name={hidden ? 'visibility' : 'visibility-off'}
            size={20}
            color={colors.textSecondary}
          />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  well: {
    minHeight: layout.buttonHeight,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  wellFocused: {
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 0 },
  },
  wellError: {
    borderColor: colors.error,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    ...typography.bodyLg,
  },
});
