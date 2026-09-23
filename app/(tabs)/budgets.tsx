/**
 * Budgets — "Budget Architecture" (T7, issue #8).
 *
 * The screen is a thin renderer over `useBudgets()`: the current month's
 * `v_budget_status` rows (server-aggregated, PRD §4.2), each drawn as a card
 * with a progress ring (DESIGN.md §5). It never computes money — `spent`,
 * `percent` and `state` are fields of the view.
 *
 * A month with no budgets renders the empty state (a new month is
 * automatically "empty" — there is no cron, the view simply has no rows for a
 * month without budgets). Alerts fired this session render as dismissible
 * in-app banners on top of the list, so they work even when push permission
 * was denied (AC #8).
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { router } from 'expo-router';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { EmptyStateCard, AppHeader, Card, ErrorStateCard, Screen, SectionHeader } from '@/components';
import {
  budgetStateLabels,
  formatPercent,
  useBudgets,
  type BudgetStatus,
  type FiredAlert,
} from '@/features/budgets';
import { BudgetRing } from '@/features/budgets/components/budget-ring';
import { useProfile } from '@/features/profile';
import { formatGrouped } from '@/features/transactions/domain';
import { dictionaryFor, fill, localeTagFor, useLanguage } from '@/i18n';
import type { Language } from '@/i18n/locale';
import { colors, layout, radius, spacing, typography } from '@/theme';

/** `2026-09-01` → `September 2026`. Falls back to the raw string. */
export function formatMonthLabel(month: string | null, lang: Language = 'id'): string {
  if (!month) return '';
  const date = new Date(`${month}T00:00:00`);
  if (!Number.isFinite(date.getTime())) return month;
  const formatted = date.toLocaleDateString(localeTagFor(lang), {
    month: 'long',
    year: 'numeric',
  });
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

export default function BudgetsScreen() {
  const {
    month,
    budgets,
    loading,
    error,
    recentAlerts,
    dismissAlert,
    refresh,
  } = useBudgets();
  const { avatarSignedUrl } = useProfile();
  // C6: copy + month format follow the OS language (ADR-0008, R10).
  const language = useLanguage();
  const t = dictionaryFor(language);
  const tb = t.budgets;

  return (
    <Screen style={styles.frame} testID="budgets-screen">
      <AppHeader avatarUri={avatarSignedUrl} />
      <Card style={styles.hero}>
        <Text style={[typography.labelUppercase, styles.kicker]}>Active Cycle</Text>
        <Text style={[typography.headlineLg, styles.title]}>
          Budget Architecture
        </Text>
        {month ? (
          <Text testID="budgets-month" style={[typography.bodySm, styles.month]}>
            {formatMonthLabel(month, language)}
            {budgets.length > 0
              ? ` · ${fill(tb.screen.countActive, { count: budgets.length })}`
              : ''}
          </Text>
        ) : null}
      </Card>

      {recentAlerts.map((alert, index) => (
        <AlertBanner
          key={`${alert.categoryId}-${alert.threshold}`}
          alert={alert}
          onDismiss={() => dismissAlert(index)}
        />
      ))}

      <ScrollView
        testID="budgets-scroll"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        {loading ? (
          <View testID="budgets-loading" style={styles.loading}>
            <ActivityIndicator color={colors.accent} />
          </View>
        ) : error ? (
          <ErrorStateCard
            testID="budgets-error"
            message={error}
            onRetry={() => void refresh()}
          />
        ) : budgets.length === 0 ? (
          <BudgetsEmptyState />
        ) : (
          <>
            <SectionHeader
              testID="budgets-allocations"
              title={tb.screen.allocations}
              actionLabel={tb.screen.add}
              onAction={() => router.push('/budget-form')}
            />
            {budgets.map((budget) => (
              <BudgetCard key={budget.budgetId} budget={budget} />
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

function BudgetCard({ budget }: { budget: BudgetStatus }) {
  // C6: labels + amount/percent format follow the OS language (ADR-0008, R10).
  const language = useLanguage();
  const t = dictionaryFor(language);
  return (
    <Card style={styles.card}>
      <Pressable
        testID={`budget-card-${budget.budgetId}`}
        accessibilityRole="button"
        accessibilityLabel={fill(t.budgets.screen.cardA11y, {
          name: budget.categoryName,
          percent: formatPercent(budget.percent, language),
        })}
        onPress={() =>
          router.push({ pathname: '/budget-form', params: { id: budget.budgetId } })
        }
        style={styles.cardPress}
      >
        <BudgetRing percent={budget.percent} state={budget.state} size={104} />
      <View style={styles.cardBody}>
        <View style={styles.cardTitleRow}>
          <MaterialIcons
            name={budget.categoryIcon as never}
            size={18}
            color={colors.accent}
          />
          <Text style={[typography.headlineSm, styles.cardTitle]} numberOfLines={1}>
            {budget.categoryName}
          </Text>
        </View>
        <Text style={[typography.currencySm, styles.spent]} numberOfLines={1}>
          Rp {formatGrouped(budget.spent, language)}
          <Text style={styles.limit}> / Rp {formatGrouped(budget.amountLimit, language)}</Text>
        </Text>
        <View
          testID={`budget-state-${budget.budgetId}`}
          style={[
            styles.stateChip,
            budget.state === 'ok' ? styles.stateChipOk : styles.stateChipHot,
          ]}
        >
          <Text style={[typography.bodySm, styles.stateText]}>
            {budgetStateLabels[budget.state]} · {formatPercent(budget.percent, language)}
          </Text>
        </View>
      </View>
      </Pressable>
    </Card>
  );
}

function AlertBanner({
  alert,
  onDismiss,
}: {
  alert: FiredAlert;
  onDismiss: () => void;
}) {
  // C6: alert banner copy follows the OS language (ADR-0008).
  const language = useLanguage();
  const t = dictionaryFor(language);
  return (
    <View testID={`budget-alert-${alert.categoryId}`} style={styles.alert}>
      <MaterialIcons
        name={alert.threshold === 'exceeded_100' ? 'error-outline' : 'warning-amber'}
        size={20}
        color={colors.accent}
      />
      <View style={styles.alertBody}>
        <Text style={[typography.bodyMd, styles.alertTitle]} numberOfLines={2}>
          {fill(
            alert.threshold === 'exceeded_100'
              ? t.budgets.alert.exceededTitle
              : t.budgets.alert.warningTitle,
            { categoryName: alert.categoryName },
          )}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t.budgets.screen.dismissAlert}
        onPress={onDismiss}
        style={styles.alertCloseButton}
      >
        <MaterialIcons name="close" size={18} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

function BudgetsEmptyState() {
  // C6: empty-state copy follows the OS language (ADR-0008).
  const t = dictionaryFor(useLanguage());
  return (
    <EmptyStateCard
      testID="budgets-empty"
      icon="savings"
      title={t.budgets.screen.emptyTitle}
      description={t.budgets.screen.emptyBody}
      actionLabel={t.budgets.screen.emptyAction}
      onAction={() => router.push('/budget-form')}
    />
  );
}

const styles = StyleSheet.create({
  frame: {
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  hero: {
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.xl,
  },
  kicker: {
    color: colors.textSecondary,
  },
  title: {
    color: colors.textPrimary,
  },
  month: {
    color: colors.textSecondary,
  },
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  loading: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  center: {
    gap: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.xl,
  },
  error: {
    color: colors.error,
    textAlign: 'center',
  },
  emptyTitle: {
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptyBody: {
    color: colors.textSecondary,
    textAlign: 'center',
  },
  card: {
    padding: spacing.lg,
    borderRadius: radius.xl,
  },
  cardPress: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  cardBody: {
    flex: 1,
    gap: spacing.xs,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardTitle: {
    color: colors.textPrimary,
    flex: 1,
  },
  spent: {
    color: colors.textPrimary,
  },
  limit: {
    color: colors.textSecondary,
  },
  stateChip: {
    alignSelf: 'flex-start',
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  stateChipOk: {
    backgroundColor: colors.surfaceElevated,
  },
  stateChipHot: {
    backgroundColor: colors.surfaceElevated,
    borderColor: colors.accent,
    borderWidth: 1,
  },
  stateText: {
    color: colors.accent,
  },
  alert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceCard,
    borderColor: colors.accent,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  alertBody: {
    flex: 1,
  },
  alertTitle: {
    color: colors.textPrimary,
  },
  alertCloseButton: {
    width: layout.minTapTarget,
    height: layout.minTapTarget,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: -8,
  },
});
