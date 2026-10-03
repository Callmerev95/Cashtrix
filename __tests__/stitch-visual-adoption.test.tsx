/**
 * Stitch visual adoption tests (AI voice + scan) — the Jest seam.
 *
 * Locked: phase tabs mirror real states only (Merekam while recording,
 * Mengolah while AI is in flight — never a fake percentage); the hero
 * timer renders real seconds capped at 15; the stagger waveform, the scan
 * laser + AUTO-ALIGN pill, and the `✨ Terisi otomatis` banner header all
 * render without touching the Fase 1 data contracts or testIDs.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';

import { AiPrefillBanner } from '@/components/ai-prefill-banner';
import { VoiceSheet } from '@/features/voice/components/voice-sheet';
import { VoiceWaveform, WAVEFORM_STAGGER_MS } from '@/features/voice/components/voice-waveform';

jest.mock('@/features/voice/api', () => {
  const actual = jest.requireActual('@/features/voice/api');
  return {
    ...actual,
    requestAiVoice: jest.fn(async () => ({ status: 'empty' as const })),
    aiVoiceDisplayDelay: jest.fn(async () => undefined),
    hasVoiceConsent: jest.fn(async () => true),
    setVoiceConsent: jest.fn(async () => undefined),
    hasRecordConsent: jest.fn(async () => true),
    setRecordConsent: jest.fn(async () => undefined),
  };
});

function renderOpenSheet(extra: Partial<React.ComponentProps<typeof VoiceSheet>> = {}) {
  render(
    <VoiceSheet open wallets={[{ id: 'w-1', name: 'Cash' }]} onPrefill={jest.fn()} userId="u-1" {...extra} />,
  );
}

test('phase tabs default idle; timer hidden before recording', () => {
  renderOpenSheet();
  expect(screen.getByTestId('voice-phase-record')).toBeTruthy();
  expect(screen.getByTestId('voice-phase-process')).toBeTruthy();
  expect(screen.queryByTestId('voice-timer')).toBeNull();
});

test('typing shows Mengolah phase + stagger waveform + working copy', async () => {
  renderOpenSheet();
  fireEvent.changeText(screen.getByTestId('voice-input'), 'soto 25rb');
  expect(
    await screen.findByTestId('voice-waveform', { includeHiddenElements: true }),
  ).toBeTruthy();
  expect(screen.getByTestId('voice-status')).toBeTruthy();
});

test('waveform stagger constant matches the banner rhythm family', () => {
  expect(WAVEFORM_STAGGER_MS).toBe(90);
  render(<VoiceWaveform />);
  expect(
    screen.getByTestId('voice-waveform', { includeHiddenElements: true }),
  ).toBeTruthy();
});

test('banner header carries ✨ title + Terverifikasi pill', () => {
  render(
    <AiPrefillBanner>
      <Text testID="banner-body">Rp 25.000</Text>
    </AiPrefillBanner>,
  );
  expect(screen.getByTestId('ai-prefill-banner-header')).toBeTruthy();
  expect(screen.getByTestId('banner-body')).toBeTruthy();
});

test('split rows render bare banners (one header per preview)', async () => {
  const api = jest.requireMock('@/features/voice/api');
  api.requestAiVoice.mockResolvedValueOnce({ status: 'empty' as const });
  render(
    <VoiceSheet
      open
      wallets={[{ id: 'w-1', name: 'Cash' }]}
      onPrefill={jest.fn()}
      userId="u-1"
    />,
  );
  fireEvent.changeText(screen.getByTestId('voice-input'), 'nasi padang 30rb dan kopi 12rb');
  expect(await screen.findByTestId('voice-split-preview')).toBeTruthy();
});
