/**
 * Data reload tests — the provider tree remounts per user (`key={userId}` in
 * `DataProviders`), so every provider refetches with the new session.
 *
 * Regression: providers fetched once at app boot (usually pre-session), RLS
 * returned nothing, and nothing refetched after login — a returning user saw
 * empty screens until a restart. The sign-out direction below exercises the
 * identical key-change path as sign-in (guest ↔ user id), which cannot be
 * driven offline because sign-in needs the network.
 */
import { act, render, waitFor } from '@testing-library/react-native';
import { View } from 'react-native';

import { AuthProvider } from '@/features/auth';
import { supabase } from '@/supabase';
import { DataProviders } from '../app/_layout';
import { listWallets } from '@/features/wallets/api';

jest.mock('@/features/wallets/api', () => {
  const actual = jest.requireActual('@/features/wallets/api');
  return { ...actual, listWallets: jest.fn().mockResolvedValue([]) };
});

const walletsMock = listWallets as jest.Mock;

describe('DataProviders reload per user', () => {
  it('memuat ulang dompet saat sesi berganti tanpa restart', async () => {
    render(
      <AuthProvider>
        <DataProviders>
          <View testID="probe" />
        </DataProviders>
      </AuthProvider>,
    );

    // Boot as guest, then the seeded session restores: two mounts, two loads.
    await waitFor(() => {
      expect(walletsMock.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
    const afterLogin = walletsMock.mock.calls.length;

    await act(async () => {
      await supabase.auth.signOut();
    });

    // Back to `guest`: the tree remounts and loads again — no restart needed.
    await waitFor(() => {
      expect(walletsMock.mock.calls.length).toBeGreaterThan(afterLogin);
    });
  });

  it('memakai ulang fetch yang sedang jalan (tanpa query ganda)', async () => {
    const { useWallets } = require('@/features/wallets');

    function Probe() {
      const { refresh } = useWallets();
      (globalThis as { __probeRefresh?: () => Promise<void> }).__probeRefresh =
        refresh;
      return <View testID="probe" />;
    }

    render(
      <AuthProvider>
        <DataProviders>
          <Probe />
        </DataProviders>
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(walletsMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
    const before = walletsMock.mock.calls.length;
    const getRefresh = () =>
      (globalThis as { __probeRefresh?: () => Promise<void> }).__probeRefresh;

    await act(async () => {
      await Promise.all([getRefresh()?.(), getRefresh()?.()]);
    });

    // Two concurrent refreshes share one fetch (at most one new call: the
    // shared one — never two).
    expect(walletsMock.mock.calls.length).toBeLessThanOrEqual(before + 1);
  });
});
