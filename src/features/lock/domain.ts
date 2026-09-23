/**
 * App-lock domain (B4, ADR-0007) — pure helpers only, the Jest seam.
 *
 * The lock is device-local: a persisted flag plus the background→foreground
 * grace window. Nothing here touches the native bridge, so the timing rule and
 * the flag encoding are unit-tested rather than eyeballed.
 */

/** AsyncStorage key for the opt-in flag; registered in `LOCAL_STORAGE_KEYS`. */
export const LOCK_ENABLED_KEY = 'cashtrix:app-lock-enabled';

/** Background → foreground grace before the app re-locks (ADR-0007). */
export const LOCK_GRACE_MS = 60_000;

/** `'1'` is the only truthy encoding — anything else (incl. null) is off. */
export function parseLockEnabled(raw: string | null): boolean {
  return raw === '1';
}

export function lockEnabledValue(enabled: boolean): string {
  return enabled ? '1' : '0';
}

/** True once the app has been away for at least the grace window. */
export function shouldLockOnResume(
  backgroundedAt: number,
  now: number,
  graceMs: number = LOCK_GRACE_MS,
): boolean {
  return now - backgroundedAt >= graceMs;
}
