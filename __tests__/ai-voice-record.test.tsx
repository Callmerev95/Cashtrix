/**
 * Voice record loader shape (record-button bug, Oct 2026).
 *
 * Regression seam: the sheet reached for `require('expo-audio').AudioModule`,
 * but `AudioModule` is internal to the package (never re-exported) — only
 * the root (`requestRecordingPermissionsAsync`, `RecordingPresets`) plus the
 * native recorder class are reachable. The old shape threw on every device
 * and the button died silent with `unavailable`. These tests pin the public
 * shape: a root WITHOUT `AudioModule` must still start recording, and every
 * later failure must surface a visible status (never silence).
 */
import { act, fireEvent, render, screen } from '@testing-library/react-native';

import { VoiceSheet } from '@/features/voice/components/voice-sheet';

jest.mock('@/features/voice/api', () => {
  const actual = jest.requireActual('@/features/voice/api');
  return {
    ...actual,
    requestAiVoice: jest.fn(async () => ({ status: 'empty' })),
    aiVoiceDisplayDelay: jest.fn(async () => undefined),
    hasVoiceConsent: jest.fn(async () => true),
    setVoiceConsent: jest.fn(async () => undefined),
    hasRecordConsent: jest.fn(async () => true),
    setRecordConsent: jest.fn(async () => undefined),
    uploadVoiceRecording: jest.fn(async () => 'user-1/rec.m4a'),
    requestAiTranscribe: jest.fn(async () => ({ status: 'empty' })),
  };
});

jest.mock('@/features/haptics', () => ({
  tapPrefill: jest.fn().mockResolvedValue(undefined),
  tapRecord: jest.fn().mockResolvedValue(undefined),
}));

class MockAudioRecorder {
  uri: string | null = 'file:///rec.m4a';

  async prepareToRecordAsync(): Promise<void> {
    return undefined;
  }

  record(): void {
    return undefined;
  }

  async stop(): Promise<void> {
    return undefined;
  }
}

jest.mock('expo-audio', () => ({
  requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  RecordingPresets: { HIGH_QUALITY: {} },
}));

jest.mock('expo-audio/build/AudioModule', () => ({
  default: { AudioRecorder: MockAudioRecorder },
}));

const expoAudio = jest.requireMock('expo-audio');
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

beforeEach(() => {
  jest.clearAllMocks();
});

test('public root shape (no AudioModule export) still starts recording', async () => {
  renderSheet();
  expect(
    (expoAudio as { AudioModule?: unknown }).AudioModule,
  ).toBeUndefined();

  await act(async () => {
    fireEvent.press(screen.getByTestId('voice-record'));
  });

  // Recording runs: the live timer shows, never the unavailable note.
  expect(screen.getByTestId('voice-timer')).toBeTruthy();
  expect(screen.queryByTestId('voice-status')).toBeNull();

  await act(async () => {
    fireEvent.press(screen.getByTestId('voice-record'));
  });
  expect(screen.queryByTestId('voice-timer')).toBeNull();
});

test('untranscribable audio ends in a visible failed note (never silence)', async () => {
  renderSheet();

  await act(async () => {
    fireEvent.press(screen.getByTestId('voice-record'));
  });
  expect(screen.getByTestId('voice-timer')).toBeTruthy();

  await act(async () => {
    fireEvent.press(screen.getByTestId('voice-record'));
  });
  // transcribe-voice answers { ok: false } for the empty clip (mocked
  // `empty`): the failed branch must say so on screen.
  expect(await screen.findByTestId('voice-status')).toBeTruthy();
  expect(screen.getByText(/gagal diproses/)).toBeTruthy();
});

test('denied OS permission surfaces the denied note (never silence)', async () => {
  expoAudio.requestRecordingPermissionsAsync.mockResolvedValueOnce({
    granted: false,
  });
  renderSheet();

  await act(async () => {
    fireEvent.press(screen.getByTestId('voice-record'));
  });

  expect(await screen.findByTestId('voice-status')).toBeTruthy();
  expect(screen.queryByTestId('voice-timer')).toBeNull();
});

test('null AI category hint falls back to the local table (rekam)', async () => {
  // Model mengembalikan kata mentah/null untuk kategori (kasus pemilik:
  // dompet terdeteksi, kategori kosong) — jaring lokal dari transkrip
  // mengisi kartu + form dengan "Makanan".
  voiceApi.requestAiTranscribe.mockResolvedValueOnce({
    status: 'ok',
    prefill: {
      amount: 15000,
      kind: 'expense',
      walletHint: null,
      categoryHint: null,
      note: 'beli nasi goreng',
    },
  });
  renderSheet();

  await act(async () => {
    fireEvent.press(screen.getByTestId('voice-record'));
  });
  expect(screen.getByTestId('voice-timer')).toBeTruthy();

  await act(async () => {
    fireEvent.press(screen.getByTestId('voice-record'));
  });
  expect(await screen.findByTestId('voice-confirm-card')).toBeTruthy();
  expect(
    screen.getByText('15.000 · Pengeluaran · Makanan'),
  ).toBeTruthy();
});
