/**
 * Navigation shell smoke test — mounts the real Expo Router tree and
 * verifies the T1 acceptance criteria: four tabs render in the floating bar
 * and the centre FAB opens the Add Transaction modal route.
 *
 * T3 note: the tab tree now sits behind the auth gate, so the tests must start
 * from a signed-in session. Rendering the layout chain as an in-memory router
 * is both how expo-router test trees are built and how the async auth state
 * flushes, so it is used for every case rather than mocking the session away.
 */
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';

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
    },
    { initialUrl: '/' },
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
});
