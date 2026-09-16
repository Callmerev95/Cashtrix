/**
 * Navigation shell smoke test — mounts the real Expo Router tree and
 * verifies the T1 acceptance criteria: four tabs render in the floating bar
 * and the centre FAB opens the Add Transaction modal route.
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

describe('navigation shell', () => {
  it('renders the four tabs in the floating bar', () => {
    renderRouter('app', { initialUrl: '/' });

    expect(screen.getByLabelText('Dashboard')).toBeTruthy();
    expect(screen.getByLabelText('Analytics')).toBeTruthy();
    expect(screen.getByLabelText('Budgets')).toBeTruthy();
    expect(screen.getByLabelText('Profile')).toBeTruthy();
  });

  it('exposes the centre FAB that opens Add Transaction', () => {
    const { getPathname } = renderRouter('app', { initialUrl: '/' });

    fireEvent.press(screen.getByLabelText('Add Transaction'));

    expect(getPathname()).toBe('/add-transaction');
  });

  it('switches tab when a bar item is pressed', () => {
    const { getPathname } = renderRouter('app', { initialUrl: '/' });

    fireEvent.press(screen.getByLabelText('Budgets'));

    expect(getPathname()).toBe('/budgets');
  });

  it('opens the Dashboard tab by default', () => {
    const { getPathname } = renderRouter('app', { initialUrl: '/' });
    expect(getPathname()).toBe('/');
  });
});
