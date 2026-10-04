/**
 * Scan review (Plan B): lazy split-screen modal inside `add-transaction`.
 *
 * Top half = receipt preview (`resizeMode: 'contain'`, match-with-eyes).
 * Bottom half = `ScrollView` of the landed Gemini values (merchant, amount,
 * date, category) in read-only rows; fields filled by AI carry the gold
 * pastel `aiFilledSurface` + border + a `bolt` MaterialIcon (never emoji).
 * Not a route — no router regen, static contract untouched.
 */
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AiPrefillBanner } from '@/components';
import { dictionaryFor, useLanguage } from '@/i18n';
import { colors, layout, radius, spacing, typography } from '@/theme';
import { pressedFeedback } from '@/components/pressed';
import type { ScanPrefill } from '../scan';

export function ScanReview({
  visible,
  prefill,
  previewUri,
  categoryName,
  onContinue,
  onRetake,
  testID = 'scan-review',
}: {
  visible: boolean;
  prefill: ScanPrefill | null;
  previewUri: string;
  categoryName: string | null;
  onContinue: () => void;
  onRetake: () => void;
  testID?: string;
}) {
  const language = useLanguage();
  const tr = dictionaryFor(language).transactions.receipt;
  const insets = useSafeAreaInsets();

  if (!visible || !prefill) return null;

  return (
    <Modal
      testID={testID}
      visible={visible}
      animationType="slide"
      onRequestClose={onContinue}
    >
      <View style={styles.root}>
        <View style={styles.top}>
          <Image
            testID="scan-review-image"
            accessibilityRole="image"
            accessibilityLabel={tr.reviewImageA11y}
            source={{ uri: previewUri }}
            style={styles.image}
            resizeMode="contain"
          />
        </View>
        <ScrollView
          testID="scan-review-form"
          style={styles.bottom}
          contentContainerStyle={[
            styles.form,
            { paddingBottom: insets.bottom + spacing.lg },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={[typography.headlineSm, styles.title]}>
            {tr.reviewTitle}
          </Text>
          <AiPrefillBanner>
            <Text style={[typography.bodySm, styles.bannerNote]}>
              {tr.scanApplied}
            </Text>
          </AiPrefillBanner>
          <AiField
            testID="ai-filled-merchant"
            label={tr.reviewMerchant}
            value={prefill.merchant ?? '—'}
            a11y={tr.reviewAiA11y}
          />
          <AiField
            testID="ai-filled-amount"
            label={tr.reviewAmount}
            value={String(prefill.amount)}
            a11y={tr.reviewAiA11y}
          />
          <AiField
            testID="ai-filled-category"
            label={tr.reviewCategory}
            value={categoryName ?? prefill.categorySuggestion ?? '—'}
            a11y={tr.reviewAiA11y}
          />
          <View style={styles.actions}>
            <Pressable
              testID="scan-review-retake"
              accessibilityRole="button"
              accessibilityLabel={tr.reviewRetakeA11y}
              onPress={onRetake}
              style={({ pressed }) => [
                styles.retake,
                pressed && pressedFeedback,
              ]}
            >
              <MaterialIcons
                name="photo-camera"
                size={18}
                color={colors.accent}
              />
              <Text style={[typography.bodyMd, styles.retakeLabel]}>
                {tr.scanRetake}
              </Text>
            </Pressable>
            <Pressable
              testID="scan-review-continue"
              accessibilityRole="button"
              accessibilityLabel={tr.reviewContinue}
              onPress={onContinue}
              style={({ pressed }) => [
                styles.continue,
                pressed && pressedFeedback,
              ]}
            >
              <Text style={[typography.bodyMd, styles.continueLabel]}>
                {tr.reviewContinue}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

function AiField({
  testID,
  label,
  value,
  a11y,
}: {
  testID: string;
  label: string;
  value: string;
  a11y: string;
}) {
  return (
    <View
      testID={testID}
      accessibilityLabel={`${label}: ${value}. ${a11y}`}
      style={styles.field}
    >
      <Text style={[typography.bodySm, styles.fieldLabel]}>{label}</Text>
      <View style={styles.fieldRow}>
        <Text style={[typography.bodyMd, styles.fieldValue]}>{value}</Text>
        <MaterialIcons name="bolt" size={16} color={colors.accent} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  top: {
    flex: 1,
    backgroundColor: colors.background,
  },
  image: {
    flex: 1,
    width: '100%',
  },
  bottom: {
    flex: 1,
    backgroundColor: colors.surfaceCard,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
  },
  form: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    color: colors.textPrimary,
  },
  bannerNote: {
    color: colors.textSecondary,
  },
  field: {
    padding: spacing.md,
    gap: spacing.xs / 2,
    borderRadius: radius.md,
    backgroundColor: colors.aiFilledSurface,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.aiFilledBorder,
  },
  fieldLabel: {
    color: colors.textSecondary,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  fieldValue: {
    flex: 1,
    color: colors.textPrimary,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  retake: {
    flex: 1,
    minHeight: layout.minTapTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
  },
  retakeLabel: {
    color: colors.accent,
  },
  continue: {
    flex: 1,
    minHeight: layout.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.accent,
  },
  continueLabel: {
    color: colors.textOnAccent,
  },
});
