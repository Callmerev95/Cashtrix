/**
 * Wallet options refresh (form dompet → picker) — the options pickers in
 * the Add and recurring forms read from the transactions provider, so every
 * wallet write must re-read that copy too (same class as the T8 category
 * fix). Without it a freshly created wallet only appears after a restart.
 *
 * Hermetic by design: the two contexts are canned (no network timing can
 * serve the data early), so the ONLY way `refreshTransactionOptions` fires
 * is the post-save wiring under test.
 */
import {
  fireEvent,
  renderRouter,
  screen,
  testRouter,
  waitFor,
} from 'expo-router/testing-library';

// Router integration trees mount the whole provider chain; the first mount
// can exceed the default 5 s timeout on shared CI runners (same note as
// navigation.test.tsx).
jest.setTimeout(15_000);

// Font loading is async against the native bridge, which never resolves in
// Jest (same note as navigation.test.tsx).
jest.mock('expo-font', () => {
  const actual = jest.requireActual('expo-font');
  return { ...actual, useFonts: () => [true, null] };
});
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));

const mockWalletsRefresh = jest.fn(async () => undefined);
const mockCreateWallet = jest.fn(async () => 'w-dana');
const mockTransactionOptionsRefresh = jest.fn(async () => undefined);

jest.mock('@/features/wallets', () => {
  const actual = jest.requireActual('@/features/wallets');
  return {
    ...actual,
    createWallet: mockCreateWallet,
    useWallets: () =>
      ({
        wallets: [],
        summary: { totalBalance: 0, remainingSlots: 10 },
        refresh: mockWalletsRefresh,
      }) as unknown as ReturnType<(typeof actual)['useWallets']>,
  };
});

jest.mock('@/features/transactions', () => {
  const actual = jest.requireActual('@/features/transactions');
  return {
    ...actual,
    useTransactions: () =>
      ({
        refresh: mockTransactionOptionsRefresh,
      }) as unknown as ReturnType<(typeof actual)['useTransactions']>,
  };
});

const SESSION_STORAGE_KEY = 'sb-bklriyyuglwiqczgbqgq-auth-token';

function seedSession() {
  const { sessionStorageSeed } = require('./mocks/async-storage');
  sessionStorageSeed.set(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: {
        id: '00000000-0000-4000-8000-000000000001',
        aud: 'authenticated',
        role: 'authenticated',
        email: 'evelyn@cashtrix.app',
        email_confirmed_at: '2026-09-17T00:00:00Z',
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: '2026-09-17T00:00:00Z',
        updated_at: '2026-09-17T00:00:00Z',
      },
      weak_password: null,
    }),
  );
}

describe('wallet options refresh (form dompet → picker)', () => {
  it('buat dompet me-refresh daftar opsi transaksi (tanpa restart)', async () => {
    seedSession();
    mockWalletsRefresh.mockClear();
    mockCreateWallet.mockClear();
    mockTransactionOptionsRefresh.mockClear();

    // Start on /shortcuts so the form's post-save `back()` has history (a
    // bare back() on a single-entry stack warns GO_BACK-unhandled and
    // poisons the next navigation in this harness).
    const { getPathname } = await renderRouter(
      {
        _layout: require('../app/_layout').default,
        shortcuts: require('../app/shortcuts').default,
        'wallet-form': require('../app/wallet-form').default,
      },
      { initialUrl: '/shortcuts' },
    );
    testRouter.push('/wallet-form');
    expect(getPathname()).toBe('/wallet-form');

    fireEvent.changeText(await screen.findByTestId('wallet-name'), 'DANA');
    fireEvent.press(screen.getByTestId('wallet-save'));

    // The save commits and backs out — and only then may the options
    // re-read have fired.
    expect(await screen.findByTestId('shortcuts-screen')).toBeTruthy();
    expect(getPathname()).toBe('/shortcuts');
    await waitFor(() => {
      expect(mockWalletsRefresh).toHaveBeenCalled();
      expect(mockTransactionOptionsRefresh).toHaveBeenCalled();
    });
  });
});
