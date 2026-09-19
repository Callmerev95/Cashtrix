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

import { EmptyStateCard, AppHeader, Card, PrimaryButton, Screen, SectionHeader } from '@/components';
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
import { colors, layout, radius, spacing, typography } from '@/theme';

const MONTH_NAMES = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

/** `2026-09-01` → `September 2026`. Falls back to the raw string. */
export function formatMonthLabel(month: string | null): string {
  if (!month) return '';
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1;
  const name = MONTH_NAMES[index];
  if (!name || !Number.isFinite(year)) return month;
  return `${name} ${year}`;
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
            {formatMonthLabel(month)}
            {budgets.length > 0 ? ` · ${budgets.length} alokasi aktif` : ''}
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
          <View style={styles.center}>
            <Text testID="budgets-error" style={[typography.bodyMd, styles.error]}>
              {error}
            </Text>
            <PrimaryButton label="Coba lagi" onPress={() => void refresh()} />
          </View>
        ) : budgets.length === 0 ? (
          <BudgetsEmptyState />
        ) : (
          <>
            <SectionHeader
              testID="budgets-allocations"
              title="Alokasi Kategori"
              actionLabel="Tambah"
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
  return (
    <Card style={styles.card}>
      <Pressable
        testID={`budget-card-${budget.budgetId}`}
        accessibilityRole="button"
        accessibilityLabel={`Budget ${budget.categoryName}, ${formatPercent(budget.percent)}`}
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
          Rp {formatGrouped(budget.spent)}
          <Text style={styles.limit}> / Rp {formatGrouped(budget.amountLimit)}</Text>
        </Text>
        <View
          testID={`budget-state-${budget.budgetId}`}
          style={[
            styles.stateChip,
            budget.state === 'ok' ? styles.stateChipOk : styles.stateChipHot,
          ]}
        >
          <Text style={[typography.bodySm, styles.stateText]}>
            {budgetStateLabels[budget.state]} · {formatPercent(budget.percent)}
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
  return (
    <View testID={`budget-alert-${alert.categoryId}`} style={styles.alert}>
      <MaterialIcons
        name={alert.threshold === 'exceeded_100' ? 'error-outline' : 'warning-amber'}
        size={20}
        color={colors.accent}
      />
      <View style={styles.alertBody}>
        <Text style={[typography.bodyMd, styles.alertTitle]} numberOfLines={2}>
          {alert.threshold === 'exceeded_100'
            ? `Budget ${alert.categoryName} terlampaui`
            : `Budget ${alert.categoryName} hampir habis`}
        </Text>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Tutup notifikasi"
        onPress={onDismiss}
        style={styles.alertCloseButton}
      >
        <MaterialIcons name="close" size={18} color={colors.textSecondary} />
      </Pressable>
    </View>
  );
}

function BudgetsEmptyState() {
  return (
    <EmptyStateCard
      testID="budgets-empty"
      icon="savings"
      title="Belum ada budget bulan ini"
      description="Tetapkan batas belanja per kategori. Bulan baru mulai otomatis dari nol — tanpa perlu reset manual."
      actionLabel="Buat Budget Pertama"
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
