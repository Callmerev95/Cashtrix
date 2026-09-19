/**
 * Profile tab (T8, issue #9) — "app terasa milik pengguna".
 *
 * Thin renderer over `useProfile()`: avatar (private bucket, signed URL)
 * + display name + currency setting + a settings list (DESIGN.md §6) that
 * leads to the category manager, the CSV export (T9 follow-up #22), and the
 * delete-account flow. Sign out stays T3's responsibility (PRD
 * §2.3 Epic A): drop the session and all local data, then the routing gate
 * sends the user to Login.
 */
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { GhostButton, PrimaryButton, Screen, TextField } from '@/components';
import { signOut, useAuth } from '@/features/auth';
import { exportAndShareTransactions } from '@/features/data-ownership';
import {
  SUPPORTED_CURRENCIES,
  formatMoney,
  useProfile,
  validateDisplayName,
  type CurrencyCode,
} from '@/features/profile';
import { colors, gradients, layout, radius, spacing, typography } from '@/theme';

export default function ProfileScreen() {
  const { session } = useAuth();
  const {
    profile,
    avatarSignedUrl,
    loading,
    error,
    refresh,
    saveProfile,
    saveAvatar,
  } = useProfile();

  const [name, setName] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [savingCurrency, setSavingCurrency] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  // Same dead-URL degradation as AppHeader: a signed URL that no longer
  // resolves renders the fallback initial instead of a blank box. The
  // "seen" URI is state (never a ref, never an effect — see the lint rules);
  // a new URI resets the flag during render, before commit.
  const [avatarBroken, setAvatarBroken] = useState(false);
  const [seenAvatarUrl, setSeenAvatarUrl] = useState(avatarSignedUrl);
  if (seenAvatarUrl !== avatarSignedUrl) {
    setSeenAvatarUrl(avatarSignedUrl);
    setAvatarBroken(false);
  }

  const draftName = name ?? profile?.displayName ?? '';

  async function onSaveName() {
    const message = validateDisplayName(draftName);
    setNameError(message);
    if (message) return;
    setSavingName(true);
    try {
      await saveProfile({ displayName: draftName });
      setName(null);
    } catch (cause) {
      setNameError(
        cause instanceof Error ? cause.message : 'Gagal menyimpan nama',
      );
    } finally {
      setSavingName(false);
    }
  }

  async function onSelectCurrency(code: CurrencyCode) {
    if (code === profile?.currencyCode || savingCurrency) return;
    setSavingCurrency(true);
    try {
      await saveProfile({ currencyCode: code });
    } catch (cause) {
      Alert.alert(
        'Gagal menyimpan mata uang',
        cause instanceof Error ? cause.message : 'Coba lagi sebentar lagi.',
      );
    } finally {
      setSavingCurrency(false);
    }
  }

  async function onChangeAvatar() {
    const userId = session?.user.id;
    if (!userId || uploadingAvatar) return;

    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Izin galeri ditolak',
        'Aktifkan akses foto di pengaturan agar avatar bisa diganti.',
      );
      return;
    }

    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.85,
    });
    if (picked.canceled) return;

    const asset = picked.assets[0];
    if (!asset) return;
    setUploadingAvatar(true);
    try {
      await saveAvatar({ userId, sourceUri: asset.uri });
    } catch (cause) {
      Alert.alert(
        'Gagal mengunggah avatar',
        cause instanceof Error ? cause.message : 'Coba lagi sebentar lagi.',
      );
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function onExportCsv() {
    if (exportingCsv) return;
    setExportingCsv(true);
    try {
      const outcome = await exportAndShareTransactions();
      if (outcome === 'unavailable') {
        Alert.alert(
          'Berbagi tidak tersedia',
          'Perangkat ini tidak mendukung share sheet.',
        );
      }
    } catch (cause) {
      Alert.alert(
        'Gagal mengekspor data',
        cause instanceof Error ? cause.message : 'Coba lagi sebentar lagi.',
      );
    } finally {
      setExportingCsv(false);
    }
  }

  async function confirmSignOut() {
    setSigningOut(true);
    try {
      await signOut();
      // AuthGate swaps to Login; nothing to navigate here.
    } catch {
      setSigningOut(false);
      Alert.alert('Gagal keluar', 'Coba lagi sebentar lagi.');
    }
  }

  function onSignOutPress() {
    Alert.alert(
      'Keluar dari Cashtrix?',
      'Sesi dan data lokal di perangkat ini akan dihapus.',
      [
        { text: 'Batal', style: 'cancel' },
        { text: 'Keluar', style: 'destructive', onPress: confirmSignOut },
      ],
    );
  }

  return (
    <Screen style={styles.frame} testID="profile-screen">
      <ScrollView
        testID="profile-scroll"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.identity}>
          <LinearGradient
            colors={[...gradients.cardBorder]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.avatarRing}
          >
            <Pressable
              testID="profile-avatar"
              accessibilityRole="button"
              accessibilityLabel="Ubah foto profil"
              onPress={onChangeAvatar}
              disabled={uploadingAvatar}
              style={styles.avatarPress}
            >
              {avatarSignedUrl && !avatarBroken ? (
                <Image
                  source={{ uri: avatarSignedUrl }}
                  style={styles.avatar}
                  testID="profile-avatar-image"
                  onError={() => setAvatarBroken(true)}
                />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={[typography.headlineMd, styles.avatarInitial]}>
                    {(profile?.displayName ?? 'C').charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </Pressable>
          </LinearGradient>
          <View style={styles.nameRow}>
            <Text style={[typography.headlineMd, styles.avatarName]} numberOfLines={1}>
              {profile?.displayName ?? 'Profile'}
            </Text>
            <MaterialIcons
              name="verified-user"
              size={18}
              color={colors.accent}
            />
          </View>
          <Text style={[typography.bodySm, styles.email]} numberOfLines={1}>
            {session?.user.email ?? ''}
          </Text>
          <GhostButton
            testID="profile-change-avatar"
            label={uploadingAvatar ? 'Mengunggah…' : 'Ubah foto'}
            onPress={onChangeAvatar}
            disabled={uploadingAvatar}
          />
        </View>

        {loading ? (
          <View testID="profile-loading" style={styles.center}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text testID="profile-error" style={[typography.bodyMd, styles.errorText]}>
              {error}
            </Text>
            <PrimaryButton label="Coba lagi" onPress={() => void refresh()} />
          </View>
        ) : (
          <>
            <Text style={[typography.labelUppercase, styles.kicker]}>
              Nama tampilan
            </Text>
            <TextField
              testID="profile-name"
              value={draftName}
              onChangeText={(text) => {
                setName(text);
                if (nameError) setNameError(validateDisplayName(text));
              }}
              placeholder="Nama kamu"
              autoCapitalize="words"
              maxLength={70}
              hasError={Boolean(nameError)}
              returnKeyType="done"
              onSubmitEditing={() => void onSaveName()}
            />
            {nameError ? (
              <Text testID="profile-name-error" style={[typography.bodySm, styles.errorText]}>
                {nameError}
              </Text>
            ) : null}
            {name !== null ? (
              <PrimaryButton
                testID="profile-save-name"
                label="Simpan nama"
                onPress={() => void onSaveName()}
                loading={savingName}
              />
            ) : null}

            <Text style={[typography.labelUppercase, styles.kicker, styles.gap]}>
              Mata uang tampilan
            </Text>
            <Text style={[typography.bodySm, styles.hint]}>
              Contoh: {formatMoney(1250000, profile?.currencyCode ?? 'IDR', profile?.locale ?? 'id-ID')} — tanpa konversi kurs.
            </Text>
            <View style={styles.currencyGrid}>
              {SUPPORTED_CURRENCIES.map((code) => {
                const active = code === profile?.currencyCode;
                return (
                  <Pressable
                    key={code}
                    testID={`profile-currency-${code}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={`Mata uang ${code}`}
                    onPress={() => void onSelectCurrency(code)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text
                      style={[
                        typography.bodyMd,
                        styles.chipText,
                        active && styles.chipTextActive,
                      ]}
                    >
                      {code}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={[typography.labelUppercase, styles.kicker, styles.gap]}>
              Pengaturan
            </Text>
            <Pressable
              testID="profile-categories-row"
              accessibilityRole="button"
              accessibilityLabel="Kelola kategori"
              onPress={() => router.push('/categories')}
              style={styles.row}
            >
              <View style={styles.rowIcon}>
                <MaterialIcons name="category" size={20} color={colors.accent} />
              </View>
              <View style={styles.rowBody}>
                <Text style={[typography.bodyMd, styles.rowTitle]}>
                  Kategori saya
                </Text>
                <Text style={[typography.bodySm, styles.rowSubtitle]}>
                  Buat, arsipkan, dan atur kategori belanja
                </Text>
              </View>
              <MaterialIcons
                name="chevron-right"
                size={20}
                color={colors.textSecondary}
              />
            </Pressable>
            <Pressable
              testID="profile-export-row"
              accessibilityRole="button"
              accessibilityLabel="Ekspor data sebagai CSV"
              onPress={() => void onExportCsv()}
              disabled={exportingCsv}
              style={styles.row}
            >
              <View style={styles.rowIcon}>
                <MaterialIcons
                  name="download"
                  size={20}
                  color={colors.accent}
                />
              </View>
              <View style={styles.rowBody}>
                <Text style={[typography.bodyMd, styles.rowTitle]}>
                  {exportingCsv ? 'Menyiapkan CSV…' : 'Ekspor data (CSV)'}
                </Text>
                <Text style={[typography.bodySm, styles.rowSubtitle]}>
                  Unduh seluruh transaksi lewat share sheet
                </Text>
              </View>
              {exportingCsv ? (
                <ActivityIndicator size="small" color={colors.accent} />
              ) : (
                <MaterialIcons
                  name="chevron-right"
                  size={20}
                  color={colors.textSecondary}
                />
              )}
            </Pressable>
            <Pressable
              testID="profile-delete-account-row"
              accessibilityRole="button"
              accessibilityLabel="Hapus akun permanen"
              onPress={() => router.push('/delete-account')}
              style={[styles.row, styles.rowDanger]}
            >
              <View style={styles.rowIcon}>
                <MaterialIcons
                  name="delete-forever"
                  size={20}
                  color={colors.error}
                />
              </View>
              <View style={styles.rowBody}>
                <Text style={[typography.bodyMd, styles.rowTitleDanger]}>
                  Hapus akun
                </Text>
                <Text style={[typography.bodySm, styles.rowSubtitle]}>
                  Permanen, tidak bisa dibatalkan
                </Text>
              </View>
              <MaterialIcons
                name="chevron-right"
                size={20}
                color={colors.textSecondary}
              />
            </Pressable>

            <View style={styles.signOut}>
              <GhostButton
                testID="sign-out"
                label={signingOut ? 'Keluar…' : 'Keluar dari Cashtrix'}
                onPress={onSignOutPress}
                disabled={signingOut}
                danger
              />
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  frame: {
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  kicker: {
    color: colors.textSecondary,
  },
  email: {
    color: colors.textSecondary,
  },
  content: {
    gap: spacing.md,
    // paddingBottom delegated to Screen
  },
  center: {
    gap: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  errorText: {
    color: colors.error,
  },
  identity: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: radius.full,
    padding: 2,
    shadowColor: colors.accent,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 0 },
  },
  avatarPress: {
    flex: 1,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  avatar: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
  },
  avatarFallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: colors.accent,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  avatarName: {
    color: colors.textPrimary,
  },
  gap: {
    marginTop: spacing.md,
  },
  hint: {
    color: colors.textSecondary,
  },
  currencyGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    minWidth: layout.minTapTarget,
    minHeight: layout.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  chipActive: {
    borderColor: colors.accent,
    shadowColor: colors.accent,
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
  },
  chipText: {
    color: colors.textSecondary,
  },
  chipTextActive: {
    color: colors.accent,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceCard,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  rowIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    color: colors.textPrimary,
  },
  rowTitleDanger: {
    color: colors.error,
  },
  rowDanger: {
    borderColor: colors.error,
  },
  rowSubtitle: {
    color: colors.textSecondary,
  },
  signOut: {
    alignItems: 'flex-start',
  },
});
