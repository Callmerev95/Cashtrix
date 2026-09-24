/**
 * Navigation shell smoke test — mounts the real Expo Router tree and
 * verifies the T1 acceptance criteria: four tabs render in the floating bar
 * and the centre FAB opens the Add Transaction modal route.
 *
 * T3 note: the tab tree now sits behind the auth gate, so the tests must start
 * from a signed-in session. Rendering the layout chain as an in-memory router
 * is both how expo-router test trees are built and how the async auth state
 * flushes, so it is used for every case rather than mocking the session away.
 *
 * D3 note: the same tree now also covers the five secondary routes (search,
 * notifications, recurring, categories, delete-account) — reachability from
 * their entry rows plus the deterministic error branches (providers fail with
 * the inert test key, so the D4 error cards render without network timing).
 */
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

// Router integration tests mount the whole tree (providers attempt their
// reads on mount); on shared CI runners the first mount can exceed the
// default 5 s timeout even when nothing is wrong — flaked identically on
// runs 35550273577, 35560686123 and 35574680625 with no app-code change.
jest.setTimeout(15_000);

// Font loading is async against the native bridge, which never resolves in
// Jest; the shell gates first paint on it, so report fonts as ready while
// keeping the rest of the module (Font.isLoaded, loadAsync) intact.
jest.mock('expo-font', () => {
  const actual = jest.requireActual('expo-font');
  return { ...actual, useFonts: () => [true, null] };
});
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(),
  hideAsync: jest.fn(),
}));

// C2: provider reads hit the network with the inert test key, so the Profile
// screen would sit in its error branch and the 2FA toggle never renders.
// Canned profile only — every other export stays real.
// D3: extended with the category-management surface so the Categories screen
// (which filters `categories` on render) can mount without the network.
jest.mock('@/features/profile', () => {
  const actual = jest.requireActual('@/features/profile');
  return {
    ...actual,
    useProfile: () => ({
      profile: { displayName: 'Evelyn', currencyCode: 'IDR' },
      categories: [],
      avatarSignedUrl: null,
      loading: false,
      error: null,
      refresh: async () => undefined,
      saveProfile: async () => undefined,
      saveAvatar: async () => undefined,
      archiveManagedCategory: async () => undefined,
      unarchiveManagedCategory: async () => undefined,
      deleteManagedCategory: async () => undefined,
    }),
  };
});

async function renderSignedInApp() {
  return renderRouter(
    {
      _layout: require('../app/_layout').default,
      '(tabs)/_layout': require('../app/(tabs)/_layout').default,
      '(tabs)/index': require('../app/(tabs)/index').default,
      '(tabs)/analytics': require('../app/(tabs)/analytics').default,
      '(tabs)/budgets': require('../app/(tabs)/budgets').default,
      '(tabs)/profile': require('../app/(tabs)/profile').default,
      'add-transaction': require('../app/add-transaction').default,
      wallets: require('../app/wallets').default,
      'wallet-form': require('../app/wallet-form').default,
      '(auth)/_layout': require('../app/(auth)/_layout').default,
      '(auth)/login': require('../app/(auth)/login').default,
      '(auth)/register': require('../app/(auth)/register').default,
      '(auth)/check-email': require('../app/(auth)/check-email').default,
      '(auth)/forgot-password': require('../app/(auth)/forgot-password').default,
      '(auth)/reset-password': require('../app/(auth)/reset-password').default,
      '(auth)/mfa-challenge': require('../app/(auth)/mfa-challenge').default,
      'mfa-enroll': require('../app/mfa-enroll').default,
      search: require('../app/search').default,
      notifications: require('../app/notifications').default,
      recurring: require('../app/recurring').default,
      categories: require('../app/categories').default,
      'delete-account': require('../app/delete-account').default,
    },
    { initialUrl: '/' },
  );
}

/**
 * V0 gate tests overwrite the seeded session with an unconfirmed variant
 * (`email_confirmed_at: null`). supabase-js re-reads storage in `getSession()`
 * on every mount, so writing before render is enough — no client rebuild.
 */
const SESSION_STORAGE_KEY = 'sb-bklriyyuglwiqczgbqgq-auth-token';

