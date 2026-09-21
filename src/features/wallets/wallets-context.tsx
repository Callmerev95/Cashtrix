/**
 * Wallet context — one fetch of `v_wallet_balances` shared by the Dashboard
 * hero card, the wallet list and the delete/reassign flow.
 *
 * Deliberately small: balances are read from the view, never derived locally.
 * `refresh()` is exposed so a screen can re-read after it writes; the
 * `onLocalDataPurge` hook makes sure a sign-out drops the cached array
 * (PRD §2.3 Epic A story 7).
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

import { listWallets } from './api';
import {
  activeWallets,
  archivedWallets,
  summarizeWallets,
  type Wallet,
  type WalletSummary,
} from './domain';

type WalletsContextValue = {
  /** Active (unarchived) wallets — everything the Dashboard and pickers show. */
  wallets: Wallet[];
  /** Archived wallets — rendered only by the manage screen's archive section. */
  archivedWallets: Wallet[];
  summary: WalletSummary;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

const EMPTY_SUMMARY: WalletSummary = {
  totalBalance: 0,
  count: 0,
  remainingSlots: 0,
};

const WalletsContext = createContext<WalletsContextValue | null>(null);

export function WalletsProvider({ children }: { children: ReactNode }) {
  const [allWallets, setAllWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const inflight = useRef<Promise<void> | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    // Reuse the in-flight fetch when a save races a second refresh (e.g. the
    // post-save `refreshWallets + refreshBudgets` pair): the second caller
    // awaits the same promise instead of firing a duplicate query.
    if (!inflight.current) {
      inflight.current = (async () => {
        try {
          const next = await listWallets();
          if (!mounted.current) return;
          setAllWallets(next);
          setError(null);
        } catch (cause) {
          if (!mounted.current) return;
          setError(
            cause instanceof Error ? cause.message : 'Gagal memuat dompet',
          );
        } finally {
          if (mounted.current) setLoading(false);
        }
      })().finally(() => {
        inflight.current = null;
      });
    }
    return inflight.current;
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Kicked off here (not called synchronously) so the state update lands in
    // the promise callback — the same shape as the auth context's restore.
    listWallets()
      .then((next) => {
        if (cancelled || !mounted.current) return;
        setAllWallets(next);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled || !mounted.current) return;
        setError(cause instanceof Error ? cause.message : 'Gagal memuat dompet');
      })
      .finally(() => {
        if (!cancelled && mounted.current) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // Sign out clears the in-memory copy along with the persisted cache.
  useEffect(
    () =>
      onLocalDataPurge(() => {
        if (!mounted.current) return;
        setAllWallets([]);
        setError(null);
      }),
    [],
  );

  const wallets = useMemo(() => activeWallets(allWallets), [allWallets]);
  const archived = useMemo(() => archivedWallets(allWallets), [allWallets]);
  const summary = useMemo(() => summarizeWallets(wallets), [wallets]);

  const value = useMemo(
    () => ({ wallets, archivedWallets: archived, summary, loading, error, refresh }),
    [wallets, archived, summary, loading, error, refresh],
  );

  return (
    <WalletsContext.Provider value={value}>{children}</WalletsContext.Provider>
  );
}

export function useWallets(): WalletsContextValue {
  const context = useContext(WalletsContext);
  if (!context) {
    throw new Error('useWallets harus dipakai di dalam WalletsProvider');
  }
  return context;
}

export { EMPTY_SUMMARY };
