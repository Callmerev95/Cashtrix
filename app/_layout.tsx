/**
 * Root layout — dark-only canvas, fonts loaded before first paint.
 *
 * Also the auth gate (PRD §2.3 Epic A): the session is restored from storage
 * before anything paints, then the user is parked in the right group. The gate
 * is the only place that navigates on auth state, so sign-in/out cannot fight
 * with a screen-level redirect.
 */
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

import { appFonts } from '@/fonts';
import { AuthProvider, useAuth } from '@/features/auth';
import { AnalyticsProvider } from '@/features/analytics';
import { BudgetsProvider } from '@/features/budgets';
import {
  initObservability,
  initSentry,
  screenNameFromSegments,
  screenViewEvent,
  trackEvent,
} from '@/features/observability';
import { ProfileProvider } from '@/features/profile';
import { RecurringProvider } from '@/features/recurring';
import { TransactionsProvider } from '@/features/transactions';
import { WalletsProvider } from '@/features/wallets';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

function AuthGate() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  // Last emitted screen — dedupes the `screen_view` event when unrelated
  // state (e.g. auth status) re-renders the gate on the same route.
  const lastScreen = useRef<string | null>(null);

  // T10 (issue #11): `screen_view` fires from navigation, with no route
  // params attached (params could carry financial context). Tracking lives
  // here — next to the only other navigation side-effect — so there is one
  // place that reacts to route changes.
  useEffect(() => {
    const screen = screenNameFromSegments(segments);
    if (screen === lastScreen.current) return;
    lastScreen.current = screen;
    trackEvent(screenViewEvent(screen));
  }, [segments]);

  useEffect(() => {
    if (status === 'loading') return;

    const inAuthGroup = segments[0] === '(auth)';

    if (status === 'unauthenticated' && !inAuthGroup) {
      router.replace('/(auth)/login');
      return;
    }

    // Unconfirmed email: hold at "Cek email" screen (inside auth group).
    // Compared as a joined path (not `segments[1]`): the generated router
    // types are gitignored, so indexed access fails CI typecheck (TS2493)
    // where the fallback segment tuple has length 1.
    if (status === 'unconfirmed') {
      const inCheckEmail = segments.join('/') === '(auth)/check-email';
      if (!inCheckEmail) {
        router.replace('/(auth)/check-email');
      }
      return;
    }

    if (status === 'authenticated' && inAuthGroup) {
      router.replace('/');
    }
  }, [status, segments, router]);

  return null;
}

function RootNavigator() {
  const { status } = useAuth();

  useEffect(() => {
    if (status !== 'loading') {
      SplashScreen.hideAsync();
    }
  }, [status]);

  // Hold the splash until the persisted session has been read back, otherwise
  // a returning user sees Login flash before the Dashboard.
  if (status === 'loading') {
    return null;
  }

  return (
    <>
      <AuthGate />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.background },
        }}
      >
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="add-transaction" options={{ presentation: 'modal' }} />
        <Stack.Screen name="budget-form" options={{ presentation: 'modal' }} />
        <Stack.Screen name="wallets" />
        <Stack.Screen name="wallet-form" options={{ presentation: 'modal' }} />
        <Stack.Screen name="categories" />
        <Stack.Screen name="category-form" options={{ presentation: 'modal' }} />
        <Stack.Screen name="recurring" />
        <Stack.Screen name="recurring-form" options={{ presentation: 'modal' }} />
        <Stack.Screen name="delete-account" />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}

/**
 * Data providers, remounted per user.
 *
 * Every provider below fetches once on mount. Without the `key`, that fetch
 * runs while the app boots — usually before a session exists — so RLS returns
 * nothing and no later event refetches: a returning user sees empty screens
 * until a restart. Keying on the stable `user.id` (not the session object,
 * so token refreshes never remount) guarantees each login gets a fresh,
 * authenticated load; sign-out remounts as `guest`, which also drops the
 * in-memory copies alongside the persisted purge.
 *
 * Order note: `AnalyticsProvider` sits above `RecurringProvider` (not below
 * it) so the recurring catch-up can refresh the overview when it births
 * occurrences. Analytics depends on no context — only the server — while
 * recurring needs wallets/transactions/budgets, which all stay above it.
 */
export function DataProviders({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userKey = session?.user.id ?? 'guest';

  return (
    <WalletsProvider key={userKey}>
      <TransactionsProvider>
        <BudgetsProvider>
          <AnalyticsProvider>
            <RecurringProvider>
              <ProfileProvider>{children}</ProfileProvider>
            </RecurringProvider>
          </AnalyticsProvider>
        </BudgetsProvider>
      </TransactionsProvider>
    </WalletsProvider>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontsError] = useFonts(appFonts);

  // V1 (issue #30): Sentry first so the sink is live before any capture,
  // then the global error handler (crash reporting). Both never throw; with
  // no DSN (daily Expo Go work) the redacted buffer stays in place.
  useEffect(() => {
    initSentry();
    initObservability();
  }, []);

  if (!fontsLoaded && !fontsError) {
    return null;
  }

  return (
    <AuthProvider>
      <DataProviders>
        <RootNavigator />
      </DataProviders>
    </AuthProvider>
  );
}
