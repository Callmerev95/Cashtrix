/**
 * Add Transaction modal shell. The real form lands in T5; this placeholder
 * exists so the FAB route and modal presentation are wired and testable.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Screen } from '@/components';
import { colors, layout, radius, spacing, typography } from '@/theme';

export default function AddTransactionScreen() {
  const insets = useSafeAreaInsets();

  return (
    <Screen style={styles.frame}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.md }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tutup"
          onPress={() => router.back()}
          style={styles.close}
        >
          <MaterialIcons name="close" size={24} color={colors.textSecondary} />
        </Pressable>
        <Text style={[typography.headlineMd, styles.title]}>
          Add Transaction
        </Text>
      </View>
      <View style={styles.card}>
        <Text style={[typography.bodyMd, styles.cardText]}>
          Formulir transaksi hadir di ticket T5.
        </Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  frame: {
    paddingTop: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  close: {
    width: layout.minTapTarget,
    height: layout.minTapTarget,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: colors.textPrimary,
    flex: 1,
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
