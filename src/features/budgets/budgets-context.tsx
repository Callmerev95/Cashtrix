/**
 * Budgets context — the current month's `v_budget_status` rows plus the alert
 * pipeline.
 *
 * Responsibilities, deliberately narrow:
 *  - the current month (from `current_month(tz)` — never derived client-side)
 *    and its status rows (server-aggregated, like analytics);
 *  - create/update/delete of month budgets (upsert on the unique key);
 *  - `evaluateAndAlert`: for each row past a threshold, `recordAlert` (dedup
 *    via `ON CONFLICT DO NOTHING`) and, only when the row is *newly* fired,
 *    queue an in-app alert + best-effort local push.
 *
 * The provider is evaluated in two places (PRD Epic E): right after a
 * transaction commits (the add-transaction screen calls `evaluateAndAlert`
 * with fresh rows) and when the budgets screen loads/foregrounds (it calls
 * `refresh`, which re-evaluates). Editing or deleting a transaction never
 * clears an already-fired alert — the dedup row stays, so there is no
 * double-fire in the same month.
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
import {
  budgetThresholdEvent,
  trackEvent,
} from '@/features/observability';
import { formatGrouped } from '../transactions/domain';

import {
  deleteBudget,
  fetchCurrentMonth,
  fetchTimezone,
  listBudgetStatus,
  recordAlert,
  upsertBudget,
} from './api';
import {
  thresholdForState,
  type BudgetAlertThreshold,
  type BudgetState,
  type BudgetStatus,
} from './domain';
import {
  alertCopy,
  getPushPermission,
  installNotificationHandler,
  requestPushPermission,
  sendBudgetAlert,
} from './notifications';

export type FiredAlert = {
  categoryId: string;
  categoryName: string;
  month: string;
  threshold: BudgetAlertThreshold;
  state: BudgetState;
  spent: number;
  amountLimit: number;
};

type BudgetsContextValue = {
  /** Day-1 `YYYY-MM-DD` of the running month (`current_month(tz)`). */
  month: string | null;
  budgets: BudgetStatus[];
  loading: boolean;
  error: string | null;
  /** Alerts fired this session — rendered as in-app banners (work offline). */
  recentAlerts: FiredAlert[];
  refresh: () => Promise<void>;
  save: (input: {
    userId: string;
    categoryId: string;
    amountLimit: number;
  }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /**
   * Checks rows against thresholds, records newly-crossed ones, and notifies.
   * Pass fresh rows after a transaction commit; defaults to the cached list.
   */
  evaluateAndAlert: (input: {
    userId: string;
    rows?: BudgetStatus[];
  }) => Promise<FiredAlert[]>;
  dismissAlert: (index: number) => void;
};

const BudgetsContext = createContext<BudgetsContextValue | null>(null);

