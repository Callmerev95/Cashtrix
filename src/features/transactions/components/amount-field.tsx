/**
 * Amount entry (DESIGN.md §5 / AC #16–#17).
 *
 * A static gold `Rp` glyph outside the field, then the formatted digits in
 * JetBrains Mono. The value is re-formatted on every keystroke through
 * `formatAmountInput`, so the user sees `1.250.000` as they type and never a
 * raw digit run. Validation copy is rendered underneath; it stays the
 * caller's decision *when* to show it so the field is not red while pristine.
 */
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, fontFamily, layout, radius, spacing, typography } from '@/theme';

export function AmountField({
  value,
  onChangeText,
  error,
  testID,
}: {
  /** Already-formatted (`1.250.000`). */
  value: string;
  /** Receives the raw keystrokes; the caller formats via `formatAmountInput`. */
  onChangeText: (raw: string) => void;
  error?: string | null;
  testID?: string;
}) {
  return (
    <View>
      <View style={[styles.well, error ? styles.wellError : null]}>
        <Text style={styles.glyph}>Rp</Text>
        <TextInput
          testID={testID}
          style={styles.input}
          value={value}
          onChangeText={onChangeText}
          placeholder="0"
          placeholderTextColor={colors.textSecondary}
          selectionColor={colors.accent}
          keyboardType="number-pad"
          inputMode="numeric"
          accessibilityLabel="Nominal"
          maxLength={20}
        />
      </View>
      {error ? (
        <Text testID={testID ? `${testID}-error` : undefined} style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  well: {
    minHeight: layout.buttonHeight + spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  wellError: {
    borderColor: colors.error,
  },
  glyph: {
    // Static gold currency glyph — never part of the editable value, so the
    // caret never lands before it.
    fontFamily: fontFamily.monoMedium,
    fontSize: 20,
    lineHeight: 24,
    color: colors.accent,
  },
  input: {
    flex: 1,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    fontFamily: fontFamily.monoMedium,
    fontSize: 22,
    lineHeight: 28,
  },
  error: {
    marginTop: spacing.xs,
    color: colors.error,
    ...typography.bodySm,
  },
});
