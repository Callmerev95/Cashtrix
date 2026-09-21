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

import { fetchOverview, fetchTimezone, listWalletFilters } from './api';
import {
  RANGE_PRESETS,
  isDailyRange,
  isEmptyRange,
  resolveRange,
  type AnalyticsOverview,
  type RangePreset,
} from './domain';

type WalletFilter = { id: string; name: string };

type AnalyticsContextValue = {
  range: RangePreset;
  setRange: (value: RangePreset) => void;
  wallets: WalletFilter[];
  walletId: string | null;
  setWalletId: (value: string | null) => void;
  overview: AnalyticsOverview | null;
  loading: boolean;
  error: string | null;
  isEmpty: boolean;
  refresh: () => Promise<void>;
};

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const [range, setRangeState] = useState<RangePreset>('1M');
  const [wallets, setWallets] = useState<WalletFilter[]>([]);
  const [walletId, setWalletIdState] = useState<string | null>(null);
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  // Monotonic request id: a slow response for an older range must not overwrite
  // the payload for the range the user has since selected.
  const requestId = useRef(0);

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
        setWallets([]);
        setError(null);
      }),
    [],
  );

  // State updates deliberately happen inside `.then`/`.catch` callbacks, never
  // synchronously in the effect body: the `react-hooks/set-state-in-effect`
  // rule (which T5 ran into) rejects a synchronous setState, and doing it here
  // would also clear a freshly-selected range mid-render.
  const load = useCallback(
    (nextRange: RangePreset, nextWalletId: string | null): Promise<void> => {
      const ticket = ++requestId.current;

      return fetchTimezone()
        .then((tz) =>
          fetchOverview({
            range: resolveRange(nextRange),
            tz,
            walletId: nextWalletId,
            daily: isDailyRange(nextRange),
          }),
        )
        .then((payload) => {
          if (!mounted.current || ticket !== requestId.current) return;
          setOverview(payload);
          setLoadedKey(rangeKey(nextRange, nextWalletId));
          setError(null);
        })
        .catch((cause: unknown) => {
          if (!mounted.current || ticket !== requestId.current) return;
          setError(
            cause instanceof Error ? cause.message : 'Gagal memuat analytics',
          );
        });
    },
    [],
  );

  // The effect only *starts* the async fetch. `loading` is derived: the screen
  // is loading while the loaded key does not yet match the requested one.
  useEffect(() => {
    void load(range, walletId);
  }, [load, range, walletId]);

  const requestedKey = rangeKey(range, walletId);
  const loading = loadedKey !== requestedKey && error === null;

  const setRange = useCallback((value: RangePreset) => {
    if (!RANGE_PRESETS.includes(value)) return;
    setRangeState(value);
  }, []);

  const setWalletId = useCallback((value: string | null) => {
    setWalletIdState(value);
  }, []);

  const refresh = useCallback(
    () => Promise.all([load(range, walletId), loadWallets()]).then(() => undefined),
    [load, loadWallets, range, walletId],
  );

  const value = useMemo<AnalyticsContextValue>(
    () => ({
      range,
      setRange,
      wallets,
      walletId,
      setWalletId,
      overview,
      loading,
      error,
      isEmpty: isEmptyRange(overview),
      refresh,
    }),
    [range, setRange, wallets, walletId, setWalletId, overview, loading, error, refresh],
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

/** Identity of an overview request: range + wallet. */
function rangeKey(range: RangePreset, walletId: string | null): string {
  return `${range}:${walletId ?? 'all'}`;
}
