/**
 * Receipt photo attachment (S2, ADR-0009).
 *
 * Thumbnails + an attach button for the Add form. The picker and upload live
 * here; the attachment list itself is owned by the form (it needs the ids at
 * save time to link them). Uploads happen the moment a photo is taken (Opsi
 * A) — the form never waits for them at save.
 *
 * `expo-image-picker` only (no `expo-camera`, no rebuild). When `autoOpen`
 * (the `?scan=1` contract from S1), the source sheet starts open — derived
 * as initial state, never synced by an effect.
 */
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
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

import { dictionaryFor, fill, useLanguage } from '@/i18n';
import { colors, layout, radius, spacing, typography } from '@/theme';

import {
  deleteReceiptAttachment,
  uploadReceiptPhoto,
  type ReceiptAttachment,
} from '../api';

export type { ReceiptAttachment };

export function ReceiptAttachmentSection({
  attachments,
  onAttachmentsChange,
  userId,
  autoOpen = false,
  testID = 'receipt-section',
}: {
  attachments: ReceiptAttachment[];
  onAttachmentsChange: (next: ReceiptAttachment[]) => void;
  userId: string;
  autoOpen?: boolean;
  testID?: string;
}) {
  const language = useLanguage();
  const t = dictionaryFor(language).transactions.receipt;
  const commonCancel = dictionaryFor(language).common.cancel;

  const [sheetVisible, setSheetVisible] = useState(autoOpen);
  const [uploading, setUploading] = useState(false);

  async function addPhoto(source: 'camera' | 'gallery') {
    setSheetVisible(false);
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

    setUploading(true);
    try {
      const attachment = await uploadReceiptPhoto({
        userId,
        sourceUri: asset.uri,
        mime: asset.mimeType ?? null,
        lang: language,
      });
      onAttachmentsChange([...attachments, attachment]);
    } catch (cause) {
      Alert.alert(
        t.uploadFail,
        cause instanceof Error
          ? cause.message
          : dictionaryFor(language).common.retry,
      );
    } finally {
      setUploading(false);
    }
  }

  async function removePhoto(attachment: ReceiptAttachment) {
    // Optimistic: the row is dropped from the form instantly; a failed
    // server delete restores it so the save can still link it.
    onAttachmentsChange(
      attachments.filter((item) => item.id !== attachment.id),
    );
    try {
      await deleteReceiptAttachment({
        userId,
        id: attachment.id,
        storagePath: attachment.storagePath,
      });
    } catch (cause) {
      onAttachmentsChange([...attachments]);
      Alert.alert(
        t.uploadFail,
        cause instanceof Error
          ? cause.message
          : dictionaryFor(language).common.retry,
      );
    }
  }

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
            <Pressable
              testID={`receipt-remove-${attachment.id}`}
              accessibilityRole="button"
              accessibilityLabel={t.removeA11y}
              onPress={() => void removePhoto(attachment)}
              style={styles.remove}
            >
              <MaterialIcons name="close" size={16} color={colors.textOnAccent} />
            </Pressable>
          </View>
        ))}
        <Pressable
          testID="receipt-attach"
          accessibilityRole="button"
          accessibilityLabel={t.attachA11y}
          onPress={() => setSheetVisible(true)}
          style={styles.attach}
        >
          {uploading ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <MaterialIcons
              name="add-a-photo"
              size={24}
              color={colors.accent}
            />
          )}
          <Text style={[typography.bodySm, styles.attachLabel]}>
            {t.attach}
          </Text>
        </Pressable>
      </View>
      <Text style={[typography.bodySm, styles.note]}>{t.retentionNote}</Text>

      <Modal
        testID="receipt-sheet"
        visible={sheetVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSheetVisible(false)}
      >
        <Pressable
          testID="receipt-sheet-backdrop"
          accessibilityRole="button"
          accessibilityLabel={commonCancel}
          onPress={() => setSheetVisible(false)}
          style={styles.backdrop}
        >
          <View style={styles.sheet}>
            <Pressable
              testID="receipt-option-camera"
              accessibilityRole="button"
              accessibilityLabel={t.camera}
              onPress={() => void addPhoto('camera')}
              style={styles.option}
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
              style={styles.option}
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
    </View>
  );
}

const THUMB = 72;

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
  attach: {
    width: THUMB,
    height: THUMB,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs / 2,
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderStyle: 'dashed',
    minHeight: layout.minTapTarget,
  },
  attachLabel: {
    color: colors.accent,
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
