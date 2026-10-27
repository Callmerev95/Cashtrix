/**
 * Dashboard outbox strip (OB3, issue #76).
 *
 * Sits below the fixed AppHeader, outside the History SectionList, so the
 * queue state stays visible while the user scrolls. It reports two honest
 * buckets: rows still waiting (including network retries) and rows the server
 * refused. A clean flush gets a short “sent” confirmation; there is no
 * discard-all button by design.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, View } from 'react-native';

import { GhostButton } from '@/components/button';
import { dictionaryFor, fill, useLanguage } from '@/i18n';
import { colors, radius, spacing, typography } from '@/theme';

export function OutboxStrip({
  waiting,
  failed,
  done,
  flushing,
  onSendNow,
  testID = 'outbox-strip',
}: {
  waiting: number;
  failed: number;
  /** Rows from the last clean pass; ignored while anything is still queued. */
  done: number;
  flushing: boolean;
  onSendNow: () => void;
  testID?: string;
}) {
  const language = useLanguage();
  const t = dictionaryFor(language).outbox;
  const showDone = waiting === 0 && failed === 0 && done > 0;

  if (!showDone && waiting === 0 && failed === 0) return null;

  const tone = showDone
    ? colors.income
    : failed > 0
      ? colors.budgetWarning
      : colors.accent;
  const icon = showDone
    ? 'cloud-done'
    : failed > 0
      ? 'warning-amber'
      : 'cloud-upload';

  const label = showDone
    ? fill(t.stripDone, { count: done })
    : waiting > 0 && failed > 0
      ? `${fill(t.stripWaiting, { count: waiting })} · ${fill(t.stripFailed, {
          count: failed,
        })}`
      : waiting > 0
        ? fill(t.stripWaiting, { count: waiting })
        : fill(t.stripFailed, { count: failed });

  return (
    <View
      testID={testID}
      accessibilityLiveRegion="polite"
      style={[
        styles.strip,
        failed > 0 && !showDone ? styles.stripFailed : null,
      ]}
    >
      <View style={styles.info}>
        <MaterialIcons name={icon} size={18} color={tone} />
        <Text
          testID={
            showDone
              ? 'outbox-done'
              : failed > 0
                ? 'outbox-failed-count'
                : undefined
          }
          style={[typography.bodySm, styles.label, { color: tone }]}
          numberOfLines={2}
        >
          {label}
        </Text>
      </View>
      {waiting > 0 ? (
        <GhostButton
          testID="outbox-send-now"
          label={flushing ? t.sending : t.sendNow}
          onPress={onSendNow}
          disabled={flushing}
          style={styles.send}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  strip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
    paddingLeft: spacing.md,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    backgroundColor: colors.surfaceCard,
  },
  stripFailed: {
    borderColor: colors.budgetWarning,
  },
  info: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  label: {
    flexShrink: 1,
  },
  send: {
    paddingHorizontal: spacing.sm,
  },
});
