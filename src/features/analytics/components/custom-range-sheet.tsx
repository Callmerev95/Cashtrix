/**
 * Custom range sheet (L4c) — pick-any-window for the Analytics screen.
 *
 * Core RN `Modal` shell (same reasoning as VoiceBottomSheet / QuickActionSheet:
 * no portal, no gesture, no native bridge beyond core). Two `CalendarGrid`
 * pickers (start + end) reuse the V5 date grid, so future days are
 * unpickable here too; the domain ({@link resolveCustomRange}) still clamps
 * and swaps defensively, so Apply can never produce an unusable range.
 */
import { useState } from 'react';
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { colors, layout, radius, spacing, typography } from '@/theme';
import { pressedFeedback } from '@/components/pressed';
import { useSheetDrag } from '@/components/sheet-drag';
import { dictionaryFor, fill, useLanguage } from '@/i18n';
import { localeTagFor } from '@/i18n/dictionaries';
// Deep imports (not the transactions barrel): the barrel pulls
// transactions-context → receipts → back into the barrel, a cycle that
// explodes to partial exports when first reached through this sheet
// (wallet-options-refresh red, Oct 2026). The domain precedent is the same.
import { CalendarGrid } from '@/features/transactions/components/calendar-grid';
import { toDateKey } from '@/features/transactions/domain';

import { formatCustomLabel, type CustomRange } from '../domain';

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dateFromKey(key: string): Date {
  const year = Number(key.slice(0, 4));
  const month = Number(key.slice(5, 7));
  const day = Number(key.slice(8, 10));
  return new Date(year, month - 1, day);
}

function defaultEnd(): Date {
  return startOfDay(new Date());
}

function defaultStart(): Date {
  const end = defaultEnd();
  return new Date(end.getFullYear(), end.getMonth(), end.getDate() - 29);
}

