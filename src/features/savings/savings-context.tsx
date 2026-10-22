/**
 * Savings context — raw goal rows plus the wallet-derived view.
 *
 * There is deliberately no progress state here: `balance` comes from
 * `WalletsProvider` (`v_wallet_balances`), so any transaction/transfer
 * refresh moves the ring. Goals on archived wallets are hidden from the
 * active list but kept in `goalForWallet` so deleting a wallet still asks
 * about its target first.
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
import { useWallets } from '@/features/wallets/wallets-context';
import type { Wallet } from '@/features/wallets/domain';

import {
  createSavingsGoal,
  deleteSavingsGoal,
  listSavingsGoals,
  updateSavingsGoal,
  type SavingsGoalPatch,
} from './api';
import {
  availableWallets as availableWalletsFor,
  hiddenGoalCount as countHiddenGoals,
  type SavingsGoal,
  type SavingsGoalView,
} from './domain';

export type SavingsCreateInput = {
  walletId: string;
  name: string | null;
  targetAmount: number;
  targetDate: string | null;
};

type SavingsContextValue = {
  /** Goals whose wallet is active. Archived-wallet goals stay hidden. */
  goals: SavingsGoalView[];
  /** Number of goals attached to archived wallets. */
  hiddenGoalCount: number;
  /** Any goal (active or archived wallet) — the wallet-delete guard. */
  goalForWallet: (walletId: string) => SavingsGoalView | null;
  /** Active wallets still eligible for a new target. */
  availableWallets: Wallet[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  create: (input: SavingsCreateInput) => Promise<void>;
  update: (id: string, patch: SavingsGoalPatch) => Promise<void>;
  remove: (id: string) => Promise<void>;
};

const SavingsContext = createContext<SavingsContextValue | null>(null);

export function SavingsProvider({ children }: { children: ReactNode }) {
  const { wallets, archivedWallets } = useWallets();
  const [rows, setRows] = useState<SavingsGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const mounted = useRef(true);
  const inflight = useRef<Promise<void> | null>(null);
  const language = useLanguage();
  const loadError = dictionaryFor(language).savings.loadError;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    if (!inflight.current) {
      inflight.current = (async () => {
        try {
          const next = await listSavingsGoals();
          if (!mounted.current) return;
          setRows(next);
          setError(null);
        } catch (cause) {
          if (!mounted.current) return;
          setError(cause instanceof Error ? cause.message : loadError);
        } finally {
          if (mounted.current) setLoading(false);
        }
      })().finally(() => {
        inflight.current = null;
      });
    }
    return inflight.current;
  }, [loadError]);

  useEffect(() => {
    let cancelled = false;

    listSavingsGoals()
      .then((next) => {
        if (cancelled || !mounted.current) return;
        setRows(next);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled || !mounted.current) return;
        setError(cause instanceof Error ? cause.message : loadError);
      })
      .finally(() => {
        if (!cancelled && mounted.current) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadError]);

  useEffect(
    () =>
      onLocalDataPurge(() => {
        if (!mounted.current) return;
        setRows([]);
        setError(null);
        setLoading(false);
      }),
    [],
  );

  const walletById = useMemo(() => {
    const map = new Map<string, Wallet>();
    for (const wallet of [...wallets, ...archivedWallets]) {
      map.set(wallet.id, wallet);
    }
    return map;
  }, [wallets, archivedWallets]);

  const allGoals = useMemo<SavingsGoalView[]>(() => {
    const views: SavingsGoalView[] = [];
    for (const goal of rows) {
      const wallet = walletById.get(goal.walletId);
      if (!wallet) continue;
      views.push({
        ...goal,
        walletName: wallet.name,
        walletArchived: wallet.archivedAt !== null,
        balance: wallet.balance,
      });
    }
    return views;
  }, [rows, walletById]);

  const goals = useMemo(
    () => allGoals.filter((goal) => !goal.walletArchived),
    [allGoals],
  );

  const hiddenGoalCount = useMemo(
    () => countHiddenGoals(rows, archivedWallets),
    [rows, archivedWallets],
  );

  const goalForWallet = useCallback(
    (walletId: string) =>
      allGoals.find((goal) => goal.walletId === walletId) ?? null,
    [allGoals],
  );

  const availableWallets = useMemo(
    () => availableWalletsFor(wallets, rows),
    [wallets, rows],
  );

  const create = useCallback(
    async (input: SavingsCreateInput) => {
      await createSavingsGoal(input);
      await refresh();
    },
    [refresh],
  );

  const update = useCallback(
    async (id: string, patch: SavingsGoalPatch) => {
      await updateSavingsGoal(id, patch);
      await refresh();
    },
    [refresh],
  );

  const remove = useCallback(
    async (id: string) => {
      await deleteSavingsGoal(id);
      await refresh();
    },
    [refresh],
  );

  const value = useMemo(
    () => ({
      goals,
      hiddenGoalCount,
      goalForWallet,
      availableWallets,
      loading,
      error,
      refresh,
      create,
      update,
      remove,
    }),
    [
      goals,
      hiddenGoalCount,
      goalForWallet,
      availableWallets,
      loading,
      error,
      refresh,
      create,
      update,
      remove,
    ],
  );

  return (
    <SavingsContext.Provider value={value}>{children}</SavingsContext.Provider>
  );
}

export function useSavings(): SavingsContextValue {
  const context = useContext(SavingsContext);
  if (!context) {
    throw new Error('useSavings harus dipakai di dalam SavingsProvider');
  }
  return context;
}
