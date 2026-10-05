/**
 * Voice AI call discipline (rate-limit bug, Oct 2026).
 *
 * Regression seam: dictation/keyboard commits arrive word-by-word and the
 * sheet used to fire one `parse-voice` call per keystroke with no debounce —
 * a 6-word utterance burns 6 calls in seconds against a 5/min limit, and the
 * last-writer-wins 429 then clobbers any good result and suppresses the
 * local display. These tests pin the fixed discipline:
 *
 * 1. A keystroke storm inside the debounce window issues exactly ONE call.
 * 2. A stale (superseded) 429 never touches the UI.
 * 3. A live 429/quota keeps the note AND the local fallback visible
 *    (C-light: the sheet never goes dead).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { AI_VOICE_DEBOUNCE_MS } from '@/features/voice/api';
import type { AiVoiceOutcome } from '@/features/voice/api';
import { VoiceSheet } from '@/features/voice/components/voice-sheet';

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

const WALLETS = [{ id: 'wallet-cash', name: 'Cash' }];

function renderSheet() {
  render(
    <VoiceSheet
      open
      wallets={WALLETS}
      onPrefill={jest.fn()}
      userId="user-1"
    />,
  );
}

function typeStorm(full: string) {
  const input = screen.getByTestId('voice-input');
  let current = '';
  for (const char of full) {
    current += char;
    fireEvent.changeText(input, current);
  }
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  voiceApi.hasVoiceConsent.mockResolvedValue(true);
  voiceApi.aiVoiceDisplayDelay.mockResolvedValue(undefined);
  voiceApi.requestAiVoice.mockReset();
});

afterEach(() => {
  jest.useRealTimers();
});

async function settleDebounce() {
  await act(async () => {
    jest.advanceTimersByTime(AI_VOICE_DEBOUNCE_MS);
  });
}

test('a 31-char storm inside the window issues exactly one AI call', async () => {
  voiceApi.requestAiVoice.mockResolvedValue({ status: 'offline' });
  renderSheet();

  typeStorm('Beli nasi goreng 15.000 pakai dana');
  expect(voiceApi.requestAiVoice).not.toHaveBeenCalled();

  await settleDebounce();
  expect(voiceApi.requestAiVoice).toHaveBeenCalledTimes(1);
  expect(voiceApi.requestAiVoice).toHaveBeenCalledWith({
    text: 'Beli nasi goreng 15.000 pakai dana',
  });
});

test('a superseded 429 never clobbers the applied prefill', async () => {
  let resolveFirst: ((outcome: AiVoiceOutcome) => void) | null = null;
  voiceApi.requestAiVoice
    .mockImplementationOnce(
      () =>
        new Promise<AiVoiceOutcome>((resolve) => {
          resolveFirst = resolve;
        }),
    )
    .mockResolvedValueOnce({
      status: 'ok',
      prefill: {
        amount: 12000,
        kind: 'expense',
        walletHint: null,
        categoryHint: 'Makanan',
        note: 'kopi 12rb',
      },
    });
  renderSheet();

  fireEvent.changeText(screen.getByTestId('voice-input'), 'soto 25rb');
  await settleDebounce();
  expect(voiceApi.requestAiVoice).toHaveBeenCalledTimes(1);

  // A second utterance starts while the first is still in flight. The
  // second lands OK; the first resolving 429 afterwards is stale and must
  // be ignored — the applied prefill stays, no rate note appears.
  fireEvent.changeText(screen.getByTestId('voice-input'), 'kopi 12rb');
  await settleDebounce();
  expect(voiceApi.requestAiVoice).toHaveBeenCalledTimes(2);
  expect(
    await screen.findByText('12.000 · Pengeluaran · Makanan'),
  ).toBeTruthy();

  await act(async () => {
    resolveFirst?.({ status: 'rate_limited' });
  });
  expect(
    screen.queryByText(/Terlalu sering memakai suara AI/),
  ).toBeNull();
  expect(
    screen.queryByText('12.000 · Pengeluaran · Makanan'),
  ).toBeTruthy();
});

test('a live 429 keeps the note AND the local fallback visible', async () => {
  voiceApi.requestAiVoice.mockResolvedValue({ status: 'rate_limited' });
  renderSheet();

  fireEvent.changeText(screen.getByTestId('voice-input'), 'soto 25rb');
  await settleDebounce();

  const statuses = screen.getAllByTestId('voice-status');
  const texts = statuses.map((node) => node.props.children);
  expect(
    texts.some(
      (text) =>
        typeof text === 'string' &&
        text.includes('Terlalu sering memakai suara AI'),
    ),
  ).toBe(true);
  // C-light: the local parse still shows under the note (amount · kind …).
  expect(
    texts.some(
      (text) =>
        typeof text === 'string' && text.includes('25.000'),
    ),
  ).toBe(true);
});
