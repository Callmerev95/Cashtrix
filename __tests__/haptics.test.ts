/**
 * Haptics wiring tests — the Jest seam for batch B1 (ADR-0016).
 *
 * The default `expo-haptics` stand-in resolves every call, so what is
 * locked here is the tap → native-call map plus the never-throw guarantee
 * when the bridge rejects. The module-absent path lives in
 * `haptics-absent.test.ts`.
 */
import {
  recordImpactStyle,
  tapPrefill,
  tapRecord,
  tapSave,
  tapThreshold,
  tapToggle,
  tapUndo,
} from '@/features/haptics';

const haptics = jest.requireMock('expo-haptics');

beforeEach(() => {
  jest.clearAllMocks();
});

test('tap map: save/undo/threshold/record/toggle/prefill hit the right native calls', async () => {
  await tapSave();
  expect(haptics.notificationAsync).toHaveBeenCalledWith('success');

  await tapUndo();
  expect(haptics.impactAsync).toHaveBeenCalledWith('medium');

  await tapThreshold();
  expect(haptics.notificationAsync).toHaveBeenCalledWith('warning');

  await tapRecord('start');
  expect(haptics.impactAsync).toHaveBeenCalledWith('heavy');

  await tapRecord('stop');
  expect(haptics.impactAsync).toHaveBeenCalledWith('light');

  await tapToggle();
  expect(haptics.impactAsync).toHaveBeenCalledWith('light');

  await tapPrefill();
  expect(haptics.selectionAsync).toHaveBeenCalledTimes(1);
});

test('recordImpactStyle: start lands heavy, stop lands light', () => {
  expect(recordImpactStyle('start')).toBe('heavy');
  expect(recordImpactStyle('stop')).toBe('light');
});

test('taps never throw when the bridge rejects', async () => {
  haptics.notificationAsync.mockRejectedValueOnce(new Error('bridge down'));
  haptics.impactAsync.mockRejectedValue(new Error('bridge down'));
  haptics.selectionAsync.mockRejectedValueOnce(new Error('bridge down'));

  await expect(
    Promise.all([
      tapSave(),
      tapUndo(),
      tapThreshold(),
      tapRecord('start'),
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
  ]);
});