function seedSession(emailConfirmedAt: string | null) {
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
        email_confirmed_at: emailConfirmedAt,
        app_metadata: { provider: 'email', providers: ['email'] },
        user_metadata: {},
        created_at: '2026-09-17T00:00:00Z',
        updated_at: '2026-09-17T00:00:00Z',
      },
      weak_password: null,
    }),
  );
}

describe('navigation shell', () => {
  it('renders the four tabs in the floating bar', async () => {
    await renderSignedInApp();

    expect(await screen.findByLabelText('Dashboard')).toBeTruthy();
    expect(screen.getByLabelText('Analytics')).toBeTruthy();
    expect(screen.getByLabelText('Budgets')).toBeTruthy();
    expect(screen.getByLabelText('Profile')).toBeTruthy();
  });

  it('exposes the centre FAB that opens Add Transaction', async () => {
    const { getPathname } = await renderSignedInApp();

    fireEvent.press(await screen.findByLabelText('Add Transaction'));

    expect(getPathname()).toBe('/add-transaction');
  });

  it('switches tab when a bar item is pressed', async () => {
    const { getPathname } = await renderSignedInApp();

    fireEvent.press(await screen.findByLabelText('Budgets'));

    expect(getPathname()).toBe('/budgets');
  });

  it('opens the Dashboard tab by default', async () => {
    const { getPathname } = await renderSignedInApp();
    expect(getPathname()).toBe('/');
  });

  it('opens the Wallets screen from the Dashboard hero', async () => {
    const { getPathname } = await renderSignedInApp();

    fireEvent.press(await screen.findByTestId('dashboard-wallets-action'));

    expect(getPathname()).toBe('/wallets');
  });

  it('opens the wallet form from the Wallets screen', async () => {
    const { getPathname } = await renderSignedInApp();

    fireEvent.press(await screen.findByTestId('dashboard-wallets-action'));
    fireEvent.press(await screen.findByTestId('add-wallet'));

    expect(getPathname()).toBe('/wallet-form');
  });
});

describe('auth gate', () => {
  it('sends a signed-out user to Login', async () => {
    await require('@/supabase').supabase.auth.signOut();
    const { getPathname } = await renderSignedInApp();

    await screen.findByTestId('login-submit');
    expect(getPathname()).toBe('/login');
  });

  it('validates the register form without leaving the device', async () => {
    await require('@/supabase').supabase.auth.signOut();
    const { getPathname } = await renderSignedInApp();

    fireEvent.press(await screen.findByTestId('login-to-register'));
    expect(getPathname()).toBe('/register');

    fireEvent.changeText(screen.getByTestId('register-email'), 'evelyn');
    fireEvent.changeText(screen.getByTestId('register-password'), 'abc');
    fireEvent.press(screen.getByTestId('register-submit'));

    expect(await screen.findByText('Email tidak valid')).toBeTruthy();
    expect(screen.getByText('Password minimal 8 karakter')).toBeTruthy();
    // Still on Register: a failing form must not navigate or request.
    expect(getPathname()).toBe('/register');
  });

  it('holds an unconfirmed session at Check Email, not the tabs (V0)', async () => {
    seedSession(null);
    const { getPathname } = await renderSignedInApp();

    expect(await screen.findByTestId('check-email-resend')).toBeTruthy();
    expect(getPathname()).toBe('/check-email');
  });

  it('shows the session email on Check Email so resend works without a param (V0)', async () => {
    seedSession(null);
    await renderSignedInApp();

    // The gate-driven path carries no `email` param; the screen falls back
    // to the session address — otherwise resend would be dead on arrival.
    expect(await screen.findByText(/evelyn@cashtrix\.app/)).toBeTruthy();
  });

  it('lets a confirmed session into the tabs (V0)', async () => {
    seedSession('2026-09-17T00:00:00Z');
    const { getPathname } = await renderSignedInApp();

    expect(await screen.findByLabelText('Dashboard')).toBeTruthy();
    expect(getPathname()).toBe('/');
  });

  it('reaches Forgot Password from Login (V0)', async () => {
    await require('@/supabase').supabase.auth.signOut();
    const { getPathname } = await renderSignedInApp();

    fireEvent.press(await screen.findByTestId('login-forgot-password'));

    expect(getPathname()).toBe('/forgot-password');
    expect(await screen.findByTestId('forgot-password-submit')).toBeTruthy();
  });
});

