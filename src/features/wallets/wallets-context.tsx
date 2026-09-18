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
import { summarizeWallets, type Wallet, type WalletSummary } from './domain';

type WalletsContextValue = {
  wallets: Wallet[];
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
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    try {
      const next = await listWallets();
      if (!mounted.current) return;
      setWallets(next);
      setError(null);
    } catch (cause) {
      if (!mounted.current) return;
      setError(
        cause instanceof Error ? cause.message : 'Gagal memuat wallet',
      );
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    // Kicked off here (not called synchronously) so the state update lands in
    // the promise callback — the same shape as the auth context's restore.
    listWallets()
      .then((next) => {
        if (cancelled || !mounted.current) return;
        setWallets(next);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled || !mounted.current) return;
        setError(cause instanceof Error ? cause.message : 'Gagal memuat wallet');
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
        setWallets([]);
        setError(null);
      }),
    [],
  );

  const summary = useMemo(() => summarizeWallets(wallets), [wallets]);

  const value = useMemo(
    () => ({ wallets, summary, loading, error, refresh }),
    [wallets, summary, loading, error, refresh],
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
