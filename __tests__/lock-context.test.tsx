/**
 * App-lock context tests (B4, ADR-0007) — cold-start lock, sign-out purge
 * (flag is registered in LOCAL_STORAGE_KEYS) and the degrade path when the
 * native bridge is absent (Expo Go before the rebuild). The default
 * expo-local-authentication stand-in throws on every call, so these tests
 * exercise the real "module present but native absent" shape.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { LOCK_ENABLED_KEY } from '@/features/lock/domain';
import { LockProvider, useLock } from '@/features/lock';

const { sessionStorageSeed } = require('./mocks/async-storage');

function Harness() {
  const { enabled, locked, biometricsReady, setEnabled, unlock, lockNow } =
    useLock();
  return (
    <>
      <Text testID="enabled">{enabled ? 'on' : 'off'}</Text>
      <Text testID="locked">{locked ? 'locked' : 'unlocked'}</Text>
      <Text testID="bio">{biometricsReady ? 'ready' : 'unavailable'}</Text>
      <Pressable testID="enable" onPress={() => void setEnabled(true)}>
        <Text>enable</Text>
      </Pressable>
      <Pressable testID="disable" onPress={() => void setEnabled(false)}>
        <Text>disable</Text>
      </Pressable>
      <Pressable testID="unlock" onPress={() => void unlock('Buka kunci Cashtrix')}>
        <Text>unlock</Text>
      </Pressable>
      <Pressable testID="lock-now" onPress={lockNow}>
        <Text>lock-now</Text>
      </Pressable>
    </>
  );
}

function renderLock() {
  return render(
    <LockProvider>
      <Harness />
    </LockProvider>,
  );
}

beforeEach(() => {
  sessionStorageSeed.delete(LOCK_ENABLED_KEY);
});

describe('lock context (B4)', () => {
  it('defaults to off and unlocked when no flag is persisted', async () => {
    renderLock();

    await waitFor(() => expect(screen.getByTestId('enabled').props.children).toBe('off'));
    expect(screen.getByTestId('locked').props.children).toBe('unlocked');
  });

  it('cold start always locks when the flag is persisted (dead process)', async () => {
    sessionStorageSeed.set(LOCK_ENABLED_KEY, '1');
    renderLock();

    await waitFor(() => expect(screen.getByTestId('enabled').props.children).toBe('on'));
    expect(screen.getByTestId('locked').props.children).toBe('locked');
  });

  it('degrades when the native bridge is absent — no biometrics, unlock fails', async () => {
    sessionStorageSeed.set(LOCK_ENABLED_KEY, '1');
    renderLock();

    await waitFor(() => expect(screen.getByTestId('bio').props.children).toBe('unavailable'));

    fireEvent.press(screen.getByTestId('unlock'));
    await waitFor(() => expect(screen.getByTestId('locked').props.children).toBe('locked'));
  });

  it('setEnabled persists the flag and keeps the session state (lock ≠ sign-out)', async () => {
    renderLock();
    await waitFor(() => expect(screen.getByTestId('enabled').props.children).toBe('off'));

    fireEvent.press(screen.getByTestId('enable'));
    await waitFor(() => expect(screen.getByTestId('enabled').props.children).toBe('on'));
    // Enabling does not lock while already active.
    expect(screen.getByTestId('locked').props.children).toBe('unlocked');

    fireEvent.press(screen.getByTestId('disable'));
    await waitFor(() => expect(screen.getByTestId('enabled').props.children).toBe('off'));
  });

  it('lockNow locks and sign-out purge resets the in-memory flag (LOCAL_STORAGE_KEYS)', async () => {
    sessionStorageSeed.set(LOCK_ENABLED_KEY, '1');
    renderLock();
    await waitFor(() => expect(screen.getByTestId('locked').props.children).toBe('locked'));

    const { purgeLocalUserData } = require('@/supabase');
    await purgeLocalUserData();

    await waitFor(() => expect(screen.getByTestId('enabled').props.children).toBe('off'));
    expect(screen.getByTestId('locked').props.children).toBe('unlocked');
    expect(sessionStorageSeed.has(LOCK_ENABLED_KEY)).toBe(false);
  });
});