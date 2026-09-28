/**
 * Balance visibility (hero eye toggle) — a device display preference, never
 * synced, never purged on sign-out (same rule as the scan consent: hiding
 * once stays hidden). Everything here is best-effort: storage never blocks
 * the toggle, and a corrupt value reads as visible.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

export const BALANCE_HIDDEN_KEY = 'cashtrix:balance-hidden';

/** Only the exact `'1'` this module writes counts as hidden. */
export function parseBalanceHidden(value: unknown): boolean {
  return value === '1';
}

export async function readBalanceHidden(): Promise<boolean> {
  try {
    return parseBalanceHidden(await AsyncStorage.getItem(BALANCE_HIDDEN_KEY));
  } catch {
    return false;
  }
}

export async function writeBalanceHidden(hidden: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(BALANCE_HIDDEN_KEY, hidden ? '1' : '0');
  } catch {
    // Display-only; a failed persist never blocks the toggle.
  }
}
