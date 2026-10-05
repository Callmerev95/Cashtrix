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
 *
 * Post-capture (`scanning`): the live feed freezes onto the captured photo
 * and the laser sweeps the frame itself while OCR runs — the scan feedback
 * lives where the action happened, not in a separate card below the form.
 */
import type { ComponentType, Ref } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { dictionaryFor, useLanguage } from '@/i18n';
import { useReducedMotion } from '@/components';
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
  enableTorch?: boolean;
  onCameraReady?: () => void;
};

type CameraModule = {
  CameraView?: ComponentType<CameraViewProps>;
  requestCameraPermissionsAsync?: () => Promise<{ granted?: boolean }>;
};

type ScanCornersProps = {
  corner: {
    tl: StyleProp<ViewStyle>;
    tr: StyleProp<ViewStyle>;
    bl: StyleProp<ViewStyle>;
    br: StyleProp<ViewStyle>;
  };
  glow: StyleProp<ViewStyle>;
};

function loadScanCorners(): ComponentType<ScanCornersProps> | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('./scan-corners') as {
      ScanCorners?: ComponentType<ScanCornersProps>;
    };
    return typeof mod?.ScanCorners === 'function' ? mod.ScanCorners : null;
  } catch {
    return null;
  }
}

// Module scope (not render): the animated corners module either loads once
// or degrades to the static twin for the session (Jest, Expo Go).
const ScanCornersAnimated = loadScanCorners();

