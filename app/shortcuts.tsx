/**
 * Shortcuts guide (S1, ADR-0009) — the one-page OS-pinning manual.
 *
 * The app exposes doors, not detectors: the three buttons below fire the
 * same deep links an OS gesture would (`cashtrix://add-transaction?type=`
 * and `cashtrix://scan`), so the screen doubles as the manual test surface
 * for the shortcut contract. The static IDs `shortcut-expense`,
 * `shortcut-income` and `shortcut-scan` are literal on purpose — they feed
 * `scripts/verify-t11.mjs --static-only`.
 *
 * Reached from the Profile settings row (`profile-shortcuts-row`); gate
 * parking (locked / unconfirmed / MFA) stays the auth gate's job, so this
 * screen never checks a session itself.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Card, Screen, SectionHeader } from '@/components';
import { dictionaryFor, useLanguage } from '@/i18n';
import { colors, radius, spacing, typography } from '@/theme';

const DOORS = [
  {
    testID: 'shortcut-expense',
    icon: 'remove-circle-outline',
    titleKey: 'expenseTitle',
    subtitleKey: 'expenseSubtitle',
    href: '/add-transaction?type=expense',
  },
  {
    testID: 'shortcut-income',
    icon: 'add-circle-outline',
    titleKey: 'incomeTitle',
    subtitleKey: 'incomeSubtitle',
    href: '/add-transaction?type=income',
  },
  {
    testID: 'shortcut-scan',
    icon: 'photo-camera',
    titleKey: 'scanTitle',
    subtitleKey: 'scanSubtitle',
    href: '/add-transaction?scan=1',
  },
] as const;

const STEPS = [
  { icon: 'phone-iphone', titleKey: 'iphoneTitle', bodyKey: 'iphoneBody' },
  { icon: 'touch-app', titleKey: 'pixelTitle', bodyKey: 'pixelBody' },
  { icon: 'phonelink-setup', titleKey: 'samsungTitle', bodyKey: 'samsungBody' },
] as const;

export default function ShortcutsScreen() {
  // C6: copy follows the OS language (ADR-0008).
  const language = useLanguage();
  const t = dictionaryFor(language);
  const ts = t.shortcuts;

  return (
    <Screen style={styles.frame} testID="shortcuts-screen">
      <ScrollView
        testID="shortcuts-scroll"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <SectionHeader title={ts.kicker} />
        <Text style={[typography.headlineMd, styles.title]}>{ts.title}</Text>
        <Text style={[typography.bodyMd, styles.subtitle]}>{ts.subtitle}</Text>

        {DOORS.map((door) => (
          <Pressable
            key={door.testID}
            testID={door.testID}
            accessibilityRole="button"
            accessibilityLabel={ts[door.titleKey]}
            onPress={() => router.push(door.href)}
            style={styles.rowPress}
          >
            <Card style={styles.row}>
              <View style={styles.rowIcon}>
                <MaterialIcons
                  name={door.icon}
                  size={20}
                  color={colors.accent}
                />
              </View>
              <View style={styles.rowBody}>
                <Text style={[typography.bodyMd, styles.rowTitle]}>
                  {ts[door.titleKey]}
                </Text>
                <Text style={[typography.bodySm, styles.rowSubtitle]}>
                  {ts[door.subtitleKey]}
                </Text>
              </View>
              <MaterialIcons
                name="chevron-right"
                size={20}
                color={colors.textSecondary}
              />
            </Card>
          </Pressable>
        ))}

        <SectionHeader title={ts.guideKicker} />
        {STEPS.map((step) => (
          <Card key={step.titleKey} style={styles.row}>
            <View style={styles.rowIcon}>
              <MaterialIcons
                name={step.icon}
                size={20}
                color={colors.accent}
              />
            </View>
            <View style={styles.rowBody}>
              <Text style={[typography.bodyMd, styles.rowTitle]}>
                {ts[step.titleKey]}
              </Text>
              <Text style={[typography.bodySm, styles.rowSubtitle]}>
                {ts[step.bodyKey]}
              </Text>
            </View>
          </Card>
        ))}

        <Text style={[typography.bodySm, styles.gateNote]}>{ts.gateNote}</Text>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  frame: {
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  content: {
    gap: spacing.md,
  },
  title: {
    color: colors.textPrimary,
  },
  subtitle: {
    color: colors.textSecondary,
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
  rowSubtitle: {
    color: colors.textSecondary,
  },
  gateNote: {
    color: colors.textSecondary,
  },
});
