/**
 * Wallet type picker — segmented wells (DESIGN.md §5 "chips / segmented
 * control"): `#1C1C1E` well, active pill `#2C2C2E` + gold glow.
 *
 * No custom colours: the type fixes the icon and the accent (PRD §2.3 Epic B).
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';
import { WALLET_TYPES, walletTypeMeta, type WalletType } from '@/features/wallets';

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>['name'];

export function WalletTypePicker({
  value,
  onChange,
}: {
  value: WalletType;
  onChange: (next: WalletType) => void;
}) {
  return (
    <View style={styles.well}>
      {WALLET_TYPES.map((type) => {
        const meta = walletTypeMeta[type];
        const active = type === value;

        return (
          <Pressable
            key={type}
            testID={`wallet-type-${type}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={meta.label}
            onPress={() => onChange(type)}
            style={[styles.segment, active && styles.segmentActive]}
          >
            <MaterialIcons
              name={meta.icon as MaterialIconName}
              size={18}
              color={active ? colors.accent : colors.textSecondary}
            />
            <Text
              style={[
                typography.bodySm,
                styles.label,
                active && styles.labelActive,
              ]}
            >
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  well: {
    flexDirection: 'row',
    gap: spacing.xs,
    padding: spacing.xs,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
  },
  segmentActive: {
    backgroundColor: colors.surfaceElevated,
    shadowColor: colors.accent,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
  },
  label: {
    color: colors.textSecondary,
  },
  labelActive: {
    color: colors.textPrimary,
  },
});
