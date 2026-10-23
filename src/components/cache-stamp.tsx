/**
 * Read-cache provenance (OB1, issue #74). A cached feed is still useful, but
 * it must never look live: the timestamp says when the device last saw the
 * server. Hidden when the feed was freshly read.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, View } from 'react-native';

import { dictionaryFor, fill, useLanguage } from '@/i18n';
import { formatTime } from '@/features/transactions/domain';
import { colors, spacing, typography } from '@/theme';

export function CacheStamp({
  fetchedAt,
  testID = 'cache-stamp',
}: {
  fetchedAt: string | null;
  testID?: string;
}) {
  const language = useLanguage();
  if (!fetchedAt) return null;

  return (
    <View style={styles.row} testID={testID}>
      <MaterialIcons name="history" size={12} color={colors.textSecondary} />
      <Text style={[typography.bodySm, styles.label]}>
        {fill(dictionaryFor(language).outbox.cacheStamp, {
          time: formatTime(fetchedAt),
        })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  label: {
    color: colors.textSecondary,
  },
});
