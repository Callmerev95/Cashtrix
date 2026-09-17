/**
 * Auth context — single source of truth for "who is signed in".
 *
 * Mounted once by the root layout. The routing gate (`app/_layout.tsx`) reads
 * `status` and redirects; no other component talks to `supabase.auth` on
 * mount, so a session refresh cannot trigger a redirect loop.
 */
import type { Session } from '@supabase/supabase-js';
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { supabase } from '@/supabase';

export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated';

type AuthState = {
  /** `loading` until the persisted session has been read back from storage. */
  status: AuthStatus;
  session: Session | null;
};

const AuthContext = createContext<AuthState>({
  status: 'loading',
  session: null,
});

function toState(session: Session | null): AuthState {
  return { status: session ? 'authenticated' : 'unauthenticated', session };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    status: 'loading',
    session: null,
  });

  // supabase-js delivers its initial session twice: once from `getSession()`
  // and once from the `INITIAL_SESSION` event. Both fire during the same
  // startup tick, and a redundant second setState outside React's own update
  // cycles is what produces the "not wrapped in act" noise in tests.
  const settled = useRef(false);

  useEffect(() => {
    let active = true;

    function apply(session: Session | null) {
      if (!active || settled.current) return;
      settled.current = true;
      setState(toState(session));
    }

    // Restore the persisted session (refresh token) before first paint gate —
    // this is what makes a re-opened app land straight on the Dashboard.
    supabase.auth.getSession().then(({ data }) => apply(data.session));

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        // Only the *initial* settle is short-circuited; real transitions
        // (sign in, sign out, token refresh) must always land.
        if (!settled.current) {
          apply(session);
          return;
        }
        if (active) setState(toState(session));
      },
    );

    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  return useContext(AuthContext);
}
