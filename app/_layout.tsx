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

import { appFonts } from '@/fonts';
import { AuthProvider, useAuth } from '@/features/auth';
import { AnalyticsProvider } from '@/features/analytics';
import { BudgetsProvider } from '@/features/budgets';
import {
  initObservability,
  screenNameFromSegments,
  screenViewEvent,
  trackEvent,
} from '@/features/observability';
import { ProfileProvider } from '@/features/profile';
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

    // Unconfirmed email: hold at "Cek email" screen (inside auth group)
    if (status === 'unconfirmed') {
      const inCheckEmail = segments[0] === '(auth)' && segments[1] === 'check-email';
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
        <Stack.Screen name="delete-account" />
      </Stack>
      <StatusBar style="light" />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontsError] = useFonts(appFonts);

  // T10 (issue #11): installs the global error handler (crash reporting)
  // once. State updates happen in promise callbacks inside the sink, never
  // synchronously here.
  useEffect(() => {
    initObservability();
  }, []);

  if (!fontsLoaded && !fontsError) {
    return null;
  }

  return (
    <AuthProvider>
      <WalletsProvider>
        <TransactionsProvider>
          <BudgetsProvider>
            <AnalyticsProvider>
              <ProfileProvider>
                <RootNavigator />
              </ProfileProvider>
            </AnalyticsProvider>
          </BudgetsProvider>
        </TransactionsProvider>
      </WalletsProvider>
    </AuthProvider>
  );
}
