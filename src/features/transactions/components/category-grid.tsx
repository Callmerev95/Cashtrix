/**
 * Category picker grid (AC #18) — only categories whose `kind` matches the
 * selected transaction type are shown, so income can never land in an expense
 * category. Selection is a gold ring around the icon well.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radius, spacing, typography } from '@/theme';

import { categoriesForKind, type Category, type TransactionType } from '../domain';

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>['name'];

export function CategoryGrid({
  categories,
  kind,
  selectedId,
  onSelect,
  testID,
}: {
  categories: Category[];
  kind: TransactionType;
  selectedId: string | null;
  onSelect: (category: Category) => void;
  testID?: string;
}) {
  const visible = categoriesForKind(categories, kind);

  if (visible.length === 0) {
    return (
      <Text style={[typography.bodySm, styles.empty]}>
        Belum ada kategori untuk tipe ini.
      </Text>
    );
  }

  return (
    <View testID={testID} style={styles.grid}>
      {visible.map((category) => {
        const active = category.id === selectedId;
        return (
          <Pressable
            key={category.id}
            testID={`category-${category.id}`}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={category.name}
            onPress={() => onSelect(category)}
            style={styles.cell}
          >
            <View style={[styles.well, active && styles.wellActive]}>
              <MaterialIcons
                name={category.icon as MaterialIconName}
                size={22}
                color={active ? colors.accent : colors.textPrimary}
              />
            </View>
            <Text
              style={[typography.bodySm, styles.label, active && styles.labelActive]}
              numberOfLines={1}
            >
              {category.name}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  cell: {
    width: 72,
    alignItems: 'center',
    gap: spacing.xs,
  },
  well: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  wellActive: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceCard,
  },
  label: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  labelActive: {
    color: colors.textPrimary,
  },
  empty: {
    color: colors.textSecondary,
  },
});
