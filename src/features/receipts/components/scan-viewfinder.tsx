/**
 * Scan viewfinder (Plan A): in-app camera with a premium scan frame.
 *
 * `expo-camera` only (OTA needs a preview rebuild — same rule as D4/B4/AI6).
 * The module loads lazily in a try/catch so Jest / Expo Go degrade to the
 * legacy `expo-image-picker` path instead of crashing (pola `lock/api`).
 *
 * Layout: `CameraView` full-bleed + 4 scrim slices (top/bottom/left/right)
 * around a responsive center hole — never one overlay with a hole punched
 * in it. Corners are thick gold brackets (`scanBracket`, never
 * income-green). Capture is a 72px white-minimal circle in the dark
 * bottom zone, centered, above the safe area.
 */
import type { ComponentType, Ref } from 'react';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { dictionaryFor, useLanguage } from '@/i18n';
import { colors, layout, radius, spacing, typography } from '@/theme';
import { pressedFeedback } from '@/components/pressed';
import { tapRecord } from '@/features/haptics';

type CameraViewElement = {
  takePictureAsync?: (options?: {
    quality?: number;
  }) => Promise<{ uri?: string } | null | undefined>;
} | null;

type CameraViewProps = {
  ref?: Ref<CameraViewElement>;
  style?: object;
  facing?: 'back' | 'front';
  onCameraReady?: () => void;
};

type CameraModule = {
  CameraView?: ComponentType<CameraViewProps>;
  requestCameraPermissionsAsync?: () => Promise<{ granted?: boolean }>;
};

function loadCameraModule(): CameraModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-camera') as CameraModule;
  } catch {
    return null;
  }
}

/** True when the native CameraView exists (Jest / Expo Go → false). */
export function isScanViewfinderAvailable(): boolean {
  const mod = loadCameraModule();
  return Boolean(mod?.CameraView);
}

const FRAME_W = 260;
const FRAME_H = 380;
const CORNER_LEN = 28;
const CORNER_THICK = 4;
const CAPTURE_SIZE = 72;

export function ScanViewfinder({
  visible,
  onClose,
  onCaptured,
  testID = 'scan-viewfinder',
}: {
  visible: boolean;
  onClose: () => void;
  onCaptured: (uri: string) => void;
  testID?: string;
}) {
  const language = useLanguage();
  const tr = dictionaryFor(language).transactions.receipt;
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const cameraRef = useRef<CameraViewElement>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  const frameWidth = Math.min(FRAME_W, windowWidth * 0.7);
  const frameHeight = frameWidth * (FRAME_H / FRAME_W);

  async function capture(
    CameraViewComp: ComponentType<CameraViewProps>,
    requestPermission?: () => Promise<{ granted?: boolean }>,
  ) {
    void CameraViewComp;
    if (busy || !ready) return;
    if (requestPermission) {
      const permission = await requestPermission().catch(() => null);
      if (permission && !permission.granted) return;
    }
    setBusy(true);
    try {
      void tapRecord('start');
      const photo = await cameraRef.current?.takePictureAsync?.({
        quality: 0.9,
      });
      const uri = photo?.uri;
      if (uri) {
        void tapRecord('stop');
        onCaptured(uri);
      }
    } finally {
      setBusy(false);
    }
  }

  if (!visible) return null;
  const mod = loadCameraModule();
  const CameraViewComp = mod?.CameraView;
  if (!CameraViewComp) return null;

  return (
    <Modal
      testID={testID}
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.root}>
        <CameraViewComp
          ref={cameraRef}
          style={styles.camera}
          facing="back"
          onCameraReady={() => setReady(true)}
        />
        <View style={styles.overlay} pointerEvents="box-none">
          <View style={styles.scrimTop} />
          <View style={styles.middleRow} pointerEvents="box-none">
            <View style={styles.scrimSide} />
            <View
              testID="scan-frame"
              style={[styles.frame, { width: frameWidth, height: frameHeight }]}
            >
              <View style={styles.cornerTl} pointerEvents="none" />
              <View style={styles.cornerTr} pointerEvents="none" />
              <View style={styles.cornerBl} pointerEvents="none" />
              <View style={styles.cornerBr} pointerEvents="none" />
              <Text style={[typography.bodySm, styles.hint]}>
                {tr.viewfinderHint}
              </Text>
            </View>
            <View style={styles.scrimSide} />
          </View>
          <View
            style={[
              styles.scrimBottom,
              { paddingBottom: insets.bottom + spacing.lg },
            ]}
          >
            <Pressable
              testID="scan-capture"
              accessibilityRole="button"
              accessibilityLabel={tr.viewfinderCaptureA11y}
              onPress={() =>
                void capture(CameraViewComp, mod.requestCameraPermissionsAsync)
              }
              hitSlop={spacing.sm}
              style={({ pressed }) => [
                styles.capture,
                pressed && pressedFeedback,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={colors.textOnAccent} />
              ) : (
                <View style={styles.captureInner} />
              )}
            </Pressable>
            <Pressable
              testID="scan-close"
              accessibilityRole="button"
              accessibilityLabel={tr.viewfinderCloseA11y}
              onPress={onClose}
              hitSlop={spacing.sm}
              style={({ pressed }) => [styles.close, pressed && pressedFeedback]}
            >
              <MaterialIcons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  camera: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  overlay: {
    flex: 1,
  },
  scrimTop: {
    flex: 1,
    backgroundColor: colors.scrim,
  },
  middleRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  scrimSide: {
    flex: 1,
    backgroundColor: colors.scrim,
  },
  frame: {
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingBottom: spacing.md,
  },
  cornerTl: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: CORNER_LEN,
    height: CORNER_LEN,
    borderTopWidth: CORNER_THICK,
    borderLeftWidth: CORNER_THICK,
    borderColor: colors.scanBracket,
  },
  cornerTr: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: CORNER_LEN,
    height: CORNER_LEN,
    borderTopWidth: CORNER_THICK,
    borderRightWidth: CORNER_THICK,
    borderColor: colors.scanBracket,
  },
  cornerBl: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: CORNER_LEN,
    height: CORNER_LEN,
    borderBottomWidth: CORNER_THICK,
    borderLeftWidth: CORNER_THICK,
    borderColor: colors.scanBracket,
  },
  cornerBr: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: CORNER_LEN,
    height: CORNER_LEN,
    borderBottomWidth: CORNER_THICK,
    borderRightWidth: CORNER_THICK,
    borderColor: colors.scanBracket,
  },
  hint: {
    color: colors.textPrimary,
    textAlign: 'center',
  },
  scrimBottom: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.scrim,
  },
  capture: {
    width: CAPTURE_SIZE,
    height: CAPTURE_SIZE,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.textPrimary,
    minHeight: layout.minTapTarget,
    minWidth: layout.minTapTarget,
  },
  captureInner: {
    width: CAPTURE_SIZE - 16,
    height: CAPTURE_SIZE - 16,
    borderRadius: radius.full,
    backgroundColor: colors.textPrimary,
    borderWidth: 2,
    borderColor: colors.textSecondary,
  },
  close: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.md,
    width: layout.minTapTarget,
    height: layout.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
