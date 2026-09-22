/**
 * Undo snackbar (V4 AC #1) — appears right after a delete commits, offers
 * `Urungkan` for ~10 s, then the soft-delete stands (30-day retention in the
 * DB, no recycle-bin screen: PRD §6.1 R5 keeps the surface minimal).
 *
 * The timer re-arms per `createdAt`, so two deletes in a row each get their
 * full window; the context clears `lastDeleted` before the restore RPC, so a
 * double-tap cannot fire two restores.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, layout, radius, spacing, typography } from '@/theme';

export const UNDO_SNACKBAR_MS = 10_000;

export function UndoSnackbar({
  snack,
  onUndo,
  onDismiss,
  durationMs = UNDO_SNACKBAR_MS,
}: {
  /** Null = hidden. Re-showing a new snack re-arms the 5 s window. */
  snack: { id: string; label: string; createdAt: number } | null;
  onUndo: () => void;
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
      testID="undo-snackbar"
      style={styles.wrap}
      accessibilityLiveRegion="polite"
    >
      <MaterialIcons name="delete-outline" size={18} color={colors.accent} />
      <Text style={[typography.bodySm, styles.label]} numberOfLines={1}>
        {snack.label}
      </Text>
      <Pressable
        testID="undo-button"
        accessibilityRole="button"
        accessibilityLabel="Urungkan penghapusan"
        onPress={onUndo}
        hitSlop={spacing.sm}
        style={({ pressed }) => [styles.undo, pressed && styles.pressed]}
      >
        <Text style={[typography.labelUppercase, styles.undoLabel]}>
          Urungkan
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    // Floats ABOVE the floating nav, not under it: `bottom: spacing.xl`
    // parks the bar inside the 96px nav clearance where the tab bar paints
    // over the scene — the snackbar rendered but was invisible (V6 gate
    // finding: state correct, zero pixels visible on device).
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
  undo: {
    minHeight: 32,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  undoLabel: {
    color: colors.accent,
  },
  pressed: {
    opacity: 0.7,
  },
});