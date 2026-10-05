/**
 * Receipt photo attachment (S2, ADR-0009; scan UX S3).
 *
 * Thumbnails + an attach button for the Add form. The picker and upload live
 * here; the attachment list itself is owned by the form (it needs the ids at
 * save time to link them). Uploads happen the moment a photo is taken (Opsi
 * A): the form never waits for them at save.
 *
 * `expo-image-picker` only (no `expo-camera`, no rebuild). The source sheet
 * is parent-controlled (`sheetVisible`); `autoCamera` (the `?scan=1` contract
 * from S1) fires the camera once on mount instead of opening the sheet:
 * scan sessions go straight to capture, QRIS-style. `onPhotoUploaded` lets
 * the parent auto-scan each new photo (event-driven, never an effect).
 */
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { dictionaryFor, fill, useLanguage } from '@/i18n';
import { colors, layout, radius, spacing, typography } from '@/theme';
import { pressedFeedback } from '@/components/pressed';

import {
  deleteReceiptAttachment,
  uploadReceiptPhoto,
  type ReceiptAttachment,
} from '../api';
import { ScanViewfinder, isScanViewfinderAvailable } from './scan-viewfinder';

export type { ReceiptAttachment };

export function ReceiptAttachmentSection({
  attachments,
  onAttachmentsChange,
  userId,
  sheetVisible,
  onSheetVisibleChange,
  autoCamera = false,
  captureRequest = 0,
  scanning = false,
  onPhotoUploaded,
  onUploadError,
  testID = 'receipt-section',
}: {
  attachments: ReceiptAttachment[];
  onAttachmentsChange: (next: ReceiptAttachment[]) => void;
  userId: string;
  sheetVisible: boolean;
  onSheetVisibleChange: (visible: boolean) => void;
  autoCamera?: boolean;
  /** Increment to shoot straight to the camera (failure "Foto ulang"). */
  captureRequest?: number;
  /** Parent-owned OCR run: the tile shows the working state. */
  scanning?: boolean;
  onPhotoUploaded?: (attachment: ReceiptAttachment) => void;
  /**
   * Upload/delete failures: reported to the parent (failure package) instead
   * of an Alert. The raw error is swallowed (it carries a userId storage
   * path, so it must reach neither UI nor logs. The OS-permission denial
   * keeps its own Alert (it directs to Settings).
   */
  onUploadError?: () => void;
  testID?: string;
}) {
  const language = useLanguage();
  const insets = useSafeAreaInsets();
  const t = dictionaryFor(language).transactions.receipt;
  const commonCancel = dictionaryFor(language).common.cancel;

  const [uploading, setUploading] = useState(false);
  const [viewfinderVisible, setViewfinderVisible] = useState(false);
  // Captured photo shown frozen in the viewfinder while the parent scans;
  // the scan feedback lives on the camera overlay, not in a card below.
  const [capturedUri, setCapturedUri] = useState<string | null>(null);
  const autoCameraFired = useRef(false);
  const wasScanningRef = useRef(false);

  // Viewfinder closes when the parent scan settles (captured photo scanned).
  // Deferred past the effect body so no setState runs synchronously in an
  // effect — the same pattern as autoCamera below.
  useEffect(() => {
    const wasScanning = wasScanningRef.current;
    wasScanningRef.current = scanning;
    if (capturedUri === null || !wasScanning || scanning) return;
    const timer = setTimeout(() => {
      setCapturedUri(null);
      setViewfinderVisible(false);
    }, 0);
    return () => clearTimeout(timer);
  });

  async function uploadUri(uri: string, mime: string | null) {
    if (!userId || uploading) return;
    setUploading(true);
    try {
      const attachment = await uploadReceiptPhoto({
        userId,
        sourceUri: uri,
        mime,
        lang: language,
      });
      onAttachmentsChange([...attachments, attachment]);
      onPhotoUploaded?.(attachment);
    } catch {
      // Friendly copy + Foto ulang / Isi manual live in the parent (failure
      // package); the raw error stays here (see `onUploadError` contract).
      onUploadError?.();
    } finally {
      setUploading(false);
    }
  }

  function openCamera() {
    onSheetVisibleChange(false);
    if (!userId || uploading) return;
    if (isScanViewfinderAvailable()) {
      setViewfinderVisible(true);
      return;
    }
    void addPhoto('camera');
  }

  async function handleViewfinderCaptured(uri: string) {
    // Stay open: the viewfinder shows the frozen capture + laser while the
    // parent scans; it closes when the run settles (effect below).
    setCapturedUri(uri);
    await uploadUri(uri, null);
  }

  async function addPhoto(source: 'camera' | 'gallery') {
    onSheetVisibleChange(false);
    if (!userId || uploading) return;

    const permission =
      source === 'camera'
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(t.permissionTitle, t.permissionBody);
      return;
    }

    const picked =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({ quality: 0.9 })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            quality: 0.9,
          });
    if (picked.canceled) return;
    const asset = picked.assets[0];
    if (!asset) return;

    await uploadUri(asset.uri, asset.mimeType ?? null);
  }

  async function removePhoto(attachment: ReceiptAttachment) {
    // Optimistic: the row is dropped from the form instantly; a failed
    // server delete restores it so the save can still link it.
    onAttachmentsChange(
      attachments.filter((item) => item.id !== attachment.id),
    );    try {
      await deleteReceiptAttachment({
        userId,
        id: attachment.id,
        storagePath: attachment.storagePath,
      });
    } catch {
      onAttachmentsChange([...attachments]);
      onUploadError?.();
    }
  }

  // Scan sessions open the camera once on mount (not the sheet). Deferred
  // past the effect body so no setState runs synchronously in an effect;
  // the ref guard keeps StrictMode/remounts from double-firing. Mount-only
  // by contract (the session exists before the form paints: auth gate).
  // Placed after `addPhoto` so the static TDZ check sees the declaration.
  useEffect(() => {
    if (!autoCamera || autoCameraFired.current) return;
    autoCameraFired.current = true;
    const timer = setTimeout(() => {
      if (!userId) {
        onSheetVisibleChange(true);
        return;
      }
      openCamera();
    }, 0);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // "Foto ulang" (S3 failure package): each increment re-shoots the camera.
  // Same deferred pattern as autoCamera above: no sync setState in effect.
  const lastCaptureRequest = useRef(0);
  useEffect(() => {
    if (captureRequest === 0 || captureRequest === lastCaptureRequest.current) {
      return;
    }
    lastCaptureRequest.current = captureRequest;
    const timer = setTimeout(() => {
      openCamera();
    }, 0);
    return () => clearTimeout(timer);
  });

  return (
    <View testID={testID}>
      <View style={styles.row}>
        {attachments.map((attachment, index) => (
          <View
            key={attachment.id}
            testID={`receipt-thumb-${attachment.id}`}
            accessibilityRole="image"
            accessibilityLabel={fill(t.thumbnailA11y, {
              index: index + 1,
            })}
            style={styles.thumb}
          >
            <Image
              source={{ uri: attachment.previewUrl }}
              style={styles.image}
            />
            <View style={styles.cornerTl} pointerEvents="none" />
            <View style={styles.cornerTr} pointerEvents="none" />
            <View style={styles.cornerBl} pointerEvents="none" />
            <View style={styles.cornerBr} pointerEvents="none" />
            <Pressable
              testID={`receipt-remove-${attachment.id}`}
              accessibilityRole="button"
              accessibilityLabel={t.removeA11y}
              onPress={() => void removePhoto(attachment)}
              hitSlop={spacing.sm}
              style={({ pressed }) => [
                styles.remove,
                pressed && pressedFeedback,
              ]}
            >
              <MaterialIcons name="close" size={16} color={colors.textOnAccent} />
            </Pressable>
          </View>
        ))}
        <Pressable
          testID="receipt-attach"
          accessibilityRole="button"
          accessibilityLabel={t.attachA11y}
          onPress={() => onSheetVisibleChange(true)}
          style={({ pressed }) => [
            styles.attachRow,
            pressed && pressedFeedback,
          ]}
        >
          {uploading ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <MaterialIcons
              name="add-a-photo"
              size={20}
              color={colors.accent}
            />
          )}
          <Text style={[typography.bodyMd, styles.attachLabel]}>
            {t.attach}
          </Text>
          {attachments.length > 0 ? (
            <View style={styles.attachCount}>
              <Text style={[typography.bodySm, styles.attachCountLabel]}>
                {attachments.length}
              </Text>
            </View>
          ) : null}
          <MaterialIcons
            name="chevron-right"
            size={20}
            color={colors.textSecondary}
          />
        </Pressable>
      </View>
      {/* Slim gallery progress only: camera captures scan inside the
      viewfinder overlay, so the big card below is gone. testIDs stay for
      the static contract. */}
      {scanning && capturedUri === null ? (
        <View testID="receipt-scanning" style={styles.scanningSlim}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text
            testID="receipt-scan-state"
            style={[typography.bodySm, styles.scanningLabel]}
          >
            {t.scanning}
          </Text>
        </View>
      ) : null}
      <Text style={[typography.bodySm, styles.note]}>{t.retentionNote}</Text>

      <Modal
        testID="receipt-sheet"
        visible={sheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => onSheetVisibleChange(false)}
      >
        <Pressable
          testID="receipt-sheet-backdrop"
          accessibilityRole="button"
          accessibilityLabel={commonCancel}
          onPress={() => onSheetVisibleChange(false)}
          style={styles.backdrop}
        >
          <View
            style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}
          >
            <Pressable
              testID="receipt-option-camera"
              accessibilityRole="button"
              accessibilityLabel={t.camera}
              onPress={openCamera}
              style={({ pressed }) => [
                styles.option,
                pressed && pressedFeedback,
              ]}
            >
              <MaterialIcons
                name="photo-camera"
                size={20}
                color={colors.textPrimary}
              />
              <Text style={[typography.bodyMd, styles.optionLabel]}>
                {t.camera}
              </Text>
            </Pressable>
            <Pressable
              testID="receipt-option-gallery"
              accessibilityRole="button"
              accessibilityLabel={t.gallery}
              onPress={() => void addPhoto('gallery')}
              style={({ pressed }) => [
                styles.option,
                pressed && pressedFeedback,
              ]}
            >
              <MaterialIcons
                name="photo-library"
                size={20}
                color={colors.textPrimary}
              />
              <Text style={[typography.bodyMd, styles.optionLabel]}>
                {t.gallery}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
      <ScanViewfinder
        visible={viewfinderVisible}
        scanning={scanning}
        previewUri={capturedUri}
        onClose={() => setViewfinderVisible(false)}
        onCaptured={(uri) => void handleViewfinderCaptured(uri)}
      />
    </View>
  );
}

