/**
 * Search (A3 — "cari & filter riwayat") + bulk select (A4).
 *
 * Text query + kind filter run server-side against `v_transactions_feed`
 * (note, category name, source + destination wallet names, OR-ed), paged 20
 * at a time into the shared `TransactionHistoryList`. Tapping a row opens the
 * edit form; coming back refetches so an edit is never stale.
 *
 * A4 adds select mode on top of the same results: "Pilih" checks rows, the
 * first checked row locks the kind (transfers can never join), then an
 * inline `CategoryGrid` picks the destination and one bulk UPDATE moves the
 * whole set. Post-apply refreshes mirror the save flow (history + budgets +
 * analytics + alert evaluation).
 *
 * State shape mirrors `AnalyticsProvider`: `loading` is derived
 * (`loadedKey !== requestedKey`), never set in an effect, so the
 * `react-hooks/set-state-in-effect` rule stays quiet. The debounce effect
 * only arms a timer; every state write lands in a promise/timeout/callback.
 */
import { router, useFocusEffect } from 'expo-router';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ErrorStateCard, Screen, TextField } from '@/components';
import { useAnalytics } from '@/features/analytics';
import { useAuth } from '@/features/auth';
import { useBudgets } from '@/features/budgets';
import {
  CategoryGrid,
  PAGE_SIZE,
  SEARCH_DEBOUNCE_MS,
  SearchKindControl,
  TransactionHistoryList,
  bulkSelectionFor,
  bulkUpdateCategory,
  buildSearchPattern,
  hasMoreAfter,
  isSearchActive,
  searchTransactions,
  toggleBulkRow,
  useTransactions,
  type Category,
  type Transaction,
  type TransactionKindFilter,
} from '@/features/transactions';
import { colors, radius, spacing, typography } from '@/theme';

const KIND_LABELS: Record<TransactionKindFilter, string> = {
  all: 'Semua',
  expense: 'Pengeluaran',
  income: 'Pemasukan',
  transfer: 'Transfer',
};

