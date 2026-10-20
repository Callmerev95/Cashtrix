/**
 * "Bandingkan Dompet" card (L4b) — ranked comparison of 2–4 wallets.
 *
 * Presentational by design: the screen owns the picked ids and the active
 * metric, the provider owns the payload. Both metrics arrive in one payload
 * (`analytics_wallet_compare`), so the Expense/Income toggle never refetches.
 *
 * Rows are the drill surface: tapping one opens `/search` scoped to that
 * wallet and the active metric. Sparklines share the breakdown's normalised
 * contract (`toWalletSparklines`) — each wallet is scaled to its own peak.
 */
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Polyline, Svg } from 'react-native-svg';

import { colors, layout, radius, spacing, typography } from '@/theme';
import { dictionaryFor, fill, useLanguage } from '@/i18n';
import { pressedFeedback } from '@/components/pressed';
import { Card, Skeleton, SkeletonBlock } from '@/components';

import { formatGrouped } from '../../transactions/domain';
import {
  COMPARE_MAX_WALLETS,
  COMPARE_MIN_WALLETS,
  deltaTone,
  formatDelta,
  formatShare,
  isEmptyCompareMode,
  type Sparkline,
  type WalletCompareMode,
  type WalletCompareRow,
} from '../domain';
import { FilterChip } from './range-segmented-control';

const SPARK_W = 48;
const SPARK_H = 16;

