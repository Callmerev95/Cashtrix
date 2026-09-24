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
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from 'react-native';

import { Card, GhostButton, PrimaryButton, Screen, SkeletonList, TextField } from '@/components';
import { signOut, useAuth } from '@/features/auth';
import { exportAndShareTransactions } from '@/features/data-ownership';
import { useLock } from '@/features/lock';
import {
  SUPPORTED_CURRENCIES,
  formatMoney,
  useProfile,
  validateDisplayName,
  type CurrencyCode,
} from '@/features/profile';
import { useRecurring } from '@/features/recurring';
import { dictionaryFor, fill, useLanguage } from '@/i18n';
import { colors, gradients, layout, radius, spacing, typography } from '@/theme';

// Legal URLs (GitHub Pages) — same for in-app and store listing (ADR-0006)
const LEGAL = {
  privacy: 'https://callmerev95.github.io/Cashtrix/privacy.html',
  terms: 'https://callmerev95.github.io/Cashtrix/terms.html',
} as const;

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
  const { rules: recurringRules } = useRecurring();
  const { enabled: lockEnabled, biometricsReady, setEnabled } = useLock();
  // C6: copy follows the OS language (ADR-0008).
  const language = useLanguage();
  const t = dictionaryFor(language);
  const ts = t.profile.screen;

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

  // Rules auto-paused by a wallet archive (V3): the Profile banner keeps a
  // stalled bill from failing silently.
  const archivedPauses = recurringRules.filter(
    (rule) => rule.status === 'paused' && rule.walletArchived,
  );

  async function onSaveName() {
    const message = validateDisplayName(draftName, language);
    setNameError(message);
    if (message) return;
    setSavingName(true);
    try {
      await saveProfile({ displayName: draftName });
      setName(null);
    } catch (cause) {
      setNameError(
        cause instanceof Error ? cause.message : ts.nameFail,
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
        ts.currencyFail,
        cause instanceof Error ? cause.message : t.common.retry,
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
        ts.avatarPermissionTitle,
        ts.avatarPermissionBody,
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
        ts.avatarFail,
        cause instanceof Error ? cause.message : t.common.retry,
      );
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function onExportCsv() {
    if (exportingCsv) return;
    setExportingCsv(true);
    try {
      const outcome = await exportAndShareTransactions(language);
      if (outcome === 'unavailable') {
        Alert.alert(
          ts.exportUnavailableTitle,
          ts.exportUnavailableBody,
        );
      }
    } catch (cause) {
      Alert.alert(
        ts.exportFail,
        cause instanceof Error ? cause.message : t.common.retry,
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
      Alert.alert(ts.signOutFail, t.common.retry);
    }
  }

  function onSignOutPress() {
    Alert.alert(
      ts.signOutTitle,
      ts.signOutBody,
      [
        { text: t.common.cancel, style: 'cancel' },
        { text: ts.signOutAction, style: 'destructive', onPress: confirmSignOut },
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
              accessibilityLabel={ts.changeAvatarA11y}
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
              {profile?.displayName ?? ts.fallbackName}
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
            label={uploadingAvatar ? ts.uploading : ts.changeAvatar}
            onPress={onChangeAvatar}
            disabled={uploadingAvatar}
          />
        </View>

        {loading ? (
          <SkeletonList testID="profile-loading" rows={4} />
        ) : error ? (
          <View style={styles.center}>
            <Text testID="profile-error" style={[typography.bodyMd, styles.errorText]}>
              {error}
            </Text>
            <PrimaryButton label={ts.retry} onPress={() => void refresh()} />
          </View>
        ) : (
          <>
            <Text style={[typography.labelUppercase, styles.kicker]}>
              {ts.nameLabel}
            </Text>
            <TextField
              testID="profile-name"
              value={draftName}
              onChangeText={(text) => {
                setName(text);
                if (nameError) setNameError(validateDisplayName(text, language));
              }}
              placeholder={ts.namePlaceholder}
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
                label={ts.saveName}
                onPress={() => void onSaveName()}
                loading={savingName}
              />
            ) : null}

            <Text style={[typography.labelUppercase, styles.kicker, styles.gap]}>
              {ts.currencyLabel}
            </Text>
            <Text style={[typography.bodySm, styles.hint]}>
              {fill(ts.currencyHint, {
                example: formatMoney(
                  1250000,
                  profile?.currencyCode ?? 'IDR',
                  language,
                ),
              })}
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
                    accessibilityLabel={fill(ts.currencyA11y, { code })}
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
              {t.lock.section}
            </Text>
            <Card style={styles.row}>
              <View style={styles.rowIcon}>
                <MaterialIcons
                  name="fingerprint"
                  size={20}
                  color={colors.accent}
                />
              </View>
              <View style={styles.rowBody}>
                <Text style={[typography.bodyMd, styles.rowTitle]}>
                  {t.lock.title}
                </Text>
                <Text style={[typography.bodySm, styles.rowSubtitle]}>
                  {biometricsReady ? t.lock.subtitle : t.lock.unavailable}
                </Text>
              </View>
              <Switch
                testID="profile-lock-toggle"
                accessibilityLabel={t.lock.toggleA11y}
                value={lockEnabled}
                onValueChange={(value) => void setEnabled(value)}
                disabled={!biometricsReady}
                trackColor={{ false: colors.surfaceElevated, true: colors.accent }}
                thumbColor={colors.textPrimary}
              />
            </Card>

            <Text style={[typography.labelUppercase, styles.kicker, styles.gap]}>
              {ts.settings}
            </Text>
            {archivedPauses.length > 0 ? (
              <Pressable
                testID="profile-recurring-banner"
                accessibilityRole="button"
                accessibilityLabel={ts.pausedA11y}
                onPress={() => router.push('/recurring')}
                style={styles.rowPress}
              >
                <Card style={styles.row}>
                  <View style={styles.rowIcon}>
                    <MaterialIcons
                      name="pause-circle-outline"
                      size={20}
                      color={colors.accent}
                    />
                  </View>
                  <View style={styles.rowBody}>
                    <Text style={[typography.bodyMd, styles.rowTitle]}>
                      {fill(ts.pausedTitle, { count: archivedPauses.length })}
                    </Text>
                    <Text style={[typography.bodySm, styles.rowSubtitle]}>
                      {ts.pausedSubtitle}
                    </Text>
                  </View>
                  <MaterialIcons
                    name="chevron-right"
                    size={20}
                    color={colors.textSecondary}
                  />
                </Card>
              </Pressable>
            ) : null}
            <Pressable
              testID="profile-recurring-row"
              accessibilityRole="button"
              accessibilityLabel={ts.recurringA11y}
              onPress={() => router.push('/recurring')}
              style={styles.rowPress}
            >
              <Card style={styles.row}>
              <View style={styles.rowIcon}>
                <MaterialIcons name="repeat" size={20} color={colors.accent} />
              </View>
              <View style={styles.rowBody}>
                <Text style={[typography.bodyMd, styles.rowTitle]}>
                  {ts.recurringTitle}
                </Text>
                <Text style={[typography.bodySm, styles.rowSubtitle]}>
                  {ts.recurringSubtitle}
                </Text>
              </View>
              <MaterialIcons
                name="chevron-right"
                size={20}
                color={colors.textSecondary}
              />
              </Card>
            </Pressable>
            <Pressable
              testID="profile-categories-row"
              accessibilityRole="button"
              accessibilityLabel={ts.categoriesA11y}
              onPress={() => router.push('/categories')}
              style={styles.rowPress}
            >
              <Card style={styles.row}>
              <View style={styles.rowIcon}>
                <MaterialIcons name="category" size={20} color={colors.accent} />
              </View>
              <View style={styles.rowBody}>
                <Text style={[typography.bodyMd, styles.rowTitle]}>
                  {ts.categoriesTitle}
                </Text>
                <Text style={[typography.bodySm, styles.rowSubtitle]}>
                  {ts.categoriesSubtitle}
                </Text>
              </View>
              <MaterialIcons
                name="chevron-right"
                size={20}
                color={colors.textSecondary}
              />
              </Card>
            </Pressable>
            <Pressable
              testID="profile-export-row"
              accessibilityRole="button"
              accessibilityLabel={ts.exportA11y}
              onPress={() => void onExportCsv()}
              disabled={exportingCsv}
              style={styles.rowPress}
            >
              <Card style={styles.row}>
              <View style={styles.rowIcon}>
                <MaterialIcons
                  name="download"
                  size={20}
                  color={colors.accent}
                />
              </View>
              <View style={styles.rowBody}>
                <Text style={[typography.bodyMd, styles.rowTitle]}>
                  {exportingCsv ? ts.exportBusy : ts.exportTitle}
                </Text>
                <Text style={[typography.bodySm, styles.rowSubtitle]}>
                  {ts.exportSubtitle}
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
              </Card>
            </Pressable>
            <Pressable
              testID="profile-delete-account-row"
              accessibilityRole="button"
              accessibilityLabel={ts.deleteA11y}
              onPress={() => router.push('/delete-account')}
              style={styles.rowPress}
            >
              <Card style={styles.row} borderColor={colors.error}>
              <View style={styles.rowIcon}>
                <MaterialIcons
                  name="delete-forever"
                  size={20}
                  color={colors.error}
                />
              </View>
              <View style={styles.rowBody}>
                <Text style={[typography.bodyMd, styles.rowTitleDanger]}>
                  {ts.deleteTitle}
                </Text>
                <Text style={[typography.bodySm, styles.rowSubtitle]}>
                  {ts.deleteSubtitle}
                </Text>
              </View>
              <MaterialIcons
                name="chevron-right"
                size={20}
                color={colors.textSecondary}
              />
              </Card>
            </Pressable>

            <Pressable
              testID="profile-privacy-row"
              accessibilityRole="link"
              accessibilityLabel={ts.privacyTitle}
              onPress={() => Linking.openURL(LEGAL.privacy).catch(() => undefined)}
              style={styles.rowPress}
            >
              <Card style={styles.row}>
              <View style={styles.rowIcon}>
                <MaterialIcons name="shield" size={20} color={colors.accent} />
              </View>
              <View style={styles.rowBody}>
                <Text style={[typography.bodyMd, styles.rowTitle]}>
                  {ts.privacyTitle}
                </Text>
                <Text style={[typography.bodySm, styles.rowSubtitle]}>
                  {ts.privacySubtitle}
                </Text>
              </View>
              <MaterialIcons
                name="open-in-new"
                size={20}
                color={colors.textSecondary}
              />
              </Card>
            </Pressable>

            <Pressable
              testID="profile-terms-row"
              accessibilityRole="link"
              accessibilityLabel={ts.termsTitle}
              onPress={() => Linking.openURL(LEGAL.terms).catch(() => undefined)}
              style={styles.rowPress}
            >
              <Card style={styles.row}>
              <View style={styles.rowIcon}>
                <MaterialIcons name="description" size={20} color={colors.accent} />
              </View>
              <View style={styles.rowBody}>
                <Text style={[typography.bodyMd, styles.rowTitle]}>
                  {ts.termsTitle}
                </Text>
                <Text style={[typography.bodySm, styles.rowSubtitle]}>
                  {ts.termsSubtitle}
                </Text>
              </View>
              <MaterialIcons
                name="open-in-new"
                size={20}
                color={colors.textSecondary}
              />
              </Card>
            </Pressable>

            <View style={styles.signOut}>
              <GhostButton
                testID="sign-out"
                label={signingOut ? ts.signOutBusy : ts.signOut}
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
  rowPress: {
    borderRadius: radius.lg,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
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
  rowSubtitle: {
    color: colors.textSecondary,
  },
  signOut: {
    alignItems: 'flex-start',
  },
});
