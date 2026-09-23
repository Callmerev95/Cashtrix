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
 * The provider evaluates after every spent-changing write (PRD Epic E): a
 * transaction commit, a budget save, recurring catch-up births, and an undo
 * restore all call `evaluateAndAlert`, which re-reads the server status
 * first (V6: the cached list is pre-commit truth — evaluating it missed
 * every crossing). Deleting a transaction only lowers spent and never
 * evaluates; editing or deleting never clears an already-fired alert — the
 * dedup row stays, so there is no double-fire in the same month.
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
  listAlerts,
  listBudgetStatus,
  markAlertRead,
  markAllAlertsRead,
  recordAlert,
  upsertBudget,
} from './api';
import {
  thresholdForState,
  unreadAlerts,
  type BudgetAlertThreshold,
  type BudgetState,
  type BudgetStatus,
  type InboxAlert,
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
  /** Persisted inbox (A5): fired alerts newest-first with read flags. */
  alerts: InboxAlert[];
  unreadCount: number;
  alertsError: string | null;
  refresh: () => Promise<void>;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  save: (input: {
    userId: string;
    categoryId: string;
    amountLimit: number;
  }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /**
   * Checks rows against thresholds, records newly-crossed ones, and notifies.
   * Without explicit `rows` the status is re-read from the server first: the
   * caller typically just committed a write, so the cached list is still the
   * pre-commit truth and evaluating it would miss the crossing it just made
   * (V6 gate finding — alerts never fired). A failed re-read falls back to
   * the cache rather than dropping the evaluation entirely. Never throws.
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
  const [alerts, setAlerts] = useState<InboxAlert[]>([]);
  const [alertsError, setAlertsError] = useState<string | null>(null);

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

  // A5 inbox read. Independent from the status load below: an additive read
  // must never fail the Budgets screen (e.g. an app version running ahead of
  // its migration). Failures surface as `alertsError` on the inbox only.
  const loadAlerts = useCallback((): Promise<void> => {
    return listAlerts()
      .then((next) => {
        if (!mounted.current) return;
        setAlerts(next);
        setAlertsError(null);
      })
      .catch((cause: unknown) => {
        if (!mounted.current) return;
        setAlertsError(
          cause instanceof Error ? cause.message : 'Gagal memuat notifikasi',
        );
      });
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
          // A5: the inbox re-reads so the bell dot lights on this same commit
          // (never throws — see loadAlerts).
          await loadAlerts();
        }

        return fired;
      } finally {
        evaluating.current = false;
      }
    },
    [loadAlerts],
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
        setAlerts([]);
        setAlertsError(null);
        setError(null);
      }),
    [],
  );

  useEffect(() => {
    void load();
    void loadAlerts();
  }, [load, loadAlerts]);

  const loading = loadedMonth === null && error === null;

  const refresh = useCallback(
    () => Promise.all([load(), loadAlerts()]).then(() => undefined),
    [load, loadAlerts],
  );

  const evaluateAndAlert = useCallback(
    async (input: {
      userId: string;
      rows?: BudgetStatus[];
    }): Promise<FiredAlert[]> => {
      let rows = input.rows;
      if (!rows) {
        try {
          const tz = await fetchTimezone();
          const current = await fetchCurrentMonth(tz);
          rows = await listBudgetStatus(current);
        } catch {
          // Server unreadable — evaluate the cached list instead of going
          // silent; a crossing already visible there still deserves its alert.
          rows = budgets;
        }
      }
      return evaluateRows(input.userId, rows);
    },
    [budgets, evaluateRows],
  );

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

      // A budget created above already-crossed spent notifies immediately —
      // otherwise it stays silent until the next transaction save.
      // Best-effort and dedup-safe; never throws (see evaluateAndAlert).
      await evaluateAndAlert({ userId: input.userId });
    },
    [budgets.length, evaluateAndAlert, load, month],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await deleteBudget(id);
      await load();
    },
    [load],
  );

  const dismissAlert = useCallback((index: number) => {
    setRecentAlerts((current) => current.filter((_, i) => i !== index));
  }, []);

  // A5: pessimistic mark-read — the server commits first, the dot follows.
  // A foreign id is an RLS no-op server-side; the local filter then changes
  // nothing, which is the honest render of that outcome.
  const markRead = useCallback(async (id: string) => {
    await markAlertRead(id);
    if (!mounted.current) return;
    const stamped = new Date().toISOString();
    setAlerts((current) =>
      current.map((alert) =>
        alert.id === id ? { ...alert, readAt: alert.readAt ?? stamped } : alert,
      ),
    );
  }, []);

  const markAllRead = useCallback(async () => {
    await markAllAlertsRead();
    if (!mounted.current) return;
    const stamped = new Date().toISOString();
    setAlerts((current) =>
      current.map((alert) =>
        alert.readAt === null ? { ...alert, readAt: stamped } : alert,
      ),
    );
  }, []);

  const unreadCount = useMemo(() => unreadAlerts(alerts).length, [alerts]);

  const value = useMemo<BudgetsContextValue>(
    () => ({
      month,
      budgets,
      loading,
      error,
      recentAlerts,
      alerts,
      unreadCount,
      alertsError,
      refresh,
      markRead,
      markAllRead,
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
      alerts,
      unreadCount,
      alertsError,
      refresh,
      markRead,
      markAllRead,
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