export function CustomRangeSheet({
  open,
  initial,
  onClose,
  onApply,
  testID = 'custom-range-sheet',
}: {
  open: boolean;
  initial: CustomRange | null;
  onClose: () => void;
  onApply: (custom: CustomRange) => void;
  testID?: string;
}) {
  const language = useLanguage();
  const t = dictionaryFor(language).analytics.customSheet;
  const cancelLabel = dictionaryFor(language).common.cancel;

  const [start, setStart] = useState<Date>(() =>
    initial ? dateFromKey(initial.startKey) : defaultStart(),
  );
  const [end, setEnd] = useState<Date>(() =>
    initial ? dateFromKey(initial.endKey) : defaultEnd(),
  );
  // Which grid was touched last — its header well carries the accent.
  const [lastTouched, setLastTouched] = useState<'start' | 'end'>('start');
  // Drag-to-close (owner device finding, Oct 2026): the house `useSheetDrag`
  // hook, wired handle-strip-only like VoiceBottomSheet — the ScrollView
  // content is never touched, so scrolling and dragging never fight. No
  // `reset()` needed: this sheet unmounts on close (fresh mount per open),
  // unlike the persistently-mounted voice sheet.
  const {
    dragY,
    closing,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
  } = useSheetDrag(onClose);
  // Closed renders nothing (house pattern, same as VoiceSheet): every open
  // is a fresh mount, so reopening always restarts from `initial` (or the
  // trailing-30-days default) with no reset bookkeeping.
  if (!open) return null;

  // Live summary (ordered like the domain does, so the line always reads
  // true even mid-pick): one source of truth above the grids.
  const startKey = toDateKey(start);
  const endKey = toDateKey(end);
  const [firstKey, lastKey] =
    startKey <= endKey ? [startKey, endKey] : [endKey, startKey];
  const dayCount =
    Math.round(
      (dateFromKey(lastKey).getTime() - dateFromKey(firstKey).getTime()) /
        (24 * 60 * 60 * 1000),
    ) + 1;
  const summary = `${formatCustomLabel(
    { startKey: firstKey, endKey: lastKey },
    language,
  )} · ${fill(t.days, { count: dayCount })}`;
  const dayMonth = new Intl.DateTimeFormat(localeTagFor(language), {
    day: 'numeric',
    month: 'short',
  });

  function pickStart(next: Date) {
    setStart(next);
    setLastTouched('start');
  }

  function pickEnd(next: Date) {
    setEnd(next);
    setLastTouched('end');
  }

  return (
    <Modal
      visible={open}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View testID={testID} style={styles.overlay}>
        <Pressable
          testID={`${testID}-scrim`}
          accessibilityRole="button"
          accessibilityLabel={cancelLabel}
          onPress={onClose}
          style={styles.scrim}
        />
        <Animated.View
          testID={`${testID}-card`}
          style={[styles.card, { transform: [{ translateY: dragY }] }]}
          pointerEvents={closing ? 'none' : 'auto'}
        >
          <View
            testID={`${testID}-handle`}
            style={styles.handleHit}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchCancel}
          >
            <View style={styles.handle} />
          </View>
          <Text style={[typography.headlineSm, styles.title]}>{t.title}</Text>
          <Text
            testID={`${testID}-summary`}
            style={[typography.bodyMd, styles.summary]}
          >
            {summary}
          </Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View
              testID={`${testID}-start-header`}
              style={[
                styles.stepWell,
                lastTouched === 'start'
                  ? styles.stepWellActive
                  : styles.stepWellIdle,
              ]}
            >
              <Text style={[typography.labelUppercase, styles.kicker]}>
                {t.startTitle}
              </Text>
              <Text style={[typography.bodySm, styles.stepValue]}>
                {dayMonth.format(start)}
              </Text>
            </View>
            <CalendarGrid
              testID="custom-range-start"
              value={start}
              onChange={pickStart}
              framed={false}
            />
            <View style={styles.divider} />
            <View
              testID={`${testID}-end-header`}
              style={[
                styles.stepWell,
                lastTouched === 'end'
                  ? styles.stepWellActive
                  : styles.stepWellIdle,
              ]}
            >
              <Text style={[typography.labelUppercase, styles.kicker]}>
                {t.endTitle}
              </Text>
              <Text style={[typography.bodySm, styles.stepValue]}>
                {dayMonth.format(end)}
              </Text>
            </View>
            <CalendarGrid
              testID="custom-range-end"
              value={end}
              onChange={pickEnd}
              framed={false}
            />
          </ScrollView>
          <View style={styles.actions}>
            <Pressable
              testID="custom-range-cancel"
              accessibilityRole="button"
              accessibilityLabel={cancelLabel}
              onPress={onClose}
              hitSlop={spacing.sm}
              style={({ pressed }) => [
                styles.action,
                pressed && pressedFeedback,
              ]}
            >
              <Text style={[typography.bodyMd, styles.cancelLabel]}>
                {cancelLabel}
              </Text>
            </Pressable>
            <Pressable
              testID="custom-range-apply"
              accessibilityRole="button"
              accessibilityLabel={t.apply}
              onPress={() =>
                onApply({ startKey: toDateKey(start), endKey: toDateKey(end) })
              }
              hitSlop={spacing.sm}
              style={({ pressed }) => [
                styles.action,
                styles.apply,
                pressed && pressedFeedback,
              ]}
            >
              <Text style={[typography.bodyMd, styles.applyLabel]}>
                {t.apply}
              </Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: colors.scrim,
  },
  scrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    maxHeight: '86%',
    gap: spacing.md,
    padding: spacing.md,
    backgroundColor: colors.surfaceCard,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  handleHit: {
    alignItems: 'center',
    paddingVertical: spacing.xs,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radius.full,
    backgroundColor: colors.borderStrong,
  },
  title: {
    color: colors.textPrimary,
  },
  summary: {
    color: colors.accent,
  },
  stepWell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: StyleSheet.hairlineWidth,
  },
  stepWellActive: {
    borderColor: colors.accent,
  },
  stepWellIdle: {
    borderColor: colors.border,
  },
  kicker: {
    color: colors.textSecondary,
  },
  stepValue: {
    color: colors.textPrimary,
  },
  divider: {
    marginVertical: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  action: {
    flex: 1,
    minHeight: layout.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  cancelLabel: {
    color: colors.textSecondary,
  },
  apply: {
    backgroundColor: colors.accent,
  },
  applyLabel: {
    color: colors.textOnAccent,
  },
});
