/**
 * MFA context tests (C2, #53) — toggle state, unenroll, error surface, and
 * sign-out purge. The network layer (`@/features/mfa/api`) is mocked; the
 * domain filter (`hasVerifiedTotp`) runs for real, so an unverified factor
 * can never flip the toggle here either.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Pressable, Text } from 'react-native';

import { MfaProvider, useMfa } from '@/features/mfa';

const api = require('@/features/mfa/api');

jest.mock('@/features/mfa/api', () => ({
  listMfaFactors: jest.fn(),
  unenrollMfaFactor: jest.fn(),
}));

const listMfaFactors: jest.Mock = api.listMfaFactors;
const unenrollMfaFactor: jest.Mock = api.unenrollMfaFactor;

const VERIFIED = { id: 'factor-1', status: 'verified', factor_type: 'totp' };
const PENDING = { id: 'factor-2', status: 'unverified', factor_type: 'totp' };

function Harness() {
  const { enabled, factorId, loading, error, refresh, unenroll } = useMfa();
  return (
    <>
      <Text testID="enabled">{enabled ? 'on' : 'off'}</Text>
      <Text testID="factor">{factorId ?? 'none'}</Text>
      <Text testID="loading">{loading ? 'busy' : 'idle'}</Text>
      <Text testID="error">{error ?? 'ok'}</Text>
      <Pressable testID="refresh" onPress={() => void refresh()}>
        <Text>refresh</Text>
      </Pressable>
      <Pressable testID="unenroll" onPress={() => void unenroll()}>
        <Text>unenroll</Text>
      </Pressable>
    </>
  );
}

function renderMfa() {
  return render(
    <MfaProvider>
      <Harness />
    </MfaProvider>,
  );
}

beforeEach(() => {
  jest.clearAllMocks();
  listMfaFactors.mockResolvedValue({ all: [], totp: [] });
  unenrollMfaFactor.mockResolvedValue(undefined);
});

describe('mfa context (C2)', () => {
  it('defaults to off when no factors exist', async () => {
    renderMfa();

    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('idle'));
    expect(screen.getByTestId('enabled').props.children).toBe('off');
    expect(screen.getByTestId('factor').props.children).toBe('none');
    expect(screen.getByTestId('error').props.children).toBe('ok');
  });

  it('turns on with the verified factor id when 2FA is enrolled', async () => {
    listMfaFactors.mockResolvedValue({ all: [VERIFIED], totp: [VERIFIED] });
    renderMfa();

    await waitFor(() => expect(screen.getByTestId('enabled').props.children).toBe('on'));
    expect(screen.getByTestId('factor').props.children).toBe('factor-1');
  });

  it('ignores an unverified (abandoned enroll) factor', async () => {
    listMfaFactors.mockResolvedValue({ all: [PENDING], totp: [] });
    renderMfa();

    await waitFor(() => expect(screen.getByTestId('loading').props.children).toBe('idle'));
    expect(screen.getByTestId('enabled').props.children).toBe('off');
  });

  it('unenroll removes the factor and flips the toggle off', async () => {
    listMfaFactors.mockResolvedValue({ all: [VERIFIED], totp: [VERIFIED] });
    renderMfa();
    await waitFor(() => expect(screen.getByTestId('enabled').props.children).toBe('on'));

    listMfaFactors.mockResolvedValue({ all: [], totp: [] });
    fireEvent.press(screen.getByTestId('unenroll'));

    await waitFor(() => expect(screen.getByTestId('enabled').props.children).toBe('off'));
    expect(unenrollMfaFactor).toHaveBeenCalledWith('factor-1');
    expect(screen.getByTestId('factor').props.children).toBe('none');
  });

  it('surfaces a failing factors read without crashing', async () => {
    listMfaFactors.mockRejectedValue(new Error('jaringan putus'));
    renderMfa();

    await waitFor(() =>
      expect(screen.getByTestId('error').props.children).toBe('jaringan putus'),
    );
    expect(screen.getByTestId('enabled').props.children).toBe('off');
  });

  it('sign-out purge resets the in-memory copy (factors stay server-side)', async () => {
    listMfaFactors.mockResolvedValue({ all: [VERIFIED], totp: [VERIFIED] });
    renderMfa();
    await waitFor(() => expect(screen.getByTestId('enabled').props.children).toBe('on'));

    const { purgeLocalUserData } = require('@/supabase');
    await purgeLocalUserData();

    await waitFor(() => expect(screen.getByTestId('enabled').props.children).toBe('off'));
    expect(screen.getByTestId('factor').props.children).toBe('none');
  });
});
