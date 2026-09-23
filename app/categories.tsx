/**
 * Category manager (route `/categories`, T8 issue #9).
 *
 * Two sections: custom categories (create/edit/archive/delete) and the shared
 * system categories (mute/unmute only — the rows belong to every account, so
 * they can never be edited or deleted, only hidden per-user via
 * `category_mutes`). Deleting a custom category with history is refused by
 * the FK (`23503`); the row offers archiving instead.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Card, PrimaryButton, Screen } from '@/components';
import { useAuth } from '@/features/auth';
import {
  useProfile,
  type ManagedCategory,
} from '@/features/profile';
import { dictionaryFor, fill, useLanguage } from '@/i18n';
import { colors, layout, radius, spacing, typography } from '@/theme';

export default function CategoriesScreen() {
  const { session } = useAuth();
  const {
    categories,
    loading,
    error,
    refresh,
    archiveManagedCategory,
    unarchiveManagedCategory,
    deleteManagedCategory,
  } = useProfile();
  const [busyId, setBusyId] = useState<string | null>(null);
  // C6: copy follows the OS language (ADR-0008).
  const language = useLanguage();
  const t = dictionaryFor(language);
  const tc = t.profile.categories;

  const custom = useMemo(
    () => categories.filter((item) => !item.isSystem),
    [categories],
  );
  const system = useMemo(
    () => categories.filter((item) => item.isSystem),
    [categories],
  );

  async function toggleArchive(item: ManagedCategory) {
    const userId = session?.user.id;
    if (!userId || busyId) return;
    setBusyId(item.id);
    try {
      if (item.archived || item.muted) {
        await unarchiveManagedCategory({
          userId,
          id: item.id,
          isSystem: item.isSystem,
        });
      } else {
        await archiveManagedCategory({
          userId,
          id: item.id,
          isSystem: item.isSystem,
        });
      }
    } catch (cause) {
      Alert.alert(
        tc.archiveFail,
        cause instanceof Error ? cause.message : t.common.retry,
      );
    } finally {
      setBusyId(null);
    }
  }

  function confirmDelete(item: ManagedCategory) {
    Alert.alert(
      fill(tc.deleteTitle, { name: item.name }),
      tc.deleteBody,
      [
        { text: t.common.cancel, style: 'cancel' },
        {
          text: t.common.delete,
          style: 'destructive',
          onPress: () => void remove(item),
        },
      ],
    );
  }

  async function remove(item: ManagedCategory) {
    if (busyId) return;
    setBusyId(item.id);
    try {
      await deleteManagedCategory({ id: item.id, isSystem: item.isSystem });
    } catch (cause) {
      Alert.alert(
        tc.deleteFail,
        cause instanceof Error ? cause.message : t.common.retry,
      );
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Screen style={styles.frame} testID="categories-screen">
      <View style={styles.header}>
        <Text style={[typography.labelUppercase, styles.kicker]}>
          Personalize
        </Text>
        <Text style={[typography.headlineLg, styles.title]}>
          {t.profile.screen.categoriesTitle}
        </Text>
      </View>

      <ScrollView
        testID="categories-scroll"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {loading ? (
          <View testID="categories-loading" style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text testID="categories-error" style={[typography.bodyMd, styles.errorText]}>
              {error}
            </Text>
            <PrimaryButton label={tc.retry} onPress={() => void refresh()} />
          </View>
        ) : (
          <>
            <Text style={[typography.labelUppercase, styles.kicker]}>
              {fill(tc.customKicker, { count: custom.length })}
            </Text>
            {custom.length === 0 ? (
              <Text style={[typography.bodyMd, styles.empty]}>
                {tc.empty}
              </Text>
            ) : (
              custom.map((item) => (
                <CategoryRow
                  key={item.id}
                  item={item}
                  busy={busyId === item.id}
                  onToggle={() => void toggleArchive(item)}
                  onEdit={() =>
                    router.push({
                      pathname: '/category-form',
                      params: { id: item.id },
                    })
                  }
                  onDelete={() => confirmDelete(item)}
                />
              ))
            )}
            <PrimaryButton
              testID="categories-add"
              label={tc.add}
              onPress={() => router.push('/category-form')}
            />

            <Text style={[typography.labelUppercase, styles.kicker, styles.gap]}>
              {tc.systemKicker}
            </Text>
            {system.map((item) => (
              <CategoryRow
                key={item.id}
                item={item}
                busy={busyId === item.id}
                onToggle={() => void toggleArchive(item)}
              />
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function CategoryRow({
  item,
  busy,
  onToggle,
  onEdit,
  onDelete,
}: {
  item: ManagedCategory;
  busy: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  // C6: labels follow the OS language (ADR-0008).
  const t = dictionaryFor(useLanguage());
  const tc = t.profile.categories;
  const hidden = item.archived || item.muted;
  return (
    <Card style={[styles.card, hidden && styles.cardHidden]}>
      <View style={styles.iconWell}>
        <MaterialIcons
          name={item.icon as never}
          size={20}
          color={hidden ? colors.textSecondary : colors.accent}
        />
      </View>
      <View style={styles.cardBody}>
        <Text style={[typography.bodyMd, styles.cardTitle]} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={[typography.bodySm, styles.cardMeta]}>
          {item.kind === 'expense' ? t.transactions.type.expense : t.transactions.type.income}
          {item.isSystem ? tc.systemSuffix : ''}
          {hidden ? tc.archivedSuffix : ''}
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        <View style={styles.actions}>
          {onEdit && !hidden ? (
            <Pressable
              testID={`category-edit-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={fill(tc.editA11y, { name: item.name })}
              onPress={onEdit}
              hitSlop={12}
            >
              <MaterialIcons name="edit" size={20} color={colors.textSecondary} />
            </Pressable>
          ) : null}
          <Pressable
            testID={`category-archive-${item.id}`}
            accessibilityRole="button"
            accessibilityLabel={
              hidden
                ? fill(tc.unarchiveA11y, { name: item.name })
                : fill(tc.archiveA11y, { name: item.name })
            }
            onPress={onToggle}
            hitSlop={12}
          >
            <MaterialIcons
              name={hidden ? 'unarchive' : 'archive'}
              size={20}
              color={colors.textSecondary}
            />
          </Pressable>
          {onDelete && !item.isSystem ? (
            <Pressable
              testID={`category-delete-${item.id}`}
              accessibilityRole="button"
              accessibilityLabel={fill(tc.deleteA11y, { name: item.name })}
              onPress={onDelete}
              hitSlop={12}
            >
              <MaterialIcons name="delete-outline" size={20} color={colors.error} />
            </Pressable>
          ) : null}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  frame: {
    paddingTop: spacing.xl,
    gap: spacing.md,
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
  content: {
    gap: spacing.sm,
    paddingBottom: layout.navClearance,
  },
  center: {
    gap: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  errorText: {
    color: colors.error,
    textAlign: 'center',
  },
  empty: {
    color: colors.textSecondary,
  },
  gap: {
    marginTop: spacing.md,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  cardHidden: {
    opacity: 0.6,
  },
  iconWell: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    color: colors.textPrimary,
  },
  cardMeta: {
    color: colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
});
