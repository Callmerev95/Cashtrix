import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Animated, Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, layout, radius, spacing, typography } from '@/theme';
import { pressedFeedback } from '@/components/pressed';
import { useSheetDrag } from './sheet-drag';
import type { QuickAction } from './quick-action-store';

// Seams live in `./sheet-drag` (shared with the voice sheet); re-exported
// here so existing imports keep resolving.
export {
  SHEET_DRAG_CLOSE_DY,
  SHEET_DRAG_CLOSE_VELOCITY,
  SHEET_DRAG_SLOP,
  sheetFlingVelocity,
  shouldClaimSheetDrag,
  shouldCloseSheet,
} from './sheet-drag';

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>['name'];

export function QuickActionSheet({
  open,
  title,
  actions,
  cancelLabel,
  onPick,
  onClose,
}: {
  open: boolean;
  title: string;
  actions: QuickAction[];
  cancelLabel: string;
  onPick: (action: QuickAction) => void;
  onClose: () => void;
}) {
  // Seret-tutup via hook bersama (`./sheet-drag` — juga dipakai sheet
  // suara): driver sentuh mentah, tanpa PanResponder/negosiasi.
  const {
    dragY,
    closing,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
  } = useSheetDrag(onClose);

  return (
    <View testID="quick-action-sheet" collapsable={false} style={styles.slot}>
      <Modal
        visible={open}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={onClose}
      >
        <View style={styles.overlay}>
          <Pressable
            testID="quick-action-scrim"
            accessibilityRole="button"
            accessibilityLabel={cancelLabel}
            onPress={onClose}
            style={styles.scrim}
          />
          <Animated.View
            style={[styles.card, { transform: [{ translateY: dragY }] }]}
            pointerEvents={closing ? 'none' : 'auto'}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchCancel}
          >
            <View
              testID="quick-action-handle"
              accessibilityLabel={cancelLabel}
              style={styles.handleHit}
            >
              <View style={styles.handle} />
            </View>
            <Text style={[typography.headlineSm, styles.title]} numberOfLines={1}>
              {title}
            </Text>
            {actions.map((action, index) => {
              const destructive = action.destructive === true;
              return (
                <Pressable
                  key={`${action.label}-${index}`}
                  testID={`quick-action-option-${index}`}
                  accessibilityRole="button"
                  accessibilityLabel={action.label}
                  onPress={() => onPick(action)}
                  style={({ pressed }) => [
                    styles.option,
                    destructive && styles.optionDestructive,
                    pressed && pressedFeedback,
                  ]}
                >
                  {action.icon ? (
                    <MaterialIcons
                      name={action.icon as MaterialIconName}
                      size={20}
                      color={destructive ? colors.error : colors.accent}
                    />
                  ) : null}
                  <Text
                    style={[
                      typography.bodyMd,
                      styles.optionLabel,
                      destructive && styles.optionLabelDestructive,
                    ]}
                  >
                    {action.label}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              testID="quick-action-cancel"
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
              onPress={onClose}
              style={({ pressed }) => [
                styles.cancel,
                pressed && pressedFeedback,
              ]}
            >
              <Text style={[typography.bodyMd, styles.cancelLabel]}>
                {cancelLabel}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // Zero-size when closed; the Modal carries the open UI in its own window
  // (same shell as VoiceBottomSheet — core Modal, no portal, no gesture).
  slot: {
    flex: 0,
  },
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.scrim,
    opacity: 0.6,
  },
  card: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.surfaceCard,
    paddingHorizontal: spacing.margin,
    paddingTop: spacing.xs,
    paddingBottom: spacing.margin,
    gap: spacing.xs,
  },
  handleHit: {
    alignSelf: 'stretch',
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginVertical: spacing.xs,
  },
  title: {
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  option: {
    minHeight: layout.minTapTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceElevated,
  },
  optionDestructive: {
    backgroundColor: colors.dangerSurface,
  },
  optionLabel: {
    color: colors.textPrimary,
  },
  optionLabelDestructive: {
    color: colors.error,
  },
  cancel: {
    minHeight: layout.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    marginTop: spacing.sm,
  },
  cancelLabel: {
    color: colors.textSecondary,
  },
});
