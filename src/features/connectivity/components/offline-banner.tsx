/**
 * Offline banner (D4) — a thin in-flow strip above the tab content, never an
 * overlay (it pushes content down so headers are never covered). Rendered
 * once in the tab layout; `null` while online.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing, typography } from '@/theme';

import { useConnectivity } from '../connectivity-context';
import { OFFLINE_MESSAGE } from '../domain';

export function OfflineBanner({
  testID = 'offline-banner',
}: {
  testID?: string;
}) {
  const { isOnline } = useConnectivity();
  const insets = useSafeAreaInsets();

  if (isOnline) return null;

  return (
    <View testID={testID} style={[styles.bar, { paddingTop: insets.top }]}>
      <MaterialIcons
        name="wifi-off"
        size={16}
        color={colors.textSecondary}
      />
      <Text style={[typography.bodySm, styles.text]}>{OFFLINE_MESSAGE}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  text: {
    color: colors.textSecondary,
  },
});
