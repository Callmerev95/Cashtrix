import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { colors, radius, spacing } from '@/theme';

type VoiceBottomSheetProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  testID?: string;
};

/**
 * 1-tap sheet shell over React Native's core `Modal` (separate window:
 * always bounded, always on top) with a dimmed tap-to-close backdrop and a
 * bottom card. Declarative `visible` only — no imperative present/dismiss.
 *
 * History (Oct 2026 voice gate bug): this shell previously drove Gorhom's
 * `BottomSheetModal` (`present()` in an effect). On device the modal subtree
 * never appeared in the hierarchy (mic gold, nothing opens) across three
 * OTA-proven variants — mount-fresh, persistent-mount, hoisted-bound —
 * with zero JS errors: the portal host collapses inside this tree and the
 * sheet presents into nothing. The plain-`View` fallback proved the
 * trigger/state/content chain healthy on the same device, so the shell
 * moved to the core `Modal`, which cannot fail that way (no portal, no
 * host measurement, no native bridge beyond core).
 */
export function VoiceBottomSheet({
  open,
  onClose,
  children,
  testID = 'voice-bottom-sheet',
}: VoiceBottomSheetProps) {
  return (
    <View testID={testID} collapsable={false} style={styles.slot}>
      <Modal
        visible={open}
        transparent
        animationType="slide"
        statusBarTranslucent
        onRequestClose={onClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.overlay}
        >
          <Pressable
            testID="voice-sheet-scrim"
            accessibilityRole="button"
            accessibilityLabel="Close voice panel"
            onPress={onClose}
            style={styles.scrim}
          />
          <View style={styles.card}>
            <View style={styles.handle} />
            <ScrollView
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {children}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  // Zero-size when closed; the Modal carries the open UI in its own window.
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
    maxHeight: '85%',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: colors.surfaceCard,
    paddingHorizontal: spacing.margin,
    paddingBottom: spacing.margin,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.borderStrong,
    marginVertical: spacing.sm,
  },
});