export function WalletCompareCard({
  wallets,
  rows,
  sparks = [],
  mode,
  selectedIds,
  onModeChange,
  onToggle,
  onSelectRow,
  loading = false,
  error = null,
  onRetry,
  testID = 'wallet-compare',
}: {
  /** Every active wallet in server order (chips are picked from this list). */
  wallets: WalletCompareRow[];
  /** The picked wallets, already filtered + sorted by the active metric. */
  rows: WalletCompareRow[];
  /** Aligned to `rows` (`toWalletSparklines`). */
  sparks?: Sparkline[];
  mode: WalletCompareMode;
  selectedIds: string[];
  onModeChange: (mode: WalletCompareMode) => void;
  onToggle: (walletId: string) => void;
  onSelectRow: (row: WalletCompareRow) => void;
  loading?: boolean;
  error?: string | null;
  onRetry: () => void;
  testID?: string;
}) {
  const language = useLanguage();
  const t = dictionaryFor(language).analytics;
  const sparkById = new Map(sparks.map((spark) => [spark.id, spark.values]));

  const hint =
    selectedIds.length < COMPARE_MIN_WALLETS
      ? t.compare.minHint
      : selectedIds.length >= COMPARE_MAX_WALLETS &&
          wallets.length > COMPARE_MAX_WALLETS
        ? t.compare.maxHint
        : null;

  return (
    <Card testID={testID} style={styles.card}>
      <Text style={[typography.labelUppercase, styles.kicker]}>
        {t.compare.title}
      </Text>

      <View style={styles.modeRow} accessibilityRole="radiogroup">
        {(['expense', 'income'] as const).map((option) => {
          const active = mode === option;
          return (
            <Pressable
              key={option}
              testID={`wallet-compare-mode-${option}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t.kpi[option]}
              onPress={() => onModeChange(option)}
              style={({ pressed }) => [
                styles.modeOption,
                active && styles.modeActive,
                pressed && pressedFeedback,
              ]}
            >
              <Text
                style={[
                  typography.bodySm,
                  styles.modeLabel,
                  active && styles.modeLabelActive,
                ]}
              >
                {t.kpi[option]}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
      >
        {wallets.map((wallet) => (
          <FilterChip
            key={wallet.walletId}
            testID={`wallet-compare-chip-${wallet.walletId}`}
            label={wallet.name}
            active={selectedIds.includes(wallet.walletId)}
            onPress={() => onToggle(wallet.walletId)}
          />
        ))}
      </ScrollView>

      {hint ? (
        <Text testID={`${testID}-hint`} style={[typography.bodySm, styles.hint]}>
          {hint}
        </Text>
      ) : null}

      <View style={styles.resultsDivider} />

      {error ? (
        <View style={styles.failRow}>
          <Text style={[typography.bodySm, styles.errorText]}>
            {t.compare.loadError}
          </Text>
          <Pressable
            testID={`${testID}-retry`}
            accessibilityRole="button"
            accessibilityLabel={t.compare.retry}
            onPress={onRetry}
            style={({ pressed }) => [
              styles.retry,
              pressed && pressedFeedback,
            ]}
          >
            <Text style={[typography.bodySm, styles.retryText]}>
              {t.compare.retry}
            </Text>
          </Pressable>
        </View>
      ) : loading ? (
        <Skeleton testID={`${testID}-loading`} style={styles.skeleton}>
          {[0, 1].map((index) => (
            <View key={index} style={styles.skeletonRow}>
              <SkeletonBlock
                width={32}
                height={32}
                borderRadius={radius.full}
              />
              <View style={styles.skeletonTexts}>
                <SkeletonBlock width="55%" height={12} />
                <SkeletonBlock width="35%" height={10} />
              </View>
              <SkeletonBlock width={80} height={16} />
            </View>
          ))}
        </Skeleton>
      ) : rows.length === 0 ? null : isEmptyCompareMode(rows, mode) ? (
        <Text testID={`${testID}-empty`} style={[typography.bodySm, styles.empty]}>
          {t.compare.empty}
        </Text>
      ) : (
        <View>
          {rows.map((row, index) => {
            const spark = sparkById.get(row.walletId);
            const delta = row.delta[mode];
            const tone = deltaTone(delta);
            const last = index === rows.length - 1;
            return (
              <Pressable
                key={row.walletId}
                testID={`${testID}-row-${row.walletId}`}
                accessibilityRole="button"
                accessibilityLabel={fill(t.kpiDrillA11y, { label: row.name })}
                onPress={() => onSelectRow(row)}
                style={({ pressed }) => [
                  styles.row,
                  last && styles.rowLast,
                  pressed && pressedFeedback,
                ]}
              >
                <View style={styles.iconWell}>
                  <MaterialIcons
                    name="account-balance-wallet"
                    size={18}
                    color={colors.accent}
                  />
                </View>

                <View style={styles.rowTexts}>
                  <Text
                    style={[typography.bodyMd, styles.rowName]}
                    numberOfLines={1}
                  >
                    {row.name}
                  </Text>
                  <Text style={[typography.bodySm, styles.rowMeta]}>
                    <Text
                      style={
                        tone === 'up'
                          ? styles.deltaUp
                          : tone === 'down'
                            ? styles.deltaDown
                            : styles.deltaFlat
                      }
                    >
                      {formatDelta(delta, language)}
                    </Text>
                    {` · ${formatShare(row.share[mode])}`}
                  </Text>
                </View>

                {spark != null && spark.length > 1 ? (
                  <Svg
                    testID={`${testID}-spark-${row.walletId}`}
                    width={SPARK_W}
                    height={SPARK_H}
                  >
                    <Polyline
                      points={spark
                        .map(
                          (value, position) =>
                            `${((position / (spark.length - 1)) * (SPARK_W - 4) + 2).toFixed(1)},${(SPARK_H - 2 - value * (SPARK_H - 4)).toFixed(1)}`,
                        )
                        .join(' ')}
                      fill="none"
                      stroke={colors.accent}
                      strokeWidth={1.5}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={0.9}
                    />
                  </Svg>
                ) : null}

                <Text
                  style={[typography.currencySm, styles.amount]}
                  numberOfLines={1}
                  adjustsFontSizeToFit
                  minimumFontScale={0.75}
                >
                  {t.currencyPrefix} {formatGrouped(row.totals[mode], language)}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  kicker: {
    color: colors.textSecondary,
  },
  modeRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  modeOption: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  modeActive: {
    borderColor: colors.accent,
    backgroundColor: colors.surfaceElevated,
  },
  modeLabel: {
    color: colors.textSecondary,
  },
  modeLabelActive: {
    color: colors.accent,
  },
  chips: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  hint: {
    color: colors.textSecondary,
  },
  resultsDivider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  failRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  errorText: {
    flex: 1,
    color: colors.textSecondary,
  },
  retry: {
    minHeight: layout.minTapTarget,
    justifyContent: 'center',
    paddingLeft: spacing.sm,
  },
  retryText: {
    color: colors.accent,
  },
  skeleton: {
    gap: spacing.sm,
  },
  skeletonRow: {
    minHeight: layout.minTapTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  skeletonTexts: {
    flex: 1,
    gap: spacing.xs,
  },
  empty: {
    color: colors.textSecondary,
    paddingVertical: spacing.sm,
  },
  row: {
    minHeight: layout.minTapTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  iconWell: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  rowTexts: {
    flex: 1,
    gap: 2,
  },
  rowName: {
    color: colors.textPrimary,
  },
  rowMeta: {
    color: colors.textSecondary,
  },
  deltaUp: {
    color: colors.accent,
  },
  deltaDown: {
    color: colors.textSecondary,
  },
  deltaFlat: {
    color: colors.textSecondary,
  },
  amount: {
    color: colors.textPrimary,
    minWidth: 96,
    textAlign: 'right',
  },
});
