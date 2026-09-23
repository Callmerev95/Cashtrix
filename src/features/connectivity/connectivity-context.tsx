/**
 * Connectivity context (D4) — the device's online state, nothing more.
 *
 * A single NetInfo subscription shared by the offline banner and the
 * reconnect refresh. Starts online (the healthy default — `toOnlineStatus`
 * treats pre-first-event nulls as online so the banner never flashes on
 * mount); every state write lands in a listener/promise callback, never
 * synchronously in the effect body (`react-hooks/set-state-in-effect`).
 */
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
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

import { toOnlineStatus } from './domain';

type ConnectivityContextValue = {
  isOnline: boolean;
};

const ConnectivityContext =
  createContext<ConnectivityContextValue | null>(null);

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [isOnline, setIsOnline] = useState(true);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const handle = useCallback((state: NetInfoState) => {
    if (!mounted.current) return;
    setIsOnline(toOnlineStatus(state));
  }, []);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(handle);
    NetInfo.fetch()
      .then((state) => {
        if (mounted.current) setIsOnline(toOnlineStatus(state));
      })
      .catch(() => {
        // A failed first read keeps the healthy default; the listener
        // corrects it on the next connectivity change.
      });
    return unsubscribe;
  }, [handle]);

  const value = useMemo(() => ({ isOnline }), [isOnline]);

  return (
    <ConnectivityContext.Provider value={value}>
      {children}
    </ConnectivityContext.Provider>
  );
}

export function useConnectivity(): ConnectivityContextValue {
  const context = useContext(ConnectivityContext);
  if (!context) {
    throw new Error(
      'useConnectivity harus dipakai di dalam ConnectivityProvider',
    );
  }
  return context;
}
