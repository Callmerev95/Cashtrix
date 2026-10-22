/**
 * Savings status pill (SV3 polish, 21 Okt 2026) — the status must read as a
 * status, not as the tail of the kicker ("TARGET TABUNGAN AKTIF" under a
 * shared uppercase style read as one phrase on device).
 *
 * Mirrors the `Terverifikasi` pill in `AiPrefillBanner`: elevated surface,
 * full radius, dot + sentence-case label. Label and dot carry the status
 * tone; `active` stays neutral because nothing is wrong. Shared by both
 * savings cards so the two never drift.
 */
import {
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';

import type { SavingsStatus } from '../domain';

export const SAVINGS_STATUS_COLOR: Record<SavingsStatus, string> = {
  active: colors.textSecondary,
  achieved: colors.accent,
  overdue: colors.budgetWarning,
};

export function SavingsStatusPill({
  status,
  label,
  testID,
  style,
}: {
  status: SavingsStatus;
  label: string;
  testID?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const tone = SAVINGS_STATUS_COLOR[status];
  return (
    <View testID={testID} style={[styles.pill, style]}>
      <View style={[styles.dot, { backgroundColor: tone }]} />
      <Text style={[typography.bodySm, { color: tone }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs / 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs / 2,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
  },
});
