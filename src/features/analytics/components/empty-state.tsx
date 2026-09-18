/**
 * Analytics empty state (AC #7): a range with no transactions must show this,
 * never a chart full of NaN/Infinity. Kept deliberately quiet — it is a
 * resting state, not an error.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';

export function AnalyticsEmptyState({
  testID = 'analytics-empty',
}: {
  testID?: string;
}) {
  return (
    <View testID={testID} style={styles.card}>
      <View style={styles.iconWell}>
        <MaterialIcons name="insights" size={28} color={colors.accent} />
      </View>
      <Text style={[typography.headlineSm, styles.title]}>
        Belum ada data
      </Text>
      <Text style={[typography.bodyMd, styles.body]}>
        Tidak ada transaksi pada rentang ini. Coba rentang lain atau catat
        transaksi baru.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  iconWell: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  title: {
    color: colors.textPrimary,
  },
  body: {
    textAlign: 'center',
    color: colors.textSecondary,
  },
});
