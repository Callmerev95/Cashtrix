/**
 * Calendar month grid (V5) — the Add form's date picker.
 *
 * Plain `View`s only (same reasoning as the T6 donut / T7 ring: no native
 * date-picker module, so no dev-client rebuild). Monday-first `id-ID` weeks;
 * future days render dimmed and disabled, so the grid can never produce a
 * future date — the form's `isFutureDate` submit guard stays as defence in
 * depth for income/expense/transfer alike.
 *
 * The visible month follows `value` when it moves to another month (edit mode
 * loads its row asynchronously) without an effect: the render-adjust pattern
 * below only fires when the value's month actually changed, so month
 * navigation by the chevrons is never stomped.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, layout, radius, spacing, typography } from '@/theme';
import { pressedFeedback } from '@/components/pressed';
import { dictionaryFor, useLanguage } from '@/i18n';

import {
  buildMonthGrid,
  formatMonthLabel,
  toDateKey,
  weekdayLabels,
} from '../domain';

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

export function CalendarGrid({
  value,
  onChange,
  testID = 'date-calendar',
  framed = true,
  disablePast = false,
  disableFuture = true,
}: {
  value: Date;
  onChange: (next: Date) => void;
  testID?: string;
  /**
   * L4c polish: the custom-range sheet hosts two grids inside its own card,
   * so they render bare (no double chrome). Default `true` — the Add form
   * path is byte-identical.
   */
  framed?: boolean;
  /**
   * SV3: a target date may be today or later. Default `false` keeps the Add
   * form's existing today-or-earlier rule byte-identical.
   */
  disablePast?: boolean;
  /**
   * `false` opens future days too — the savings edit path must be able to
   * move a target forward as well as keep an old date. Default `true` keeps
   * every existing surface unchanged.
   */
  disableFuture?: boolean;
}) {
  const [visibleKey, setVisibleKey] = useState(() => monthKey(value));
  const [lastValueKey, setLastValueKey] = useState(() => monthKey(value));
  // C6: weekday/month copy + format follow the OS language (ADR-0008, R10).
  const language = useLanguage();
  const t = dictionaryFor(language);

  // Render-adjust (not an effect): follow `value` into another month after an
  // async edit-load, but leave chevron navigation alone while the value stays
  // in the visible month.
  const valueKey = monthKey(value);
  if (valueKey !== lastValueKey) {
    setLastValueKey(valueKey);
    setVisibleKey(valueKey);
  }

  const [visibleYear, visibleMonth] = visibleKey.split('-').map(Number);
  const visible = new Date(visibleYear, visibleMonth, 1);
  const weeks = buildMonthGrid(visible, value);

  function shiftMonth(delta: number) {
    const next = new Date(visibleYear, visibleMonth + delta, 1);
    setVisibleKey(monthKey(next));
  }

  return (
    <View testID={testID} style={framed ? styles.card : styles.bare}>
      <View style={styles.header}>
        <Pressable
          testID={`${testID}-prev`}
          accessibilityRole="button"
          accessibilityLabel={t.transactions.calendar.prev}
          onPress={() => shiftMonth(-1)}
          style={({ pressed }) => [styles.nav, pressed && pressedFeedback]}
        >
          <MaterialIcons
            name="chevron-left"
            size={22}
            color={colors.textPrimary}
          />
        </Pressable>
        <Text
          testID={`${testID}-title`}
          style={[typography.bodyMd, styles.title]}
        >
          {formatMonthLabel(visible, language)}
        </Text>
        <Pressable
          testID={`${testID}-next`}
          accessibilityRole="button"
          accessibilityLabel={t.transactions.calendar.next}
          onPress={() => shiftMonth(1)}
          style={({ pressed }) => [styles.nav, pressed && pressedFeedback]}
        >
          <MaterialIcons
            name="chevron-right"
            size={22}
            color={colors.textPrimary}
          />
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {weekdayLabels(language).map((label) => (
          <Text
            key={label}
            style={[typography.labelUppercase, styles.weekday]}
          >
            {label}
          </Text>
        ))}
      </View>

      {weeks.map((week, weekIndex) => (
        <View key={`week-${weekIndex}`} style={styles.weekRow}>
          {week.map((day) => {
            const key = toDateKey(day.date);
            const disabled =
              (disablePast && day.isPast) ||
              (disableFuture && day.isFuture);
            return (
              <Pressable
                key={key}
                testID={`${testID}-day-${key}`}
                accessibilityRole="button"
                accessibilityLabel={`${day.day}`}
                accessibilityState={{
                  selected: day.isSelected,
                  disabled,
                }}
                disabled={disabled}
                onPress={() => {
                  onChange(day.date);
                  if (monthKey(day.date) !== visibleKey) {
                    setVisibleKey(monthKey(day.date));
                  }
                }}
                style={({ pressed }) => [
                  styles.cell,
                  day.isSelected && styles.cellSelected,
                  day.isToday && !day.isSelected && styles.cellToday,
                  pressed && pressedFeedback,
                ]}
              >
                <Text
                  style={[
                    typography.bodyMd,
                    styles.day,
                    !day.inMonth && styles.dayOutside,
                    disabled && styles.dayDisabled,
                    day.isSelected && styles.daySelected,
                  ]}
                >
                  {day.day}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    borderRadius: radius.xl,
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    gap: spacing.sm,
  },
  bare: {
    gap: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  nav: {
    width: layout.minTapTarget,
    height: layout.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.textPrimary,
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekday: {
    flex: 1,
    textAlign: 'center',
    color: colors.textSecondary,
  },
  cell: {
    flex: 1,
    aspectRatio: 1,
    minHeight: layout.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  cellSelected: {
    backgroundColor: colors.accent,
  },
  cellToday: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.accent,
  },
  day: {
    color: colors.textPrimary,
  },
  dayOutside: {
    color: colors.textSecondary,
    opacity: 0.5,
  },
  dayDisabled: {
    color: colors.textSecondary,
    opacity: 0.35,
  },
  daySelected: {
    color: colors.background,
  },
});