function loadCameraModule(): CameraModule | null {  try {
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
const SCAN_LASER_HEIGHT = 2;
/** Sweep ping-pong period + tick (triangle wave, ~15fps). */
const SWEEP_MS = 2600;
const SWEEP_STEP_MS = 65;

export function ScanViewfinder({
  visible,
  onClose,
  onCaptured,
  scanning = false,
  previewUri = null,
  testID = 'scan-viewfinder',
}: {
  visible: boolean;
  onClose: () => void;
  onCaptured: (uri: string) => void;
  /**
   * Post-capture OCR run: the live feed is replaced by the captured photo
   * (dimmed) and the laser sweeps the frame while the parent scans.
   * Capture hides; close stays so the user is never trapped.
   */
  scanning?: boolean;
  /** Captured photo shown frozen in the frame while `scanning`. */
  previewUri?: string | null;
  testID?: string;
}) {
  const language = useLanguage();
  const tr = dictionaryFor(language).transactions.receipt;
  const insets = useSafeAreaInsets();
  const { width: windowWidth } = useWindowDimensions();
  const cameraRef = useRef<CameraViewElement>(null);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [torch, setTorch] = useState(false);

  // Torch belongs to one open session: reset when the viewfinder closes,
  // whichever path closed it (button, system back, or scan completion).
  // Deferred like the caller's autoCamera so no setState runs synchronously
  // in an effect.
  const wasVisibleRef = useRef(visible);
  useEffect(() => {
    const wasVisible = wasVisibleRef.current;
    wasVisibleRef.current = visible;
    if (!wasVisible || visible) return;
    const timer = setTimeout(() => setTorch(false), 0);
    return () => clearTimeout(timer);
  });

  const frameWidth = Math.min(FRAME_W, windowWidth * 0.7);
  const frameHeight = frameWidth * (FRAME_H / FRAME_W);
  const reduceMotion = useReducedMotion();

  // Breathing corners live in `scan-corners`, loaded once at module scope:
  // reanimated crashes at import without the native bridge (Jest, Expo Go),
  // so a static twin renders there instead. Same pattern as expo-camera.
  const cornerStyles = useMemo(
    () => ({
      tl: styles.cornerTl,
      tr: styles.cornerTr,
      bl: styles.cornerBl,
      br: styles.cornerBr,
    }),
    [],
  );

  // Sweep driver: plain interval state, not Animated. The Animated loop
  // (native AND JS driver) provably never advances on this device family —
  // the laser sat frozen at translateY 0 across five timed screenshots —
  // while interval+setState demonstrably ticks here (the 15s record timer
  // counts on the same screen). Triangle wave over SWEEP_MS, ~15fps is
  // plenty for a 2px glow line during a ±5s scan.
  const [sweepT, setSweepT] = useState(0);
  useEffect(() => {
    if (!scanning || reduceMotion) return;
    const id = setInterval(() => {
      setSweepT((t) => t + SWEEP_STEP_MS);
    }, SWEEP_STEP_MS);
    return () => clearInterval(id);
  }, [reduceMotion, scanning]);
  const sweepPhase = (sweepT % SWEEP_MS) / (SWEEP_MS / 2);
  const sweepK = sweepPhase <= 1 ? sweepPhase : 2 - sweepPhase;
  const sweepY = sweepK * (frameHeight - SCAN_LASER_HEIGHT);

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
        {scanning && previewUri ? (
          <Image
            source={{ uri: previewUri }}
            style={styles.camera}
            resizeMode="cover"
          />
        ) : (
          <CameraViewComp
            ref={cameraRef}
            style={styles.camera}
            facing="back"
            enableTorch={torch}
            onCameraReady={() => setReady(true)}
          />
        )}
        <View style={styles.overlay} pointerEvents="box-none">
          <View
            style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}
            pointerEvents="box-none"
          >
            <Pressable
              testID="scan-torch"
              accessibilityRole="button"
              accessibilityLabel={tr.viewfinderTorchA11y}
              accessibilityState={{ selected: torch }}
              onPress={() => setTorch((current) => !current)}
              hitSlop={spacing.sm}
              style={({ pressed }) => [styles.topBtn, pressed && pressedFeedback]}
            >
              <MaterialIcons
                name={torch ? 'flashlight-on' : 'flashlight-off'}
                size={24}
                color={torch ? colors.accent : colors.textPrimary}
              />
            </Pressable>
            <Pressable
              testID="scan-close"
              accessibilityRole="button"
              accessibilityLabel={tr.viewfinderCloseA11y}
              onPress={onClose}
              hitSlop={spacing.sm}
              style={({ pressed }) => [styles.topBtn, pressed && pressedFeedback]}
            >
              <MaterialIcons name="close" size={24} color={colors.textPrimary} />
            </Pressable>
          </View>
          <View style={styles.scrimTop} />
          <View style={styles.middleRow} pointerEvents="box-none">
            <View style={styles.scrimSide} />
            <View
              testID="scan-frame"
              style={[styles.frame, { width: frameWidth, height: frameHeight }]}
            >
              {ScanCornersAnimated !== null ? (
                <ScanCornersAnimated
                  corner={cornerStyles}
                  glow={styles.cornerGlow}
                />
              ) : (
                <>
                  <View
                    testID="scan-corner"
                    style={[styles.cornerTl, styles.cornerGlow]}
                    pointerEvents="none"
                  />
                  <View
                    testID="scan-corner"
                    style={[styles.cornerTr, styles.cornerGlow]}
                    pointerEvents="none"
                  />
                  <View
                    testID="scan-corner"
                    style={[styles.cornerBl, styles.cornerGlow]}
                    pointerEvents="none"
                  />
                  <View
                    testID="scan-corner"
                    style={[styles.cornerBr, styles.cornerGlow]}
                    pointerEvents="none"
                  />
                </>
              )}
              {scanning ? (
                <View
                  testID="receipt-scanning"
                  style={styles.scanState}
                  pointerEvents="none"
                >
                  {!reduceMotion ? (
                    <View
                      testID="scan-laser"
                      style={[
                        styles.scanLaser,
                        { transform: [{ translateY: sweepY }] },
                      ]}
                      pointerEvents="none"
                    />
                  ) : (
                    // Reduce-motion: garis statis di tengah bingkai — tanpa
                    // ini perangkat reduce-motion tak pernah melihat laser
                    // sama sekali (cabang lama me-return null).
                    <View
                      testID="scan-laser"
                      style={styles.scanLaserStatic}
                      pointerEvents="none"
                    />
                  )}
                  <Text
                    testID="receipt-scan-state"
                    style={[typography.bodySm, styles.scanLabel]}
                  >
                    {tr.scanning}
                  </Text>
                </View>
              ) : (
                <View style={styles.hintCapsule}>
                  <Text style={[typography.bodySm, styles.hint]}>
                    {tr.viewfinderHint}
                  </Text>
                </View>
              )}
            </View>
            <View style={styles.scrimSide} />
          </View>
          <View
            style={[
              styles.scrimBottom,
              { paddingBottom: insets.bottom + spacing.lg },
            ]}
          >
            {scanning ? null : (
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
            )}
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
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    // Dark backdrop behind flash + close: only the frame hole stays bright.
    backgroundColor: colors.scrim,
  },
  topBtn: {
    width: layout.minTapTarget,
    height: layout.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
    backgroundColor: colors.scrim,
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
  /** Soft gold glow shared by all four brackets (elevation ≈ Android). */
  cornerGlow: {
    shadowColor: colors.scanBracket,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 4,
  },
  hintCapsule: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    backgroundColor: colors.scrimSoft,
    borderRadius: 16,
  },
  hint: {
    color: colors.textPrimary,
    textAlign: 'center',
  },
  scanState: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: spacing.md,
    backgroundColor: colors.scrim,
  },
  scanLaser: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: SCAN_LASER_HEIGHT,
    backgroundColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.8,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 0 },
  },
  scanLaserStatic: {
    position: 'absolute',
    top: '50%',
    left: 0,
    right: 0,
    height: SCAN_LASER_HEIGHT,
    marginTop: -SCAN_LASER_HEIGHT / 2,
    backgroundColor: colors.accent,
  },
  scanLabel: {
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
});
