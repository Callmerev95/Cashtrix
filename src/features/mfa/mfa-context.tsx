/**
 * MFA context (C2, #53) — user-scoped 2FA state, mirroring the B4 lock shape.
 *
 * Holds the verified-TOTP answer ("is 2FA on?") so Profile and the enroll
 * screen never each list factors. Mounted innermost in `DataProviders`
 * (needs nothing but the session); sign-out drops the in-memory copy via
 * `onLocalDataPurge`, like every other provider. All state writes land in
 * promise callbacks, never synchronously in an effect body
 * (`react-hooks/set-state-in-effect`).
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

import { listMfaFactors, unenrollMfaFactor } from './api';
import { hasVerifiedTotp } from './domain';

type MfaContextValue = {
  /** True when a verified TOTP factor exists (2FA is on). */
  enabled: boolean;
  /** Factor id backing `enabled` (for unenroll). */
  factorId: string | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Unenrolls the current factor and refreshes; no-op when already off. */
  unenroll: () => Promise<void>;
};

const MfaContext = createContext<MfaContextValue | null>(null);

export function MfaProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabled] = useState(false);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const inflight = useRef<Promise<void> | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Guard anti-overlap (same as wallets/transactions/budgets): a refresh
  // racing Profile mount + enroll return shares one factors fetch.
  const refresh = useCallback(async (): Promise<void> => {
    if (inflight.current) {
      await inflight.current;
      return;
    }
    const run = (async () => {
      if (mounted.current) {
        setLoading(true);
        setError(null);
      }
      try {
        const { totp, all } = await listMfaFactors();
        const verified =
          totp.length > 0 ? totp[0] : all.find((factor) => hasVerifiedTotp([factor])) ?? null;
        if (mounted.current) {
          setEnabled(verified !== null);
          setFactorId(verified?.id ?? null);
        }
      } catch (cause) {
        if (mounted.current) {
          setError(
            cause instanceof Error ? cause.message : 'Gagal memuat status 2FA',
          );
        }
      } finally {
        if (mounted.current) setLoading(false);
        inflight.current = null;
      }
    })();
    inflight.current = run;
    await run;
  }, []);

  // One fetch on mount (DataProviders remounts per user, so this is always
  // the freshly signed-in account — same pattern as the other providers).
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const unenroll = useCallback(async (): Promise<void> => {
    if (!factorId) return;
    await unenrollMfaFactor(factorId);
    await refresh();
  }, [factorId, refresh]);

  // Sign out clears the in-memory copy (factors themselves are server-side
  // and untouched — the next sign-in re-reads them for its own account).
  useEffect(
    () =>
      onLocalDataPurge(() => {
        if (!mounted.current) return;
        setEnabled(false);
        setFactorId(null);
        setError(null);
      }),
    [],
  );

  const value = useMemo(
    () => ({ enabled, factorId, loading, error, refresh, unenroll }),
    [enabled, factorId, loading, error, refresh, unenroll],
  );

  return <MfaContext.Provider value={value}>{children}</MfaContext.Provider>;
}

export function useMfa(): MfaContextValue {
  const context = useContext(MfaContext);
  if (!context) {
    throw new Error('useMfa harus dipakai di dalam MfaProvider');
  }
  return context;
}
