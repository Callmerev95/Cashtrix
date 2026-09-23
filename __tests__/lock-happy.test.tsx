/**
 * Lock context happy path (B4, ADR-0007) — the branch the default
 * expo-local-authentication stand-in cannot reach (it always throws, cf.
 * `lock-context.test.tsx`): a device WITH enrolled biometrics and a working
 * scanner. Only the lock API is mocked, so the provider/overlay wiring —
 * cold-start lock, capability flag, unlock clearing the lock — is real.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { LockProvider, useLock } from '@/features/lock';

jest.mock('@/features/lock/api', () => {
  const actual = jest.requireActual('@/features/lock/api');
  return {
    ...actual,
    readLockEnabled: jest.fn(),
    writeLockEnabled: jest.fn().mockResolvedValue(undefined),
    isBiometricAvailable: jest.fn(),
    authenticateUnlock: jest.fn(),
  };
});

const api = jest.requireMock('@/features/lock/api');

function Harness() {
  const { enabled, locked, biometricsReady, setEnabled, unlock } = useLock();
  return (
    <>
      <Text testID="enabled">{enabled ? 'on' : 'off'}</Text>
      <Text testID="locked">{locked ? 'locked' : 'unlocked'}</Text>
      <Text testID="bio">{biometricsReady ? 'ready' : 'unavailable'}</Text>
      <Pressable testID="enable" onPress={() => void setEnabled(true)}>
        <Text>enable</Text>
      </Pressable>
      <Pressable testID="unlock" onPress={() => void unlock('Buka kunci Cashtrix')}>
        <Text>unlock</Text>
      </Pressable>
    </>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  api.isBiometricAvailable.mockResolvedValue(true);
  api.authenticateUnlock.mockResolvedValue(true);
  api.readLockEnabled.mockResolvedValue(true);
});

describe('lock context happy path (B4)', () => {
  it('locks on cold start and lists biometrics as ready', async () => {
    render(
      <LockProvider>
        <Harness />
      </LockProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('locked').props.children).toBe('locked'));
    await waitFor(() => expect(screen.getByTestId('bio').props.children).toBe('ready'));
    expect(screen.getByTestId('enabled').props.children).toBe('on');
  });

  it('a successful OS prompt clears the lock and passes the prompt message', async () => {
    render(
      <LockProvider>
        <Harness />
      </LockProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('locked').props.children).toBe('locked'));

    fireEvent.press(screen.getByTestId('unlock'));

    await waitFor(() => expect(screen.getByTestId('locked').props.children).toBe('unlocked'));
    expect(api.authenticateUnlock).toHaveBeenCalledWith('Buka kunci Cashtrix');
  });

  it('a failed OS prompt keeps the app locked', async () => {
    api.authenticateUnlock.mockResolvedValue(false);
    render(
      <LockProvider>
        <Harness />
      </LockProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('locked').props.children).toBe('locked'));

    fireEvent.press(screen.getByTestId('unlock'));

    await waitFor(() => expect(api.authenticateUnlock).toHaveBeenCalled());
    expect(screen.getByTestId('locked').props.children).toBe('locked');
  });
});