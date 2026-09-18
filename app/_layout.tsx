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
import { useEffect } from 'react';

import { appFonts } from '@/fonts';
import { AuthProvider, useAuth } from '@/features/auth';
import { AnalyticsProvider } from '@/features/analytics';
import { BudgetsProvider } from '@/features/budgets';
import { ProfileProvider } from '@/features/profile';
import { TransactionsProvider } from '@/features/transactions';
import { WalletsProvider } from '@/features/wallets';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync();

function AuthGate() {
  const { status } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (status === 'loading') return;

    const inAuthGroup = segments[0] === '(auth)';

    if (status === 'unauthenticated' && !inAuthGroup) {
      router.replace('/(auth)/login');
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
      </Stack>
      <StatusBar style="light" />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontsError] = useFonts(appFonts);

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
