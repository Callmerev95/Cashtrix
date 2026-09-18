/**
 * Category create/edit sheet (route `/category-form`, T8 issue #9).
 *
 * Fields: name (1..40 chars), kind (segmented, create-only — locked on edit
 * so existing transactions never change meaning under the form), icon grid
 * from `ICON_CATALOG` (no color picker, AC #9). `?id=` switches to edit mode;
 * the row is read from `useProfile()` so no extra query is needed.
 */
import { useLocalSearchParams, router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { GhostButton, PrimaryButton, Screen, TextField } from '@/components';
import { useAuth } from '@/features/auth';
import {
  ICON_CATALOG,
  isCategoryKind,
  useProfile,
  validateCategoryIcon,
  validateCategoryName,
  type CategoryKind,
} from '@/features/profile';
import { colors, layout, radius, spacing, typography } from '@/theme';

const KINDS: { value: CategoryKind; label: string }[] = [
  { value: 'expense', label: 'Pengeluaran' },
  { value: 'income', label: 'Pemasukan' },
];

export default function CategoryFormScreen() {
  const params = useLocalSearchParams<{ id?: string }>();
  const { session } = useAuth();
  const {
    categories,
    createManagedCategory,
    updateManagedCategory,
  } = useProfile();
  const insets = useSafeAreaInsets();

  const editing = useMemo(
    () => categories.find((item) => item.id === params.id && !item.isSystem),
    [categories, params.id],
  );
  const isEdit = Boolean(params.id);

  const [name, setName] = useState(editing?.name ?? '');
  const [kind, setKind] = useState<CategoryKind>(
    editing && isCategoryKind(editing.kind) ? editing.kind : 'expense',
  );
  const [icon, setIcon] = useState(editing?.icon ?? 'category');
  const [nameError, setNameError] = useState<string | null>(null);
  const [iconError, setIconError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const nextNameError = validateCategoryName(name);
    const nextIconError = validateCategoryIcon(icon);
    setNameError(nextNameError);
    setIconError(nextIconError);
    if (nextNameError || nextIconError) return;

    setBusy(true);
    try {
      if (isEdit && params.id) {
        await updateManagedCategory({ id: params.id, name, icon });
      } else {
        if (!session?.user.id) throw new Error('Sesi tidak ditemukan');
        await createManagedCategory({
          userId: session.user.id,
          name,
          icon,
          kind,
        });
      }
      router.back();
    } catch (cause) {
      setBusy(false);
      Alert.alert(
        isEdit ? 'Gagal menyimpan kategori' : 'Gagal membuat kategori',
        cause instanceof Error ? cause.message : 'Coba lagi sebentar lagi.',
      );
    }
  }

  return (
    <Screen hasFloatingNav={false}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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
            {isEdit ? 'Ubah Kategori' : 'Kategori Baru'}
          </Text>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.body}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={[typography.labelUppercase, styles.kicker]}>Nama</Text>
          <TextField
            testID="category-name"
            value={name}
            onChangeText={(text) => {
              setName(text);
              if (nameError) setNameError(validateCategoryName(text));
            }}
            placeholder="Langganan, Jajan, Sampingan…"
            autoCapitalize="words"
            maxLength={50}
            hasError={Boolean(nameError)}
            returnKeyType="next"
          />
          {nameError ? (
            <Text testID="category-name-error" style={[typography.bodySm, styles.error]}>
              {nameError}
            </Text>
          ) : null}

          {!isEdit ? (
            <>
              <Text style={[typography.labelUppercase, styles.kicker, styles.gap]}>
                Tipe
              </Text>
              <View style={styles.segmented}>
                {KINDS.map((option) => {
                  const active = kind === option.value;
                  return (
                    <Pressable
                      key={option.value}
                      testID={`category-kind-${option.value}`}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      accessibilityLabel={option.label}
                      onPress={() => setKind(option.value)}
                      style={[styles.segment, active && styles.segmentActive]}
                    >
                      <Text
                        style={[
                          typography.bodyMd,
                          styles.segmentText,
                          active && styles.segmentTextActive,
                        ]}
                      >
                        {option.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          <Text style={[typography.labelUppercase, styles.kicker, styles.gap]}>
            Ikon
          </Text>
          <View style={styles.iconGrid}>
            {ICON_CATALOG.map((entry) => {
              const active = icon === entry;
              return (
                <Pressable
                  key={entry}
                  testID={`category-icon-${entry}`}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={`Ikon ${entry}`}
                  onPress={() => {
                    setIcon(entry);
                    if (iconError) setIconError(null);
                  }}
                  style={[styles.iconWell, active && styles.iconWellActive]}
                >
                  <MaterialIcons
                    name={entry as never}
                    size={22}
                    color={active ? colors.accent : colors.textSecondary}
                  />
                </Pressable>
              );
            })}
          </View>
          {iconError ? (
            <Text style={[typography.bodySm, styles.error]}>{iconError}</Text>
          ) : null}
          <Text style={[typography.bodySm, styles.hint]}>
            Warna ikon mengikuti tema — tanpa color picker.
          </Text>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: spacing.md }]}>
          <PrimaryButton
            testID="category-save"
            label={isEdit ? 'Simpan' : 'Buat Kategori'}
            onPress={save}
            loading={busy}
          />
          <GhostButton
            testID="category-cancel"
            label="Batal"
            onPress={() => router.back()}
          />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
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
  body: {
    paddingTop: spacing.lg,
    paddingBottom: spacing.xl,
  },
  kicker: {
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  gap: {
    marginTop: spacing.lg,
  },
  error: {
    color: colors.error,
    marginTop: spacing.xs,
  },
  segmented: {
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.full,
    padding: spacing.xs,
  },
  segment: {
    flex: 1,
    minHeight: layout.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.full,
  },
  segmentActive: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  segmentText: {
    color: colors.textSecondary,
  },
  segmentTextActive: {
    color: colors.accent,
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  iconWell: {
    width: 52,
    height: 52,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWellActive: {
    borderColor: colors.accent,
  },
  hint: {
    marginTop: spacing.md,
    color: colors.textSecondary,
  },
  footer: {
    gap: spacing.xs,
  },
});
