/**
 * Placeholder scaffold screen. Each tab renders one of these until its
 * real feature ticket lands (T4–T8). It uses the canonical tokens so the
 * shell demonstrates the theme contract end to end.
 */
import { StyleSheet, Text, View } from 'react-native';

import { Screen } from './screen';
import { colors, radius, spacing, typography } from '@/theme';

export function ScaffoldScreen({
  kicker,
  title,
}: {
  kicker: string;
  title: string;
}) {
  return (
    <Screen style={styles.frame}>
      <View style={styles.header}>
        <Text style={[typography.labelUppercase, styles.kicker]}>{kicker}</Text>
        <Text style={[typography.headlineLg, styles.title]}>{title}</Text>
      </View>
      <View style={styles.card}>
        <Text style={[typography.bodyMd, styles.cardText]}>
          Layar ini belum diisi. Kerangka navigasi dan token desain sudah siap
          untuk ticket berikutnya.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  frame: {
    paddingTop: spacing.xl,
  },
  header: {
    gap: spacing.xs,
  },
  kicker: {
    color: colors.textSecondary,
  },
  title: {
    color: colors.textPrimary,
  },
  card: {
    marginTop: spacing.lg,
    padding: spacing.md,
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    borderRadius: radius.lg,
  },
  cardText: {
    color: colors.textSecondary,
  },
});
