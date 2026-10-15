/**
 * Analytics context — the selected range + wallet filter, and the overview
 * payload that follows from them.
 *
 * Deliberately thin: it holds *inputs* (range, wallet) and the last server
 * response, and refetches the single `analytics_overview` RPC whenever either
 * input changes. It never aggregates — every number it hands the screen comes
 * straight from Postgres (PRD §4.2).
 *
 * The "refetch on input change" is the one legitimate effect here (it is an
 * async fetch, not a synchronous `setState`), so it is safe with the
 * `react-hooks/set-state-in-effect` rule that T5 ran into.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { onLocalDataPurge } from '@/supabase';
import { dictionaryFor, useLanguage } from '@/i18n';

import { fetchCategorySeries, fetchMonthlySummary, fetchOverview, fetchTimezone, listWalletFilters } from './api';
import type { CategorySparkRow } from './api';
import {
  CUSTOM_RANGE,
  RANGE_PRESETS,
  isDailyCustom,
  isDailyRange,
  isEmptyRange,
  resolveCustomRange,
  resolveRange,
  type AnalyticsOverview,
  type AnalyticsRange,
  type CustomRange,
  type MonthlyComparison,
} from './domain';

type WalletFilter = { id: string; name: string };

type AnalyticsContextValue = {
  range: AnalyticsRange;
  setRange: (value: AnalyticsRange) => void;
  /** L4c: the picked custom window (`null` until the user applies one). */
  customRange: CustomRange | null;
  /** L4c: stores the window and selects it in one call (atomic by design). */
  setCustomRange: (value: CustomRange) => void;
  wallets: WalletFilter[];
  walletId: string | null;
  setWalletId: (value: string | null) => void;
  overview: AnalyticsOverview | null;
  loading: boolean;
  error: string | null;
  isEmpty: boolean;
  /** Current vs previous calendar month from `v_monthly_summary` (A6). */
  monthly: MonthlyComparison | null;
  monthlyLoading: boolean;
  /** Per-category series rows for sparklines (P2b-spark, best-effort). */
  sparks: CategorySparkRow[];
  refresh: () => Promise<void>;
};

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const [range, setRangeState] = useState<AnalyticsRange>('1M');
  const [customRange, setCustomRangeState] = useState<CustomRange | null>(null);
  const [wallets, setWallets] = useState<WalletFilter[]>([]);
  const [walletId, setWalletIdState] = useState<string | null>(null);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  // P2b-spark rows: same range/wallet inputs as the overview; a failed
  // series only hides the mini-trends, never the screen.
  const [sparks, setSparks] = useState<CategorySparkRow[]>([]);
  // A6 monthly pair: independent of the selected range — it always shows the
  // current calendar month vs the previous one.
  const [monthly, setMonthly] = useState<MonthlyComparison | null>(null);
  const [monthlyLoaded, setMonthlyLoaded] = useState(false);

  const mounted = useRef(true);
  // Monotonic request id: a slow response for an older range must not overwrite
  // the payload for the range the user has since selected.
  const requestId = useRef(0);
  // C6: load-error copy follows the OS language (ADR-0008).
  const language = useLanguage();
  const loadError = dictionaryFor(language).analytics.loadError;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Wallet chips + timezone are fetched once; they do not depend on the range.
  // The same loader backs `refresh()` so a new/archived wallet shows up in
  // the filter without a restart.
  const loadWallets = useCallback((): Promise<void> => {
    return listWalletFilters()
      .then((next) => {
        if (mounted.current) setWallets(next);
      })
      .catch(() => {
        // A missing wallet list only removes the filter, not the screen.
        if (mounted.current) setWallets([]);
      });
  }, []);

  useEffect(() => {
    void loadWallets();
  }, [loadWallets]);

  // Sign out clears the cached payload so the next user never sees stale money.
  useEffect(
    () =>
      onLocalDataPurge(() => {
        if (!mounted.current) return;
        setOverview(null);
        setLoadedKey(null);
        setWalletIdState(null);
        setRangeState('1M');
        setCustomRangeState(null);
        setWallets([]);
        setError(null);
        setMonthly(null);
        setMonthlyLoaded(false);
        setSparks([]);
      }),
    [],
  );

  // State updates deliberately happen inside `.then`/`.catch` callbacks, never
  // synchronously in the effect body: the `react-hooks/set-state-in-effect`
  // rule (which T5 ran into) rejects a synchronous setState, and doing it here
  // would also clear a freshly-selected range mid-render.
  const load = useCallback(
    (
      nextRange: AnalyticsRange,
      nextWalletId: string | null,
      nextCustom: CustomRange | null,
    ): Promise<void> => {
      const ticket = ++requestId.current;
      // L4c: the custom window resolves through its own pure function, but
      // the RPC sees the same `DateRange` shape — its signature is untouched.
      const window =
        nextRange === CUSTOM_RANGE && nextCustom
          ? resolveCustomRange(nextCustom)
          : resolveRange(nextRange === CUSTOM_RANGE ? '1M' : nextRange);
      const daily =
        nextRange === CUSTOM_RANGE && nextCustom
          ? isDailyCustom(window)
          : isDailyRange(nextRange === CUSTOM_RANGE ? '1M' : nextRange);

      return fetchTimezone()
        .then((tz) =>
          fetchOverview({
            range: window,
            tz,
            walletId: nextWalletId,
            daily,
          }).then((payload) => {
            if (!mounted.current || ticket !== requestId.current) return;
            setOverview(payload);
            setLoadedKey(rangeKey(nextRange, nextWalletId, nextCustom));
            setError(null);
            // Sparklines ride along best-effort (P2b-spark).
            const sparkRange = window;
            const sparkDaily = daily;
            void fetchCategorySeries({
              range: sparkRange,
              tz,
              walletId: nextWalletId,
              daily: sparkDaily,
            })
              .then((rows) => {
                if (mounted.current && ticket === requestId.current) {
                  setSparks(rows);
                }
              })
              .catch(() => {
                if (mounted.current && ticket === requestId.current) {
                  setSparks([]);
                }
              });
          }),
        )
        .catch((cause: unknown) => {
          if (!mounted.current || ticket !== requestId.current) return;
          setError(
            cause instanceof Error ? cause.message : loadError,
          );
        });
    },
    [loadError],
  );

  // The effect only *starts* the async fetch. `loading` is derived: the screen
  // is loading while the loaded key does not yet match the requested one.
  useEffect(() => {
    void load(range, walletId, customRange);
  }, [load, range, walletId, customRange]);

  // A6: the monthly pair follows the same shape — fetched once on mount and
  // re-read by `refresh()` (so every transaction mutation refreshes it), but
  // never on range/wallet changes, which it does not depend on. Failures are
  // best-effort: a missing summary hides the card's numbers, not the screen.
  const loadMonthly = useCallback((): Promise<void> => {
    return fetchTimezone()
      .then((tz) => fetchMonthlySummary(tz))
      .then((payload) => {
        if (!mounted.current) return;
        setMonthly(payload);
        setMonthlyLoaded(true);
      })
      .catch(() => {
        if (!mounted.current) return;
        setMonthlyLoaded(true);
      });
  }, []);

  useEffect(() => {
    void loadMonthly();
  }, [loadMonthly]);

  const requestedKey = rangeKey(range, walletId, customRange);
  const loading = loadedKey !== requestedKey && error === null;

  const setRange = useCallback(
    (value: AnalyticsRange) => {
      // `CUSTOM` without a picked window is not a range yet — it can only
      // arrive via `setCustomRange`, which stores both atomically.
      if (value === CUSTOM_RANGE && customRange === null) return;
      if (value !== CUSTOM_RANGE && !RANGE_PRESETS.includes(value)) return;
      setRangeState(value);
    },
    [customRange],
  );

  const setCustomRange = useCallback((value: CustomRange) => {
    setCustomRangeState(value);
    setRangeState(CUSTOM_RANGE);
  }, []);

  const setWalletId = useCallback((value: string | null) => {
    setWalletIdState(value);
  }, []);

  const refresh = useCallback(
    () =>
      Promise.all([
        load(range, walletId, customRange),
        loadWallets(),
        loadMonthly(),
      ]).then(() => undefined),
    [load, loadWallets, loadMonthly, range, walletId, customRange],
  );

  const value = useMemo<AnalyticsContextValue>(
    () => ({
      range,
      setRange,
      customRange,
      setCustomRange,
      wallets,
      walletId,
      setWalletId,
      overview,
      loading,
      error,
      isEmpty: isEmptyRange(overview),
      monthly,
      monthlyLoading: !monthlyLoaded,
      sparks,
      refresh,
    }),
    [
      range,
      setRange,
      customRange,
      setCustomRange,
      wallets,
      walletId,
      setWalletId,
      overview,
      loading,
      error,
      refresh,
      monthly,
      monthlyLoaded,
      sparks,
    ],
  );

  return (
    <AnalyticsContext.Provider value={value}>
      {children}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics(): AnalyticsContextValue {
  const context = useContext(AnalyticsContext);
  if (!context) {
    throw new Error('useAnalytics harus dipakai di dalam AnalyticsProvider');
  }
  return context;
}

/** Identity of an overview request: range (+ custom window) + wallet. */
function rangeKey(
  range: AnalyticsRange,
  walletId: string | null,
  custom: CustomRange | null,
): string {
  const rangePart =
    range === CUSTOM_RANGE && custom
      ? `${range}:${custom.startKey}|${custom.endKey}`
      : range;
  return `${rangePart}:${walletId ?? 'all'}`;
}