const THUMB = 72;
/** Gold viewfinder corner length (Stitch: 7px-scale corners). */
const CORNER = 14;

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  image: {
    width: THUMB,
    height: THUMB,
  },
  cornerTl: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: CORNER,
    height: CORNER,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderColor: colors.accent,
  },
  cornerTr: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: CORNER,
    height: CORNER,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderColor: colors.accent,
  },
  cornerBl: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    width: CORNER,
    height: CORNER,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderColor: colors.accent,
  },
  cornerBr: {
    position: 'absolute',
    bottom: 4,
    right: 4,
    width: CORNER,
    height: CORNER,
    borderBottomWidth: 2,
    borderRightWidth: 2,
    borderColor: colors.accent,
  },
  remove: {
    position: 'absolute',
    top: spacing.xs / 2,
    right: spacing.xs / 2,
    width: 24,
    height: 24,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.textSecondary,
  },
  attachRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: layout.minTapTarget + 4,
    paddingVertical: spacing.xs,
  },
  attachCount: {
    minWidth: 22,
    height: 22,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs / 2,
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent,
  },
  attachCountLabel: {
    color: colors.accent,
  },
  attachLabel: {
    color: colors.accent,
  },
  scanningSlim: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  scanningLabel: {
    color: colors.textSecondary,
  },
  note: {
    marginTop: spacing.sm,
    color: colors.textSecondary,
  },
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: colors.scrim,
  },
  sheet: {
    width: '100%',
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: colors.surfaceCard,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  option: {
    minHeight: layout.minTapTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  optionLabel: {
    color: colors.textPrimary,
  },
});
