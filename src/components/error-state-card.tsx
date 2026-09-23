/**
 * Error state card (D4) — the uniform "gagal sync" surface: the raw message
 * plus a gold "Coba lagi" that re-runs the screen's refresh. Replaces the
 * bare error texts on Analytics/Budgets/Search/Notifications and the empty
 * Dashboard sections when their reads fail.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text } from 'react-native';

import { colors, spacing, typography } from '@/theme';

import { GhostButton } from './button';
import { Card } from './card';

export function ErrorStateCard({
  message,
  onRetry,
  testID,
}: {
  message: string;
  onRetry: () => void;
  testID?: string;
}) {
  return (
    <Card testID={testID} style={styles.card}>
      <MaterialIcons
        name="cloud-off"
        size={28}
        color={colors.textSecondary}
      />
      <Text style={[typography.bodyMd, styles.message]}>{message}</Text>
      <GhostButton
        label="Coba lagi"
        onPress={onRetry}
        testID={testID ? `${testID}-retry` : undefined}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  message: {
    textAlign: 'center',
    color: colors.textSecondary,
  },
});
