/**
 * Voice bottom-sheet open/close contract (voice gate bug, Oct 2026).
 *
 * Phase 1 loop for "mic turns gold, no sheet opens": the state chain
 * (`voice-mic` tap → `onOpenChange(true)` → `open=true`) is proven live by
 * the gold icon, so this test pins the remaining link — the sheet shell
 * must show `voice-sheet` when open and hide it on close (mic toggle and
 * backdrop tap). The shell is React Native's core `Modal` (declarative
 * `visible`, separate window), so the real component runs here with no
 * native-module stand-ins: this is the same code path as the device.
 */
import { fireEvent, render, screen } from '@testing-library/react-native';
import { useState } from 'react';

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

const WALLETS = [{ id: 'wallet-cash', name: 'Cash' }];

function renderControlledSheet() {
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <VoiceSheet
        open={open}
        onOpenChange={setOpen}
        wallets={WALLETS}
        onPrefill={jest.fn()}
      />
    );
  }
  render(<Harness />);
}

test('tapping voice-mic shows voice-sheet; tapping again hides it', async () => {
  renderControlledSheet();
  expect(screen.queryByTestId('voice-sheet')).toBeNull();

  fireEvent.press(screen.getByTestId('voice-mic'));
  expect(await screen.findByTestId('voice-sheet')).toBeTruthy();

  fireEvent.press(screen.getByTestId('voice-mic'));
  expect(screen.queryByTestId('voice-sheet')).toBeNull();
});

test('tapping the scrim closes the sheet', async () => {
  renderControlledSheet();
  fireEvent.press(screen.getByTestId('voice-mic'));
  expect(await screen.findByTestId('voice-sheet')).toBeTruthy();

  fireEvent.press(screen.getByTestId('voice-sheet-scrim'));
  expect(screen.queryByTestId('voice-sheet')).toBeNull();
});
