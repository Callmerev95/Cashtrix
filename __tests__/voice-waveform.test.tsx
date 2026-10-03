/**
 * Waveform + prefill-haptic tests — the Jest seam for B1 item (d).
 *
 * Locked: the View-only waveform appears while the AI prefill is
 * in flight (and never before the first keystroke), and exactly one
 * `tapPrefill` fires when the AI prefill actually lands. The sheet's AI
 * API is mocked with a deferred promise so the loading window is
 * observable; haptics is a recording stand-in.
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { tapPrefill } from '@/features/haptics';
import { VoiceSheet } from '@/features/voice/components/voice-sheet';
import type { AiVoiceOutcome } from '@/features/voice/api';

jest.mock('@/features/voice/api', () => {
  const actual = jest.requireActual('@/features/voice/api');
  return {
    ...actual,
    requestAiVoice: jest.fn(),
    aiVoiceDisplayDelay: jest.fn(async () => undefined),
    hasVoiceConsent: jest.fn(async () => true),
    setVoiceConsent: jest.fn(async () => undefined),
  };
});

jest.mock('@/features/haptics', () => ({
  tapPrefill: jest.fn().mockResolvedValue(undefined),
}));

const voiceApi = jest.requireMock('@/features/voice/api');
const tapPrefillMock = tapPrefill as unknown as jest.Mock;

const WALLETS = [{ id: 'wallet-cash', name: 'Cash' }];

function renderSheet(onPrefill = jest.fn()) {
  render(
    <VoiceSheet
      open
      wallets={WALLETS}
      onPrefill={onPrefill}
    />,
  );
  return { onPrefill };
}

beforeEach(() => {
  jest.clearAllMocks();
  voiceApi.hasVoiceConsent.mockResolvedValue(true);
  voiceApi.aiVoiceDisplayDelay.mockResolvedValue(undefined);
});

test('no waveform before the first keystroke', () => {
  renderSheet();
  expect(
    screen.queryByTestId('voice-waveform', { includeHiddenElements: true }),
  ).toBeNull();
  expect(screen.queryByTestId('voice-status')).toBeNull();
});

test('waveform shows during AI flight; one tapPrefill + prefill on landing', async () => {
  let resolveAi: ((outcome: AiVoiceOutcome) => void) | null = null;
  voiceApi.requestAiVoice.mockImplementation(
    () =>
      new Promise<AiVoiceOutcome>((resolve) => {
        resolveAi = resolve;
      }),
  );
  const { onPrefill } = renderSheet();

  fireEvent.changeText(screen.getByTestId('voice-input'), 'soto 25rb');
  // Decorative (hidden from accessibility services, like the AI pulse
  // ring), so the query opts into hidden elements.
  expect(
    await screen.findByTestId('voice-waveform', {
      includeHiddenElements: true,
    }),
  ).toBeTruthy();
  expect(tapPrefillMock).not.toHaveBeenCalled();

  const prefill = {
    amount: 25000,
    kind: 'expense' as const,
    walletHint: null,
    categoryHint: null,
    note: 'soto',
  };
  await act(async () => {
    resolveAi?.({ status: 'ok', prefill });
  });

  expect(onPrefill).toHaveBeenCalledWith({
    amount: 25000,
    kind: 'expense',
    walletId: null,
    categoryHint: null,
    note: 'soto',
  });
  expect(tapPrefillMock).toHaveBeenCalledTimes(1);
  expect(
    screen.queryByTestId('voice-waveform', { includeHiddenElements: true }),
  ).toBeNull();
});
