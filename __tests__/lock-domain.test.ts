/**
 * App-lock domain tests (B4, ADR-0007) — the Jest seam.
 *
 * Locks the flag encoding (only `'1'` means on, so a corrupt value can never
 * silently re-enable an unwanted lock) and the background→foreground grace
 * boundary (59.999s stays unlocked, 60s locks).
 */
import {
  LOCK_ENABLED_KEY,
  LOCK_GRACE_MS,
  lockEnabledValue,
  parseLockEnabled,
  shouldLockOnResume,
} from '@/features/lock';

describe('lock flag encoding (B4)', () => {
  it('only "1" is on; anything else (incl. null) is off', () => {
    expect(parseLockEnabled('1')).toBe(true);
    expect(parseLockEnabled('0')).toBe(false);
    expect(parseLockEnabled(null)).toBe(false);
    expect(parseLockEnabled('true')).toBe(false);
    expect(parseLockEnabled('')).toBe(false);
  });

  it('round-trips through lockEnabledValue', () => {
    expect(parseLockEnabled(lockEnabledValue(true))).toBe(true);
    expect(parseLockEnabled(lockEnabledValue(false))).toBe(false);
  });

  it('key is device-local and namespaced under cashtrix:', () => {
    expect(LOCK_ENABLED_KEY).toBe('cashtrix:app-lock-enabled');
  });
});

describe('background → foreground grace (B4)', () => {
  it('is 60 seconds', () => {
    expect(LOCK_GRACE_MS).toBe(60_000);
  });

  it('does not lock below the grace, locks at or above it', () => {
    const at = 1_000_000;
    expect(shouldLockOnResume(at, at + 59_999)).toBe(false);
    expect(shouldLockOnResume(at, at + 60_000)).toBe(true);
    expect(shouldLockOnResume(at, at + 120_000)).toBe(true);
  });

  it('accepts an explicit grace so the rule is testable in isolation', () => {
    expect(shouldLockOnResume(0, 5, 5)).toBe(true);
    expect(shouldLockOnResume(0, 4, 5)).toBe(false);
  });
});
