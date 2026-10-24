/**
 * Save-success snackbar (S1 follow-up) — the proof a save committed.
 *
 * The Add form closes the moment `save()` resolves (fire-and-forget
 * refreshes), so without this the user stares at the Dashboard wondering
 * whether the money landed. Same float-above-the-nav shell as the V4 undo
 * snackbar, but usually informational only: a check icon and a shorter 6 s
 * window. A *queued* save is different — it has not reached the server, so it
 * gets a 10 s `Urungkan` window that drops the queue row locally (OB2).
 *
 * The Dashboard renders this only while no undo window is open (a delete's
 * 10 s `Urungkan` must never be stolen by a newer save's proof).
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, layout, radius, spacing, typography } from '@/theme';
import { pressedFeedback } from '@/components/pressed';
import { dictionaryFor, useLanguage } from '@/i18n';

export const SAVED_SNACKBAR_MS = 6_000;
export const QUEUED_SAVE_SNACKBAR_MS = 10_000;

export function SavedSnackbar({
  snack,
  onDismiss,
  onUndo,
  durationMs = SAVED_SNACKBAR_MS,
}: {
  /** Null = hidden. A new save re-arms the window. */
  snack: {
    label: string;
    createdAt: number;
    queued?: boolean;
    queuedId?: string;
  } | null;
  onDismiss: () => void;
  /** Present for a queued save; receives the queue row id. */
  onUndo?: (queuedId: string) => void;
  durationMs?: number;
}) {
  useEffect(() => {
    if (!snack) return;
    const timer = setTimeout(onDismiss, durationMs);
    return () => clearTimeout(timer);
  }, [snack, onDismiss, durationMs]);

  const language = useLanguage();
  const t = dictionaryFor(language);

  if (!snack) return null;

  return (
    <View
      testID="saved-snackbar"
      style={styles.wrap}
      accessibilityLiveRegion="polite"
    >
      <MaterialIcons
        name={snack.queued ? 'cloud-upload' : 'check-circle'}
        size={18}
        color={colors.accent}
      />
      <Text style={[typography.bodySm, styles.label]} numberOfLines={1}>
        {snack.label}
      </Text>
      {snack.queuedId && onUndo ? (
        <Pressable
          testID="saved-undo-button"
          accessibilityRole="button"
          accessibilityLabel={t.transactions.undo.cancelQueuedA11y}
          onPress={() => onUndo(snack.queuedId as string)}
          hitSlop={spacing.sm}
          style={({ pressed }) => [styles.undo, pressed && pressedFeedback]}
        >
          <Text style={[typography.labelUppercase, styles.undoLabel]}>
            {t.transactions.undo.action}
          </Text>
        </Pressable>
      ) : null}
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
  undo: {
    minHeight: 32,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  undoLabel: {
    color: colors.accent,
  },
});
