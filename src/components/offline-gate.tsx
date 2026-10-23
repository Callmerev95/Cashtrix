/**
 * Offline gate (OB1, issue #74) — the honest replacement for a screen whose
 * numbers only exist in a server aggregate. Unlike `ErrorStateCard` there is
 * no retry: reconnection is the only fix, and offering a button that will
 * fail again would be theatre.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text } from 'react-native';

import { dictionaryFor, useLanguage } from '@/i18n';
import { colors, spacing, typography } from '@/theme';

import { Card } from './card';

export function OfflineGate({
  testID = 'offline-gate',
}: {
  testID?: string;
}) {
  const language = useLanguage();
  const copy = dictionaryFor(language).outbox;

  return (
    <Card testID={testID} style={styles.card}>
      <MaterialIcons
        name="cloud-off"
        size={28}
        color={colors.textSecondary}
      />
      <Text style={[typography.bodyMd, styles.title]}>{copy.gateTitle}</Text>
      <Text style={[typography.bodySm, styles.body]}>{copy.gateBody}</Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  title: {
    color: colors.textPrimary,
    textAlign: 'center',
  },
  body: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
});