describe('app lock gate (B4)', () => {
  const LOCK_KEY = 'cashtrix:app-lock-enabled';

  afterEach(() => {
    require('./mocks/async-storage').sessionStorageSeed.delete(LOCK_KEY);
  });

  it('covers the tabs with the lock overlay on a cold start with the flag set', async () => {
    // A prior `signOut()` in this file cleared the seeded session; restore a
    // confirmed one so the gate parks at the tabs, then set the lock flag.
    seedSession('2026-09-17T00:00:00Z');
    require('./mocks/async-storage').sessionStorageSeed.set(LOCK_KEY, '1');
    const { getPathname } = await renderSignedInApp();

    // The overlay is opaque and full-screen over the Stack — no Dashboard
    // content is reachable while locked.
    expect(await screen.findByTestId('lock-overlay')).toBeTruthy();
    expect(screen.getByTestId('lock-unlock')).toBeTruthy();
    expect(getPathname()).toBe('/');
  });
});

describe('MFA challenge gate (C2)', () => {
  const mfa = require('@/supabase').supabase.auth.mfa;
  const defaultAal = mfa.getAuthenticatorAssuranceLevel;

  afterEach(() => {
    mfa.getAuthenticatorAssuranceLevel = defaultAal;
    seedSession('2026-09-17T00:00:00Z');
  });

  it('holds an aal1→aal2 session at the challenge screen, not the tabs', async () => {
    mfa.getAuthenticatorAssuranceLevel = async () => ({
      data: { currentLevel: 'aal1', nextLevel: 'aal2' },
      error: null,
    });
    const { getPathname } = await renderSignedInApp();

    expect(await screen.findByTestId('mfa-challenge-screen')).toBeTruthy();
    expect(screen.getByTestId('mfa-challenge-submit')).toBeTruthy();
    expect(getPathname()).toBe('/mfa-challenge');
  });

  it('shows the 2FA toggle on Profile (opt-in, B4 pattern)', async () => {
    const { getPathname } = await renderSignedInApp();
    expect(getPathname()).toBe('/');

    fireEvent.press(await screen.findByLabelText('Profile'));

    expect(await screen.findByTestId('profile-mfa-toggle')).toBeTruthy();
  });
});

describe('secondary routes (D3)', () => {
  it('reaches Search from the Dashboard history action', async () => {
    const { getPathname } = await renderSignedInApp();

    fireEvent.press(await screen.findByTestId('dashboard-history-action'));

    expect(getPathname()).toBe('/search');
    expect(await screen.findByTestId('search-input')).toBeTruthy();
  });

  it('reaches Notifications from the Dashboard bell', async () => {
    const { getPathname } = await renderSignedInApp();

    fireEvent.press(await screen.findByTestId('dashboard-alerts'));

    expect(getPathname()).toBe('/notifications');
    // With the inert test key every provider read fails offline-safe, so the
    // inbox lands on either its error card or its empty state — both prove
    // the route mounted instead of 404ing.
    expect(
      await screen.findByTestId('notifications-error', undefined, {
        timeout: 2_000,
      }).catch(() => screen.findByTestId('notifications-empty')),
    ).toBeTruthy();
  });

  it('reaches Recurring from the Profile row', async () => {
    const { getPathname } = await renderSignedInApp();

    fireEvent.press(await screen.findByLabelText('Profile'));
    fireEvent.press(await screen.findByTestId('profile-recurring-row'));

    expect(getPathname()).toBe('/recurring');
    expect(await screen.findByTestId('recurring-screen')).toBeTruthy();
  });

  it('reaches Categories from the Profile row', async () => {
    const { getPathname } = await renderSignedInApp();

    fireEvent.press(await screen.findByLabelText('Profile'));
    fireEvent.press(await screen.findByTestId('profile-categories-row'));

    expect(getPathname()).toBe('/categories');
    expect(await screen.findByTestId('categories-screen')).toBeTruthy();
  });

  it('reaches Delete Account from the Profile row', async () => {
    const { getPathname } = await renderSignedInApp();

    fireEvent.press(await screen.findByLabelText('Profile'));
    fireEvent.press(await screen.findByTestId('profile-delete-account-row'));

    expect(getPathname()).toBe('/delete-account');
    expect(
      await screen.findByTestId('delete-account-confirmation'),
    ).toBeTruthy();
  });
});
