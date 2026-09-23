/**
 * Notifications inbox (A5 — riwayat alert di app).
 *
 * The Dashboard bell lands here instead of Budgets: persisted `budget_alerts`
 * rows (newest first) with an unread dot, so a fired alert survives the
 * session. Tapping a row marks it read and opens Budgets for the category
 * context; the header clears the whole inbox at once.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyStateCard, ErrorStateCard, Screen } from '@/components';
import {
  groupAlertsByMonth,
  inboxAlertTitle,
  useBudgets,
  type InboxAlert,
} from '@/features/budgets';
import { formatMonthLabel, formatTime } from '@/features/transactions';
import { dictionaryFor, useLanguage } from '@/i18n';
import { colors, layout, radius, spacing, typography } from '@/theme';

type MaterialIconName = React.ComponentProps<typeof MaterialIcons>['name'];

export default function NotificationsScreen() {
  const {
    alerts,
    unreadCount,
    loading,
    alertsError,
    markRead,
    markAllRead,
    refresh,
  } = useBudgets();
  const [busy, setBusy] = useState(false);
  const insets = useSafeAreaInsets();
  // C6: copy follows the OS language (ADR-0008).
  const language = useLanguage();
  const t = dictionaryFor(language);
  const tn = t.notifications;

  // Month groups, newest month first — rows keep their newest-first order.
  const sections = useMemo(
    () =>
      groupAlertsByMonth(alerts).map((group) => ({
        key: group.month,
        title: formatMonthLabel(new Date(`${group.month}T00:00:00`), language),
        data: group.alerts,
      })),
    [alerts, language],
  );

  async function openAlert(alert: InboxAlert) {
    // Read-mark is best-effort; a failed write must not trap the user here.
    try {
      await markRead(alert.id);
    } catch {
      // The dot stays — the next visit retries.
    }
    router.push('/(tabs)/budgets');
  }

  async function readAll() {
    if (unreadCount === 0 || busy) return;
    setBusy(true);
    try {
      await markAllRead();
    } catch {
      // The dots stay — the next visit retries.
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <View style={[styles.body, { paddingTop: insets.top + spacing.xl }]}>
        <View style={styles.headerRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={tn.back}
            onPress={() => router.back()}
            style={styles.back}
          >
            <MaterialIcons
              name="arrow-back"
              size={24}
              color={colors.textSecondary}
            />
          </Pressable>
          <View style={styles.headerText}>
            <Text style={[typography.labelUppercase, styles.kicker]}>
              {tn.kicker}
            </Text>
            <Text style={[typography.headlineLg, styles.title]}>
              {tn.title}
            </Text>
          </View>
          {unreadCount > 0 ? (
            <Pressable
              testID="notifications-mark-all"
              accessibilityRole="button"
              accessibilityLabel={tn.markAllA11y}
              onPress={() => void readAll()}
              hitSlop={spacing.sm}
            >
              <Text style={[typography.labelUppercase, styles.action]}>
                {busy ? '…' : tn.markAll}
              </Text>
            </Pressable>
          ) : null}
        </View>

        {alertsError ? (
          <ErrorStateCard
            testID="notifications-error"
            message={alertsError}
            onRetry={() => void refresh()}
          />
        ) : null}

        {alerts.length === 0 && loading ? (
          <Text style={[typography.bodyMd, styles.meta]}>
            {tn.loading}
          </Text>
        ) : alerts.length === 0 ? (
          <EmptyStateCard
            testID="notifications-empty"
            icon="notifications-none"
            title={tn.emptyTitle}
            description={tn.emptyBody}
            actionLabel={tn.emptyAction}
            onAction={() => router.push('/(tabs)/budgets')}
          />
        ) : (
          <SectionList
            testID="notification-list"
            sections={sections}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            stickySectionHeadersEnabled
            renderSectionHeader={({ section }) => (
              <View style={styles.groupWrap}>
                <Text
                  testID={`notification-group-${section.key}`}
                  style={[typography.labelUppercase, styles.group]}
                >
                  {section.title}
                </Text>
              </View>
            )}
            renderItem={({ item }) => (
              <Pressable
                testID={`notification-${item.id}`}
                accessibilityRole="button"
                accessibilityLabel={inboxAlertTitle(
                  item.categoryName,
                  item.threshold,
                )}
                onPress={() => void openAlert(item)}
                style={styles.row}
              >
                <View style={styles.dotSlot}>
                  {item.readAt === null ? (
                    <View style={styles.dot} />
                  ) : null}
                </View>
                <View style={styles.iconWell}>
                  <MaterialIcons
                    name={item.categoryIcon as MaterialIconName}
                    size={20}
                    color={colors.accent}
                  />
                </View>
                <View style={styles.center}>
                  <Text style={[typography.bodyMd, styles.name]} numberOfLines={2}>
                    {inboxAlertTitle(item.categoryName, item.threshold)}
                  </Text>
                  <Text
                    style={[typography.bodySm, styles.meta]}
                    numberOfLines={1}
                  >
                    {formatTime(item.firedAt)}
                  </Text>
                </View>
              </Pressable>
            )}
          />
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  back: {
    width: layout.minTapTarget,
    height: layout.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    flex: 1,
    gap: spacing.xs,
  },
  kicker: {
    color: colors.textSecondary,
  },
  title: {
    color: colors.textPrimary,
  },
  action: {
    color: colors.accent,
  },
  meta: {
    color: colors.textSecondary,
  },
  error: {
    color: colors.error,
  },
  groupWrap: {
    backgroundColor: colors.background,
    paddingTop: spacing.sm,
  },
  group: {
    marginBottom: spacing.xs,
    color: colors.textSecondary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm + spacing.xs,
    minHeight: layout.minTapTarget + spacing.md,
  },
  dotSlot: {
    width: 8,
    alignItems: 'center',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    backgroundColor: colors.accent,
  },
  iconWell: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  center: {
    flex: 1,
    gap: 2,
  },
  name: {
    color: colors.textPrimary,
  },
});
