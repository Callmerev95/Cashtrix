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
import { fetchAssuranceLevel } from '@/features/mfa/api';
import { needsMfaChallenge } from '@/features/mfa/domain';

export type AuthStatus =
  | 'loading'
  | 'authenticated'
  | 'unauthenticated'
  | 'unconfirmed'
  | 'mfaRequired';

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
  if (!session) return { status: 'unauthenticated', session: null };
  // If session exists but email not confirmed, user is in "unconfirmed" state
  const confirmed = session.user.email_confirmed_at !== null;
  return { status: confirmed ? 'authenticated' : 'unconfirmed', session };
}

/**
 * C2 (#53): resolves the 5th status. A signed-in user with a verified TOTP
 * factor holds an aal1 session until the challenge verifies — parking them
 * in `mfaRequired` keeps the gate on the challenge screen instead of
 * dropping them into the tabs half-authenticated. Unconfirmed users skip
 * the probe (no extra request before they can even sign in); the probe
 * itself degrades to aal1/aal1, so offline never strands a user here.
 */
async function resolveState(session: Session | null): Promise<AuthState> {
  const base = toState(session);
  if (base.status !== 'authenticated' || !session) return base;
  const { currentLevel, nextLevel } = await fetchAssuranceLevel();
  if (needsMfaChallenge(currentLevel, nextLevel)) {
    return { status: 'mfaRequired', session };
  }
  return base;
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
    // Async AAL resolutions can overlap (initial restore + first event);
    // only the latest may settle, so a stale probe never downgrades a
    // verified session back to the challenge.
    let sequence = 0;

    function apply(state: AuthState, seq: number) {
      if (!active || seq !== sequence || settled.current) return;
      settled.current = true;
      setState(state);
    }

    function settle(session: Session | null) {
      const seq = ++sequence;
      // The first paint stays sync-fast for the common cases; only a
      // confirmed session pays for the AAL probe.
      if (!session || session.user.email_confirmed_at === null) {
        apply(toState(session), seq);
        return;
      }
      void resolveState(session).then((state) => apply(state, seq));
    }

    // Restore the persisted session (refresh token) before first paint gate —
    // this is what makes a re-opened app land straight on the Dashboard.
    supabase.auth.getSession().then(({ data }) => settle(data.session));

    const { data: subscription } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        // Only the *initial* settle is short-circuited; real transitions
        // (sign in, sign out, token refresh, MFA verify) must always land.
        if (!settled.current) {
          settle(session);
          return;
        }
        if (active) {
          const seq = ++sequence;
          void resolveState(session).then((state) => {
            if (active && seq === sequence) setState(state);
          });
        }
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
