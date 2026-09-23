export { LockProvider, useLock } from './lock-context';
export { LockOverlay } from './components/lock-overlay';
export {
  LOCK_ENABLED_KEY,
  LOCK_GRACE_MS,
  lockEnabledValue,
  parseLockEnabled,
  shouldLockOnResume,
} from './domain';
export {
  authenticateUnlock,
  isBiometricAvailable,
  readLockEnabled,
  writeLockEnabled,
} from './api';