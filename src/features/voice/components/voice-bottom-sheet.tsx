import { useEffect, useMemo, useRef } from 'react';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { colors, radius, spacing } from '@/theme';

type VoiceBottomSheetProps = {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  testID?: string;
};

type SheetModule = {
  BottomSheetModal: React.ComponentType<Record<string, unknown>>;
  BottomSheetView: React.ComponentType<Record<string, unknown>>;
  BottomSheetModalProvider: React.ComponentType<{ children?: ReactNode }>;
  BottomSheetBackdrop: React.ComponentType<Record<string, unknown>>;
};

function loadSheetModule(): SheetModule | null {
  if (
    typeof process !== 'undefined' &&
    process.env &&
    process.env.JEST_WORKER_ID !== undefined
  ) {
    return null;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('@gorhom/bottom-sheet') as SheetModule;
  } catch {
    return null;
  }
}

/**
 * Premium 1-tap sheet shell: Gorhom `BottomSheetModal` + dimmed backdrop on
 * device, plain `View` fallback in Jest / pre-rebuild Expo Go so the
 * `voice-sheet` contract stays synchronous without the native bridge.
 */
export function VoiceBottomSheet({
  open,
  onClose,
  children,
  testID = 'voice-bottom-sheet',
}: VoiceBottomSheetProps) {
  const sheet = useMemo(() => loadSheetModule(), []);
  const modalRef = useRef<{ present(): void; dismiss(): void } | null>(null);
  const snapPoints = useMemo(() => ['55%', '85%'], []);

  useEffect(() => {
    if (open) modalRef.current?.present();
    else modalRef.current?.dismiss();
  }, [open]);

  if (!open) return null;

  if (!sheet) {
    return (
      <View testID={testID} style={fallbackStyles.sheet}>
        <View
          testID="voice-sheet-scrim"
          pointerEvents="none"
          style={fallbackStyles.scrim}
        />
        <View style={fallbackStyles.card}>{children}</View>
      </View>
    );
  }

  const {
    BottomSheetModal,
    BottomSheetView,
    BottomSheetModalProvider,
    BottomSheetBackdrop,
  } = sheet;

  return (
    <GestureHandlerRootView style={fallbackStyles.gestureRoot}>
      <BottomSheetModalProvider>
        <BottomSheetModal
          ref={modalRef}
          index={0}
          snapPoints={snapPoints}
          onDismiss={onClose}
          backgroundStyle={styles.background}
          handleIndicatorStyle={styles.handle}
          backdropComponent={(props: Record<string, unknown>) => (
            <BottomSheetBackdrop
              {...props}
              opacity={0.6}
              appearsOnIndex={0}
              disappearsOnIndex={-1}
              pressBehavior="close"
            />
          )}
        >
          <BottomSheetView style={styles.content}>
            <View testID={testID}>{children}</View>
          </BottomSheetView>
        </BottomSheetModal>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  background: {
    backgroundColor: colors.surfaceCard,
  },
  handle: {
    backgroundColor: colors.borderStrong,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.margin,
    paddingBottom: spacing.margin,
  },
});

const fallbackStyles = StyleSheet.create({
  gestureRoot: {
    flex: 1,
  },
  sheet: {
    marginTop: spacing.sm,
    gap: spacing.sm,
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
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceCard,
    padding: spacing.md,
    gap: spacing.sm,
  },
});
