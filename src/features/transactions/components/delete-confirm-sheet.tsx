/**
 * Destructive confirm sheet (AC #23–#24).
 *
 * The only place the error token is allowed to carry a *label*: the destructive
 * action text and its icon use `#FFB4AB` (DESIGN.md §1 — error is reserved for
 * destructive actions, never for expenses). Delete is soft (30-day retention in
 * the DB); the copy says so, because the user's mental model is what matters.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, layout, radius, spacing, typography } from '@/theme';

export function DeleteConfirmSheet({
  visible,
  title = 'Hapus transaksi ini?',
  body = 'Transaksi dipindahkan ke sampah dan dihapus permanen setelah 30 hari.',
  confirmLabel = 'Hapus',
  cancelLabel = 'Batal',
  closeLabel = 'Tutup',
  loading = false,
  onCancel,
  onConfirm,
  testID = 'delete-confirm',
}: {
  visible: boolean;
  title?: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  closeLabel?: string;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  testID?: string;
}) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <Pressable
        style={styles.scrim}
        accessibilityRole="button"
        accessibilityLabel={closeLabel}
        onPress={onCancel}
      >
        <Pressable
          testID={testID}
          style={styles.sheet}
          onPress={(event) => event.stopPropagation()}
        >
          <View style={styles.iconWell}>
            <MaterialIcons name="delete-outline" size={24} color={colors.error} />
          </View>

          <Text style={[typography.headlineSm, styles.title]}>{title}</Text>
          <Text style={[typography.bodyMd, styles.body]}>{body}</Text>

          <View style={styles.actions}>
            <Pressable
              testID={`${testID}-cancel`}
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
              onPress={onCancel}
              style={({ pressed }) => [styles.ghost, pressed && styles.pressed]}
            >
              <Text style={[typography.bodyLg, styles.ghostLabel]}>{cancelLabel}</Text>
            </Pressable>

            <Pressable
              testID={`${testID}-confirm`}
              accessibilityRole="button"
              accessibilityState={{ busy: loading }}
              accessibilityLabel={confirmLabel}
              disabled={loading}
              onPress={onConfirm}
              style={({ pressed }) => [
                styles.destructive,
                pressed && styles.pressed,
                loading && styles.disabled,
              ]}
            >
              <Text style={[typography.bodyLg, styles.destructiveLabel]}>
                {confirmLabel}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.margin,
    backgroundColor: colors.scrim,
  },
  sheet: {
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  iconWell: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  title: {
    marginTop: spacing.xs,
    color: colors.textPrimary,
  },
  body: {
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  ghost: {
    flex: 1,
    height: layout.buttonHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
  },
  ghostLabel: {
    color: colors.textPrimary,
  },
  destructive: {
    flex: 1,
    height: layout.buttonHeight,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.error,
    backgroundColor: colors.errorContainer,
  },
  destructiveLabel: {
    color: colors.error,
  },
  pressed: {
    transform: [{ scale: 0.99 }],
  },
  disabled: {
    opacity: 0.6,
  },
});
