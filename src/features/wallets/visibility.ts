/**
 * Balance visibility (hero eye toggle) — a device display preference, never
 * synced, never purged on sign-out (same rule as the scan consent: hiding
 * once stays hidden). One module-level store so every money surface follows
 * the same eye (Dashboard hero + wallet rows + `/wallets`), not just the hero.
 * Everything here is best-effort: storage never blocks the toggle, and a
 * corrupt value reads as visible.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export const BALANCE_HIDDEN_KEY = 'cashtrix:balance-hidden';

/** Masked amount for wallet rows — 4 bullets, owner screenshot reference. */
export const MASKED_BALANCE_ROW = 'Rp ••••';
/** Masked amount for the hero card — 6 bullets keep its wide layout. */
export const MASKED_BALANCE_HERO = 'Rp ••••••';

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

// Shared store (pola `insight-consent`): hydration once per process, and an
// explicit toggle wins over a late read so it can never overwrite the user.

let hidden = false;
let settled = false;
let hydrating = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((notify) => notify());
}

function hydrate() {
  if (settled || hydrating) return;
  hydrating = true;
  void readBalanceHidden().then((value) => {
    hydrating = false;
    if (settled) return;
    settled = true;
    hidden = value;
    emit();
  });
}

export function subscribeBalanceHidden(notify: () => void): () => void {
  hydrate();
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

export function getBalanceHiddenSnapshot(): boolean {
  return hidden;
}

export function setBalanceHidden(next: boolean): void {
  settled = true;
  hidden = next;
  emit();
  void writeBalanceHidden(next);
}

export function toggleBalanceHidden(): void {
  setBalanceHidden(!hidden);
}

/** Every balance surface reads the same preference through this hook. */
export function useBalanceHidden(): {
  hidden: boolean;
  toggle: () => void;
} {
  const value = useSyncExternalStore(
    subscribeBalanceHidden,
    getBalanceHiddenSnapshot,
    getBalanceHiddenSnapshot,
  );
  return { hidden: value, toggle: toggleBalanceHidden };
}

/** Test-only: the module store outlives a single test case. */
export function resetBalanceVisibilityForTests(): void {
  hidden = false;
  settled = false;
  hydrating = false;
  listeners.clear();
}
