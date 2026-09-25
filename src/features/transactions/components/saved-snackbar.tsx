/**
 * Save-success snackbar (S1 follow-up) — the proof a save committed.
 *
 * The Add form closes the moment `save()` resolves (fire-and-forget
 * refreshes), so without this the user stares at the Dashboard wondering
 * whether the money landed. Same float-above-the-nav shell as the V4 undo
 * snackbar, but informational only: a check icon, no action, and a shorter
 * 6 s window — there is nothing to decide, only something to confirm.
 *
 * The Dashboard renders this only while no undo window is open (a delete's
 * 10 s `Urungkan` must never be stolen by a newer save's proof).
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, layout, radius, spacing, typography } from '@/theme';

export const SAVED_SNACKBAR_MS = 6_000;

export function SavedSnackbar({
  snack,
  onDismiss,
  durationMs = SAVED_SNACKBAR_MS,
}: {
  /** Null = hidden. A new save re-arms the window. */
  snack: { label: string; createdAt: number } | null;
  onDismiss: () => void;
  durationMs?: number;
}) {
  useEffect(() => {
    if (!snack) return;
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [snack, onDismiss, durationMs]);

  if (!snack) return null;

  return (
    <View
      testID="saved-snackbar"
      style={styles.wrap}
      accessibilityLiveRegion="polite"
    >
      <MaterialIcons name="check-circle" size={18} color={colors.accent} />
      <Text style={[typography.bodySm, styles.label]} numberOfLines={1}>
        {snack.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    // Same above-nav float as the undo snackbar (V6 gate finding: inside the
    // 96px nav clearance the bar renders but zero pixels stay visible).
    bottom: layout.navClearance + spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  label: {
    flex: 1,
    color: colors.textPrimary,
  },
});