export function BudgetsProvider({ children }: { children: ReactNode }) {
  const [month, setMonth] = useState<string | null>(null);
  const [budgets, setBudgets] = useState<BudgetStatus[]>([]);
  const [loadedMonth, setLoadedMonth] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [recentAlerts, setRecentAlerts] = useState<FiredAlert[]>([]);

  const mounted = useRef(true);
  const inflight = useRef<Promise<void> | null>(null);
  // Guards `evaluateAndAlert` against concurrent runs (a save racing a
  // foreground refresh): without it the same crossing could notify twice
  // before either `recordAlert` lands.
  const evaluating = useRef(false);

  useEffect(() => {
    mounted.current = true;
    installNotificationHandler();
    return () => {
      mounted.current = false;
    };
  }, []);

  const evaluateRows = useCallback(
    async (userId: string, rows: BudgetStatus[]): Promise<FiredAlert[]> => {
      if (evaluating.current) return [];
      evaluating.current = true;

      try {
        const fired: FiredAlert[] = [];
        for (const row of rows) {
          const threshold = thresholdForState(row.state);
          if (!threshold) continue;

          let isNew = false;
          try {
            isNew = await recordAlert({
              userId,
              categoryId: row.categoryId,
              month: row.month,
              threshold,
            });
          } catch {
            // A failed dedup write must not block the remaining budgets — the
            // next refresh retries it.
            continue;
          }
          if (!isNew) continue;

          fired.push({
            categoryId: row.categoryId,
            categoryName: row.categoryName,
            month: row.month,
            threshold,
            state: row.state,
            spent: row.spent,
            amountLimit: row.amountLimit,
          });
        }

        if (fired.length > 0) {
          if (mounted.current) {
            setRecentAlerts((current) => [...fired, ...current].slice(0, 5));
          }
          // T10 (issue #11): `budget_threshold_reached` carries the threshold
          // key + month + category only — never `spent`/`amountLimit` (those
          // are amounts). Best-effort, like the push below.
          for (const alert of fired) {
            try {
              trackEvent(
                budgetThresholdEvent({
                  // The DB key (`warning_80`/`exceeded_100`) stays in budgets;
                  // the analytics taxonomy uses the PRD's 80/100 numbers.
                  threshold:
                    alert.threshold === 'warning_80' ? 80 : 100,
                  month: alert.month,
                  categoryId: alert.categoryId,
                }),
              );
            } catch {
              // Analytics never blocks an alert.
            }
          }
          for (const alert of fired) {
            const copy = alertCopy({
              categoryName: alert.categoryName,
              threshold: alert.threshold,
              spent: `Rp ${formatGrouped(alert.spent)}`,
              limit: `Rp ${formatGrouped(alert.amountLimit)}`,
            });
            // Best-effort: when push is unavailable the in-app banner above is
            // the notification (AC #8 — works without permission).
            await sendBudgetAlert(copy);
          }
        }

        return fired;
      } finally {
        evaluating.current = false;
      }
    },
    [],
  );

  // State updates happen inside `.then`/`.catch`, never synchronously in the
  // effect body (`react-hooks/set-state-in-effect`, cf. T5/T6).
  const load = useCallback((): Promise<void> => {
    // In-flight reuse (same as wallets/transactions refresh): a save racing a
    // second refresh awaits the same fetch instead of doubling it.
    if (!inflight.current) {
      inflight.current = fetchTimezone()
        .then((tz) => fetchCurrentMonth(tz))
        .then((current) =>
          listBudgetStatus(current).then((rows) => ({ current, rows })),
        )
        .then(({ current, rows }) => {
          if (!mounted.current) return;
          setMonth(current);
          setBudgets(rows);
          setLoadedMonth(current);
          setError(null);
        })
        .catch((cause: unknown) => {
          if (!mounted.current) return;
          setError(
            cause instanceof Error ? cause.message : 'Gagal memuat budget',
          );
        })
        .finally(() => {
          inflight.current = null;
        });
    }
    return inflight.current;
  }, []);

  // Sign out drops the cached month and every in-app alert.
  useEffect(
    () =>
      onLocalDataPurge(() => {
        if (!mounted.current) return;
        setMonth(null);
        setBudgets([]);
        setLoadedMonth(null);
        setRecentAlerts([]);
        setError(null);
      }),
    [],
  );

  useEffect(() => {
    void load();
  }, [load]);

  const loading = loadedMonth === null && error === null;

  const refresh = useCallback(() => load(), [load]);

  const save = useCallback(
    async (input: {
      userId: string;
      categoryId: string;
      amountLimit: number;
    }): Promise<void> => {
      const wasFirst = budgets.length === 0;

      let current = month;
      if (!current) {
        const tz = await fetchTimezone();
        current = await fetchCurrentMonth(tz);
      }

      await upsertBudget({
        userId: input.userId,
        categoryId: input.categoryId,
        month: current,
        amountLimit: input.amountLimit,
      });

      // Permission is asked exactly here — once, when the first budget exists
      // (AC #8). Later saves never prompt again.
      if (wasFirst) {
        const permission = await getPushPermission();
        if (permission === 'undetermined') {
          await requestPushPermission();
        }
      }

      await load();
    },
    [budgets.length, load, month],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await deleteBudget(id);
      await load();
    },
    [load],
  );

  const evaluateAndAlert = useCallback(
    async (input: {
      userId: string;
      rows?: BudgetStatus[];
    }): Promise<FiredAlert[]> => evaluateRows(input.userId, input.rows ?? budgets),
    [budgets, evaluateRows],
  );

  const dismissAlert = useCallback((index: number) => {
    setRecentAlerts((current) => current.filter((_, i) => i !== index));
  }, []);

  const value = useMemo<BudgetsContextValue>(
    () => ({
      month,
      budgets,
      loading,
      error,
      recentAlerts,
      refresh,
      save,
      remove,
      evaluateAndAlert,
      dismissAlert,
    }),
    [
      month,
      budgets,
      loading,
      error,
      recentAlerts,
      refresh,
      save,
      remove,
      evaluateAndAlert,
      dismissAlert,
    ],
  );

  return (
    <BudgetsContext.Provider value={value}>
      {children}
    </BudgetsContext.Provider>
  );
}

export function useBudgets(): BudgetsContextValue {
  const context = useContext(BudgetsContext);
  if (!context) {
    throw new Error('useBudgets harus dipakai di dalam BudgetsProvider');
  }
  return context;
}
