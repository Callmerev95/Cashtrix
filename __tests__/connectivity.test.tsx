/**
 * Connectivity + visible-error tests — the Jest seam for ticket #49 (D4).
 * NetInfo is mocked (native module); what is locked is the online derivation
 * (nulls stay online — no banner flash), the banner contract, the
 * offline→online refresh chain, and the uniform retry card.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';

import { ErrorStateCard } from '@/components/error-state-card';
import {
  ConnectivityProvider,
  OFFLINE_MESSAGE,
  OfflineBanner,
  ReconnectRefresh,
  toOnlineStatus,
  useConnectivity,
} from '@/features/connectivity';
import { Text } from 'react-native';
import { useEffect } from 'react';

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: {
    addEventListener: jest.fn(() => jest.fn()),
    fetch: jest.fn(),
  },
}));

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
}));

const netinfo = jest.requireMock('@react-native-community/netinfo').default;

function listener(): (state: {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}) => void {
  return netinfo.addEventListener.mock.calls[0][0];
}

const ONLINE = { isConnected: true, isInternetReachable: true };

describe('toOnlineStatus', () => {
  it('online saat keduanya true', () => {
    expect(toOnlineStatus(ONLINE)).toBe(true);
  });

  it('null = sehat (tanpa kedip banner sebelum event pertama)', () => {
    expect(
      toOnlineStatus({ isConnected: null, isInternetReachable: null }),
    ).toBe(true);
  });

  it('offline bila putus atau tak terjangkau', () => {
    expect(
      toOnlineStatus({ isConnected: false, isInternetReachable: true }),
    ).toBe(false);
    expect(
      toOnlineStatus({ isConnected: true, isInternetReachable: false }),
    ).toBe(false);
  });
});

describe('ConnectivityProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    netinfo.addEventListener.mockReturnValue(jest.fn());
    netinfo.fetch.mockResolvedValue(ONLINE);
  });

  function Probe() {
    const { isOnline } = useConnectivity();
    useEffect(() => {
      (globalThis as Record<string, unknown>).online = isOnline;
    });
    return <Text testID="probe">{String(isOnline)}</Text>;
  }

  it('mulai online + mengikuti event NetInfo', async () => {
    render(
      <ConnectivityProvider>
        <Probe />
      </ConnectivityProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('probe')).toBeTruthy());
    expect((globalThis as Record<string, unknown>).online).toBe(true);

    act(() => {
      listener()({ isConnected: false, isInternetReachable: false });
    });
    expect((globalThis as Record<string, unknown>).online).toBe(false);

    act(() => {
      listener()(ONLINE);
    });
    expect((globalThis as Record<string, unknown>).online).toBe(true);
  });
});

describe('OfflineBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    netinfo.addEventListener.mockReturnValue(jest.fn());
    netinfo.fetch.mockResolvedValue(ONLINE);
  });

  function Shell() {
    return (
      <ConnectivityProvider>
        <OfflineBanner />
      </ConnectivityProvider>
    );
  }

  it('null saat online', async () => {
    render(<Shell />);
    await waitFor(() =>
      expect(netinfo.addEventListener).toHaveBeenCalled(),
    );
    expect(screen.queryByTestId('offline-banner')).toBeNull();
  });

  it('muncul dengan copy saat offline', async () => {
    render(<Shell />);
    await waitFor(() =>
      expect(netinfo.addEventListener).toHaveBeenCalled(),
    );

    act(() => {
      listener()({ isConnected: false, isInternetReachable: false });
    });

    expect(screen.getByTestId('offline-banner')).toBeTruthy();
    expect(screen.getByText(OFFLINE_MESSAGE)).toBeTruthy();
  });
});

jest.mock('@/features/wallets', () => {
  const refresh = jest.fn().mockResolvedValue(undefined);
  return { useWallets: () => ({ refresh }), __testRefresh: refresh };
});
jest.mock('@/features/transactions', () => {
  const refresh = jest.fn().mockResolvedValue(undefined);
  return { useTransactions: () => ({ refresh }), __testRefresh: refresh };
});
jest.mock('@/features/budgets', () => {
  const refresh = jest.fn().mockResolvedValue(undefined);
  const evaluateAndAlert = jest.fn().mockResolvedValue([]);
  return {
    useBudgets: () => ({ refresh, evaluateAndAlert }),
    __testRefresh: refresh,
    __testEvaluate: evaluateAndAlert,
  };
});
jest.mock('@/features/analytics', () => {
  const refresh = jest.fn().mockResolvedValue(undefined);
  return { useAnalytics: () => ({ refresh }), __testRefresh: refresh };
});
jest.mock('@/features/recurring', () => {
  const runCatchUp = jest.fn().mockResolvedValue(0);
  return { useRecurring: () => ({ runCatchUp }), __testCatchUp: runCatchUp };
});
jest.mock('@/features/auth', () => ({
  useAuth: () => ({ session: { user: { id: 'u-1' } } }),
}));

function testMock(path: string, key: string): jest.Mock {
  return jest.requireMock(path)[key] as jest.Mock;
}

describe('ReconnectRefresh', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    netinfo.addEventListener.mockReturnValue(jest.fn());
    netinfo.fetch.mockResolvedValue(ONLINE);
  });

  it('mount tidak refresh; reconnect menyegarkan semua + catch-up', async () => {
    render(
      <ConnectivityProvider>
        <ReconnectRefresh />
      </ConnectivityProvider>,
    );
    await waitFor(() =>
      expect(netinfo.addEventListener).toHaveBeenCalled(),
    );
    expect(testMock('@/features/recurring', '__testCatchUp')).not.toHaveBeenCalled();

    act(() => {
      listener()({ isConnected: false, isInternetReachable: false });
    });
    expect(testMock('@/features/recurring', '__testCatchUp')).not.toHaveBeenCalled();

    act(() => {
      listener()(ONLINE);
    });

    await waitFor(() =>
      expect(
        testMock('@/features/recurring', '__testCatchUp'),
      ).toHaveBeenCalledTimes(1),
    );
    await waitFor(() =>
      expect(
        testMock('@/features/wallets', '__testRefresh'),
      ).toHaveBeenCalledTimes(1),
    );
    expect(
      testMock('@/features/transactions', '__testRefresh'),
    ).toHaveBeenCalledTimes(1);
    expect(
      testMock('@/features/budgets', '__testRefresh'),
    ).toHaveBeenCalledTimes(1);
    expect(
      testMock('@/features/analytics', '__testRefresh'),
    ).toHaveBeenCalledTimes(1);
    expect(
      testMock('@/features/budgets', '__testEvaluate'),
    ).toHaveBeenCalledWith({ userId: 'u-1' });
  });
});

describe('ErrorStateCard', () => {
  it('menampilkan pesan + tombol Coba lagi memanggil onRetry', () => {
    const onRetry = jest.fn();
    render(
      <ErrorStateCard
        testID="x-error"
        message="Gagal memuat"
        onRetry={onRetry}
      />,
    );

    expect(screen.getByTestId('x-error')).toBeTruthy();
    expect(screen.getByText('Gagal memuat')).toBeTruthy();

    fireEvent.press(screen.getByTestId('x-error-retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
