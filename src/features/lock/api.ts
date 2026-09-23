/**
 * Lock storage + OS biometric bridge (B4, ADR-0007).
 *
 * `expo-local-authentication` is a new native module (deferred preview
 * rebuild): the JS bundle carries it, but the native side may be missing
 * (Expo Go, Jest, a not-yet-rebuilt binary). Every call is wrapped so an
 * absent module or a throwing bridge degrades to `false` instead of crashing
 * the JS loop — same lesson as netinfo/D4. The app stores no secret; the OS
 * prompt handles the biometric + device-passcode fallback.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  LOCK_ENABLED_KEY,
  lockEnabledValue,
  parseLockEnabled,
} from './domain';

/** Duck-typed surface — kept minimal so a version bump cannot break the app. */
type LocalAuthModule = {
  hasHardwareAsync?: () => Promise<boolean>;
  isEnrolledAsync?: () => Promise<boolean>;
  authenticateAsync?: (options?: { promptMessage?: string }) => Promise<{
    success: boolean;
  }>;
};

function localAuth(): LocalAuthModule | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('expo-local-authentication') as LocalAuthModule;
  } catch {
    return null;
  }
}

export async function readLockEnabled(): Promise<boolean> {
  try {
    return parseLockEnabled(await AsyncStorage.getItem(LOCK_ENABLED_KEY));
  } catch {
    return false;
  }
}

export async function writeLockEnabled(enabled: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(LOCK_ENABLED_KEY, lockEnabledValue(enabled));
  } catch {
    // A convenience gate must never crash the toggle; the in-memory state
    // stays authoritative for this session.
  }
}

/** true only when the device has biometric hardware AND an enrollment. */
export async function isBiometricAvailable(): Promise<boolean> {
  const mod = localAuth();
  if (!mod?.hasHardwareAsync || !mod?.isEnrolledAsync) return false;
  try {
    const [hasHardware, enrolled] = await Promise.all([
      mod.hasHardwareAsync(),
      mod.isEnrolledAsync(),
    ]);
    return hasHardware === true && enrolled === true;
  } catch {
    return false;
  }
}

/**
 * Prompts the OS biometric scanner with device-passcode fallback kept on
 * (`disableDeviceFallback` stays false) — the app never stores a secret.
 */
export async function authenticateUnlock(promptMessage: string): Promise<boolean> {
  const mod = localAuth();
  if (!mod?.authenticateAsync) return false;
  try {
    const result = await mod.authenticateAsync({ promptMessage });
    return result?.success === true;
  } catch {
    return false;
  }
}