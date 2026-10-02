/**
 * Auth divider — lowercase "atau"/"or" flanked by 1px hairlines, per the
 * approved Stitch reference (`stitch_cashtrix/login.png`, `daftar.png`).
 */
import { StyleSheet, Text, View } from 'react-native';

import { colors, spacing, typography } from '@/theme';

export function OrDivider({ label }: { label: string }) {
  return (
    <View style={styles.row}>
      <View style={styles.line} />
      <Text style={styles.label}>{label}</Text>
      <View style={styles.line} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  line: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: colors.border,
  },
  label: {
    ...typography.bodySm,
    color: colors.textSecondary,
  },
});