export default function SearchScreen() {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<TransactionKindFilter>('all');
  const [results, setResults] = useState<Transaction[]>([]);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const insets = useSafeAreaInsets();

  // A4 select mode — ids only; the locked kind derives from the visible rows.
  const [selecting, setSelecting] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectHint, setSelectHint] = useState<string | null>(null);
  const [choosingCategory, setChoosingCategory] = useState(false);
  const [pickedCategory, setPickedCategory] = useState<Category | null>(null);
  const [applying, setApplying] = useState(false);

  const { session } = useAuth();
  const { categories, refresh: refreshTransactions } = useTransactions();
  const { refresh: refreshBudgets, evaluateAndAlert } = useBudgets();
  const { refresh: refreshAnalytics } = useAnalytics();

  const mounted = useRef(true);
  // A slow response for an older query must not overwrite newer results.
  const requestId = useRef(0);
  const fetchingPage = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const active = isSearchActive(query, kind);
  const pattern = buildSearchPattern(query);
  // Identity of the in-flight request: kind + text. `loading` follows from it.
  const requestedKey = active ? `${kind}|${pattern ?? ''}` : null;
  const loading = requestedKey !== null && loadedKey !== requestedKey;

  const selection = bulkSelectionFor(selectedIds, results);
  const lockedKind = selection.kind;

  const runSearch = useCallback(
    (nextQuery: string, nextKind: TransactionKindFilter): Promise<void> => {
      const ticket = ++requestId.current;
      const key: string | null = isSearchActive(nextQuery, nextKind)
        ? `${nextKind}|${buildSearchPattern(nextQuery) ?? ''}`
        : null;
      if (key === null) return Promise.resolve();

      return searchTransactions({ query: nextQuery, kind: nextKind, offset: 0 })
        .then((page) => {
          if (!mounted.current || ticket !== requestId.current) return;
          setResults(page);
          // Checks pointing at rows that left the page are dropped.
          setSelectedIds((current) =>
            current.filter((id) => page.some((row) => row.id === id)),
          );
          setHasMore(hasMoreAfter(PAGE_SIZE, page.length));
          setLoadedKey(key);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (!mounted.current || ticket !== requestId.current) return;
          setError(
            cause instanceof Error ? cause.message : 'Gagal mencari',
          );
        });
    },
    [],
  );

  // Debounced text search; a kind tap searches immediately via its handler.
  useEffect(() => {
    if (!isSearchActive(query, kind)) return;
    const timer = setTimeout(() => {
      void runSearch(query, kind);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, kind, runSearch]);

  // Returning from the edit form refetches — the row may have changed.
  useFocusEffect(
    useCallback(() => {
      if (isSearchActive(query, kind)) void runSearch(query, kind);
    }, [query, kind, runSearch]),
  );

  const loadMore = useCallback(() => {
    if (fetchingPage.current || !mounted.current) return;
    fetchingPage.current = true;
    setLoadingMore(true);

    searchTransactions({ query, kind, offset: results.length })
      .then((page) => {
        if (!mounted.current) return;
        setResults((current) => {
          const seen = new Set(current.map((row) => row.id));
          return [...current, ...page.filter((row) => !seen.has(row.id))];
        });
        setHasMore(hasMoreAfter(PAGE_SIZE, page.length));
      })
      .catch((cause: unknown) => {
        if (!mounted.current) return;
        setError(cause instanceof Error ? cause.message : 'Gagal mencari');
      })
      .finally(() => {
        fetchingPage.current = false;
        if (mounted.current) setLoadingMore(false);
      });
  }, [query, kind, results.length]);

  function exitSelect() {
    setSelecting(false);
    setSelectedIds([]);
    setSelectHint(null);
    setChoosingCategory(false);
    setPickedCategory(null);
  }

  function onPressRow(row: Transaction) {
    if (!selecting) {
      router.push({ pathname: '/add-transaction', params: { id: row.id } });
      return;
    }
    const next = toggleBulkRow(
      selectedIds,
      { id: row.id, type: row.type },
      lockedKind,
    );
    if (next.rejected === 'transfer') {
      setSelectHint('Transfer tidak punya kategori.');
      return;
    }
    if (next.rejected === 'kind' && lockedKind) {
      setSelectHint(
        `Pilihan dikunci ke ${KIND_LABELS[lockedKind]} — selesaikan atau batalkan dulu.`,
      );
      return;
    }
    setSelectedIds(next.ids);
    setSelectHint(null);
  }

  async function applyBulk() {
    if (!pickedCategory || !lockedKind || selectedIds.length === 0) return;
    setApplying(true);
    try {
      await bulkUpdateCategory({
        ids: selectedIds,
        categoryId: pickedCategory.id,
        kind: lockedKind,
      });
      // Category moves shift Spent and the Insight breakdown, so the
      // post-save refresh set runs here too (wallets are untouched).
      await refreshTransactions();
      try {
        await refreshBudgets();
        await refreshAnalytics();
        await evaluateAndAlert({ userId: session?.user.id ?? '' });
      } catch {
        // Non-fatal; the next mutation re-evaluates (dedup-safe).
      }
      exitSelect();
      await runSearch(query, kind);
    } catch (cause) {
      if (!mounted.current) return;
      setError(cause instanceof Error ? cause.message : 'Gagal mengubah kategori');
    } finally {
      if (mounted.current) setApplying(false);
    }
  }

  const emptyLabel = pattern
    ? `Tidak ada hasil untuk "${pattern.slice(1, -1)}".`
    : 'Tidak ada transaksi jenis ini.';
  const resultLabel =
    loading && results.length === 0 ? 'Mencari…' : `${results.length} hasil`;

  return (
    <Screen>
      <View style={[styles.body, { paddingTop: insets.top + spacing.xl }]}>
        <TextField
          testID="search-input"
          icon="search"
          placeholder="Cari catatan, kategori, dompet…"
          placeholderTextColor={colors.textSecondary}
          value={query}
          onChangeText={(text) => {
            setQuery(text);
            exitSelect();
          }}
          autoFocus
          returnKeyType="search"
          autoCorrect={false}
        />
        <SearchKindControl
          value={kind}
          onChange={(next) => {
            setKind(next);
            exitSelect();
            void runSearch(query, next);
          }}
        />
        {error ? (
          <ErrorStateCard
            testID="search-error"
            message={error}
            onRetry={() => void runSearch(query, kind)}
          />
        ) : null}
        {!active ? (
          <Text style={[typography.bodyMd, styles.hint]}>
            Ketik untuk mencari di catatan, nama kategori, dan nama dompet —
            atau pilih jenis di atas.
          </Text>
        ) : (
          <>
            <View style={styles.toolbar}>
              {selecting ? (
                <>
                  <Pressable
                    testID="search-select-cancel"
                    accessibilityRole="button"
                    accessibilityLabel="Batalkan pilihan"
                    onPress={exitSelect}
                    hitSlop={spacing.sm}
                  >
                    <Text style={[typography.labelUppercase, styles.action]}>
                      Batal
                    </Text>
                  </Pressable>
                  <Text
                    testID="search-select-count"
                    style={[typography.labelUppercase, styles.meta]}
                  >
                    {selectedIds.length} dipilih
                  </Text>
                  <Pressable
                    testID="search-select-apply"
                    accessibilityRole="button"
                    accessibilityLabel="Ubah kategori yang dipilih"
                    disabled={selectedIds.length === 0}
                    onPress={() => {
                      setChoosingCategory(true);
                      setPickedCategory(null);
                    }}
                    hitSlop={spacing.sm}
                  >
                    <Text
                      style={[
                        typography.labelUppercase,
                        selectedIds.length === 0 ? styles.meta : styles.action,
                      ]}
                    >
                      Ubah
                    </Text>
                  </Pressable>
                </>
              ) : (
                <>
                  <Text style={[typography.labelUppercase, styles.meta]}>
                    {resultLabel}
                  </Text>
                  <Pressable
                    testID="search-select-toggle"
                    accessibilityRole="button"
                    accessibilityLabel="Pilih beberapa transaksi"
                    onPress={() => {
                      setSelecting(true);
                      setSelectHint(null);
                    }}
                    hitSlop={spacing.sm}
                  >
                    <Text style={[typography.labelUppercase, styles.action]}>
                      Pilih
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
            {selectHint ? (
              <Text
                testID="search-select-hint"
                style={[typography.bodySm, styles.hintInline]}
              >
                {selectHint}
              </Text>
            ) : null}
            {selecting && choosingCategory && lockedKind ? (
              <View style={styles.picker}>
                <CategoryGrid
                  testID="search-bulk-categories"
                  categories={categories}
                  kind={lockedKind}
                  selectedId={pickedCategory?.id ?? null}
                  onSelect={setPickedCategory}
                />
                {pickedCategory ? (
                  <View style={styles.confirm}>
                    <Text style={[typography.bodyMd, styles.confirmText]}>
                      Ubah {selectedIds.length} transaksi ke{' '}
                      {pickedCategory.name}?
                    </Text>
                    <View style={styles.confirmRow}>
                      <Pressable
                        testID="search-bulk-cancel"
                        accessibilityRole="button"
                        accessibilityLabel="Batalkan ubah kategori"
                        onPress={() => {
                          setChoosingCategory(false);
                          setPickedCategory(null);
                        }}
                        hitSlop={spacing.sm}
                      >
                        <Text
                          style={[typography.labelUppercase, styles.meta]}
                        >
                          Batal
                        </Text>
                      </Pressable>
                      <Pressable
                        testID="search-bulk-confirm"
                        accessibilityRole="button"
                        accessibilityLabel={`Ubah ${selectedIds.length} transaksi`}
                        disabled={applying}
                        onPress={() => void applyBulk()}
                        hitSlop={spacing.sm}
                      >
                        <Text
                          style={[typography.labelUppercase, styles.action]}
                        >
                          {applying ? 'Menyimpan…' : 'Ubah'}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            ) : null}
            <View style={styles.results}>
              <TransactionHistoryList
                testID="search-results"
                transactions={results}
                loading={loading}
                loadingMore={loadingMore}
                hasMore={hasMore}
                onEndReached={() => {
                  if (hasMore && !loadingMore) loadMore();
                }}
                emptyLabel={emptyLabel}
                onPressTransaction={onPressRow}
                selecting={selecting}
                selectedIds={selectedIds}
              />
            </View>
          </>
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
  results: {
    flex: 1,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  meta: {
    color: colors.textSecondary,
  },
  action: {
    color: colors.accent,
  },
  hint: {
    paddingVertical: spacing.md,
    color: colors.textSecondary,
  },
  hintInline: {
    color: colors.textSecondary,
  },
  error: {
    color: colors.error,
  },
  picker: {
    gap: spacing.sm,
  },
  confirm: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
  confirmText: {
    color: colors.textPrimary,
  },
  confirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
