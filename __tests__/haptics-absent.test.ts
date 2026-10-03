/**
 * Haptics absent-module path (B1, ADR-0016) — the branch the default
 * stand-in cannot reach (it always resolves, cf. `haptics.test.ts`):
 * a binary without the native side (Expo Go before the single preview
 * rebuild). Every tap must resolve silently instead of crashing the
 * action it celebrates.
 */
import {
  tapPrefill,
  tapRecord,
  tapSave,
  tapThreshold,
  tapToggle,
  tapUndo,
} from '@/features/haptics';

jest.mock('expo-haptics', () => {
  throw new Error('expo-haptics native module unavailable');
});

test('all taps resolve silently when the native module is absent', async () => {
  await expect(
    Promise.all([
      tapSave(),
      tapUndo(),
      tapThreshold(),
      tapRecord('start'),
      tapRecord('stop'),
      tapToggle(),
      tapPrefill(),
    ]),
  ).resolves.toEqual([
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
    undefined,
  ]);
});
