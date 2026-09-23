/**
 * Lock context (B4, ADR-0007) — device-local app-lock state.
 *
 * The flag lives in AsyncStorage (registered in `LOCAL_STORAGE_KEYS`, so
 * sign-out clears it, like every other local preference). Cold start always
 * locks (the flag is read once on mount); background → foreground re-locks
 * only after the 60s grace. Lock is not sign-out — the Supabase session is
 * untouched. All state writes land in promise/listener callbacks, never
 * synchronously in an effect body (`react-hooks/set-state-in-effect`).
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

import {
  authenticateUnlock,
  isBiometricAvailable,
  readLockEnabled,
  writeLockEnabled,
} from './api';
import { LOCK_GRACE_MS, shouldLockOnResume } from './domain';

type LockContextValue = {
  /** Opt-in flag (default off). */
  enabled: boolean;
  /** True while the overlay must block the app. */
  locked: boolean;
  /** Device has biometric hardware AND an enrolment (drives the toggle). */
  biometricsReady: boolean;
  setEnabled: (value: boolean) => Promise<void>;
  /** Prompt the OS scanner; resolves true once the app is unlocked. */
  unlock: (promptMessage: string) => Promise<boolean>;
  lockNow: () => void;
};

const LockContext = createContext<LockContextValue | null>(null);

export function LockProvider({ children }: { children: ReactNode }) {
  const [enabled, setEnabledState] = useState(false);
  const [locked, setLocked] = useState(false);
  const [biometricsReady, setBiometricsReady] = useState(false);
  const backgroundedAt = useRef<number | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Cold start: once the persisted flag is known, always start locked.
  useEffect(() => {
    let cancelled = false;
    void readLockEnabled().then((value) => {
      if (cancelled) return;
      setEnabledState(value);
      if (value) setLocked(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Biometric capability probe — drives the Profile toggle gating.
  useEffect(() => {
    let cancelled = false;
    void isBiometricAvailable().then((value) => {
      if (cancelled) return;
      setBiometricsReady(value);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Grace window: background → foreground re-locks only after the grace.
  useEffect(() => {
    if (!enabled) return;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        const at = backgroundedAt.current;
        backgroundedAt.current = null;
        if (at !== null && shouldLockOnResume(at, Date.now(), LOCK_GRACE_MS)) {
          setLocked(true);
        }
        return;
      }
      if (state === 'background' || state === 'inactive') {
        if (backgroundedAt.current === null) {
          backgroundedAt.current = Date.now();
        }
      }
    });

    return () => subscription.remove();
  }, [enabled]);

  const setEnabled = useCallback(async (value: boolean) => {
    setEnabledState(value);
    if (!value) setLocked(false);
    await writeLockEnabled(value);
  }, []);

  const unlock = useCallback(async (promptMessage: string) => {
    const ok = await authenticateUnlock(promptMessage);
    if (ok && mounted.current) setLocked(false);
    return ok;
  }, []);

  const lockNow = useCallback(() => setLocked(true), []);

  // Sign out clears the local flag (it is registered in LOCAL_STORAGE_KEYS);
  // drop the in-memory copy so a later sign-in starts from the clean default.
  useEffect(
    () =>
      onLocalDataPurge(() => {
        if (!mounted.current) return;
        setEnabledState(false);
        setLocked(false);
      }),
    [],
  );

  const value = useMemo(
    () => ({ enabled, locked, biometricsReady, setEnabled, unlock, lockNow }),
    [enabled, locked, biometricsReady, setEnabled, unlock, lockNow],
  );

  return <LockContext.Provider value={value}>{children}</LockContext.Provider>;
}

export function useLock(): LockContextValue {
  const context = useContext(LockContext);
  if (!context) {
    throw new Error('useLock harus dipakai di dalam LockProvider');
  }
  return context;
}