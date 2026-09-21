/**
 * Recurring context — the "Transaksi berulang" rules plus the catch-up
 * pipeline (V3, ADR-0005).
 *
 * Responsibilities, deliberately narrow:
 *  - the caller's rules (with wallet/category display names joined);
 *  - create/update/pause/delete of rules (kind locked after creation);
 *  - `runCatchUp`: the `run_recurring_catchup` RPC, then — only when it
 *    actually wrote rows — refresh wallets/transactions/budgets and evaluate
 *    alerts, so an auto-born bill moves Saldo, Spent and Alert like a manual
 *    one. Failures are swallowed: catch-up retries on the next foreground,
 *    and must never break app open.
 *
 * Catch-up runs on app open and on foreground (`AppState`), never on a timer
 * and never from a notification — there is no cron and no server-push in v1.1.
 */
import { AppState } from 'react-native';
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
import { useAuth } from '@/features/auth';
import { useAnalytics } from '@/features/analytics';
import { useBudgets } from '@/features/budgets';
import { useTransactions } from '@/features/transactions';
import { useWallets } from '@/features/wallets';

import {
  createRecurringRule,
  deleteRecurringRule,
  listRecurringRules,
  runCatchUpRpc,
  setRecurringRuleStatus,
  updateRecurringRule,
} from './api';
import type { RecurringKind, RecurringRule, RuleStatus } from './domain';

type RecurringContextValue = {
  rules: RecurringRule[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  save: (input: SaveRecurringInput) => Promise<void>;
  setPaused: (input: { id: string; paused: boolean }) => Promise<void>;
  remove: (id: string) => Promise<void>;
  /**
   * Runs catch-up now. Returns occurrences written (0 = nothing due, or a
   * swallowed failure — the next foreground retries). Never throws.
   */
  runCatchUp: () => Promise<number>;
};

export type SaveRecurringInput = {
  /** Present = edit (kind locked), absent = create. */
  id?: string;
  userId: string;
  kind: RecurringKind;
  amount: number;
  walletId: string;
  categoryId: string;
  dueDay: number | null;
  dueLast: boolean;
  startsOn: string;
  endsOn: string | null;
};

const RecurringContext = createContext<RecurringContextValue | null>(null);

export function RecurringProvider({ children }: { children: ReactNode }) {
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  // Guards catch-up against concurrent runs (mount racing a foreground
  // event): without it the same dues could be attempted twice before either
  // RPC lands (the unique key would still save us, but the refresh storm
  // would not).
  const catching = useRef(false);

  const { session, status } = useAuth();
  const { refresh: refreshWallets } = useWallets();
  const { refresh: refreshTransactions } = useTransactions();
  const { refresh: refreshBudgets, evaluateAndAlert } = useBudgets();
  const { refresh: refreshAnalytics } = useAnalytics();

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Promise-chain body (not async/await): state updates happen inside
  // `.then`/`.catch`, never synchronously in an effect body, so the effect
  // below may call `void refresh()` (`react-hooks/set-state-in-effect`,
  // same shape as the budgets context).
  const refresh = useCallback((): Promise<void> => {
    return listRecurringRules()
      .then((next) => {
        if (!mounted.current) return;
        setRules(next);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (!mounted.current) return;
        setError(
          cause instanceof Error
            ? cause.message
            : 'Gagal memuat aturan berulang',
        );
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
  }, []);

  const runCatchUp = useCallback(async (): Promise<number> => {
    const userId = session?.user.id;
    if (!userId || catching.current) return 0;
    catching.current = true;

    try {
      const wrote = await runCatchUpRpc();
      // Rules may have self-healed (archived wallet → paused), so re-read
      // even when nothing was born.
      await refresh().catch(() => undefined);
      if (wrote > 0) {
        await Promise.all([
          refreshWallets().catch(() => undefined),
          refreshTransactions().catch(() => undefined),
          refreshBudgets().catch(() => undefined),
          refreshAnalytics().catch(() => undefined),
        ]);
        try {
          await evaluateAndAlert({ userId });
        } catch {
          // In-app banner on the Budgets tab retries on its own refresh.
        }
      }
      return wrote;
    } catch {
      return 0;
    } finally {
      catching.current = false;
    }
  }, [
    session?.user.id,
    refresh,
    refreshWallets,
    refreshTransactions,
    refreshBudgets,
    refreshAnalytics,
    evaluateAndAlert,
  ]);

  // App open + foreground (ADR-0005). Authenticated only — the RPC rejects
  // anonymous callers (42501) and there is nothing to catch up signed out.
  // State updates land in promise callbacks, never synchronously in the
  // effect body (`react-hooks/set-state-in-effect`, cf. T5/T6).
  useEffect(() => {
    if (status !== 'authenticated') return;

    let cancelled = false;
    void refresh();
    void runCatchUp();

    const subscription = AppState.addEventListener('change', (state) => {
      if (cancelled || state !== 'active') return;
      void refresh();
      void runCatchUp();
    });

    return () => {
      cancelled = true;
      subscription.remove();
    };
  }, [status, refresh, runCatchUp]);

  // Sign out drops the cached rules.
  useEffect(
    () =>
      onLocalDataPurge(() => {
        if (!mounted.current) return;
        setRules([]);
        setError(null);
      }),
    [],
  );

  const save = useCallback(
    async (input: SaveRecurringInput): Promise<void> => {
      if (input.id) {
        await updateRecurringRule({
          id: input.id,
          amount: input.amount,
          walletId: input.walletId,
          categoryId: input.categoryId,
          dueDay: input.dueDay,
          dueLast: input.dueLast,
          endsOn: input.endsOn,
        });
      } else {
        await createRecurringRule({
          userId: input.userId,
          kind: input.kind,
          amount: input.amount,
          walletId: input.walletId,
          categoryId: input.categoryId,
          dueDay: input.dueDay,
          dueLast: input.dueLast,
          startsOn: input.startsOn,
          endsOn: input.endsOn,
        });
      }
      await refresh();
    },
    [refresh],
  );

  const setPaused = useCallback(
    async (input: { id: string; paused: boolean }): Promise<void> => {
      const status: RuleStatus = input.paused ? 'paused' : 'active';
      await setRecurringRuleStatus({ id: input.id, status });
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string): Promise<void> => {
      await deleteRecurringRule(id);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo(
    () => ({ rules, loading, error, refresh, save, setPaused, remove, runCatchUp }),
    [rules, loading, error, refresh, save, setPaused, remove, runCatchUp],
  );

  return (
    <RecurringContext.Provider value={value}>
      {children}
    </RecurringContext.Provider>
  );
}

export function useRecurring(): RecurringContextValue {
  const context = useContext(RecurringContext);
  if (!context) {
    throw new Error('useRecurring harus dipakai di dalam RecurringProvider');
  }
  return context;
}
