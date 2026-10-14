/**
 * Insight consent store (L1 auto, Analytics Overhaul).
 *
 * Module-level + `useSyncExternalStore` (pola `quick-action-store`): no
 * provider, no ordering issues. `true` = user consented AND wants
 * background auto-rephrase on every new summary; `false` also clears the
 * AI lines at the call site (revoke actually revokes — consent without a
 * way out is a trap). Persisted device-local, outside sign-out purge.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { hasInsightConsent, INSIGHT_CONSENT_KEY } from './insight';

let cached: boolean | null = null;
let loading = false;
/** Explicit set wins over the lazy load (no stale-read overwrite race). */
let settled = false;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((notify) => notify());
}

export function subscribeInsightConsent(notify: () => void): () => void {
  if (!loading) {
    loading = true;
    void hasInsightConsent().then((value) => {
      if (!settled) {
        cached = value;
        emit();
      }
    });
  }
  listeners.add(notify);
  return () => {
    listeners.delete(notify);
  };
}

export function getInsightConsentSnapshot(): boolean {
  return cached ?? false;
}

export async function setInsightConsented(value: boolean): Promise<void> {
  settled = true;
  cached = value;
  emit();
  try {
    if (value) {
      await AsyncStorage.setItem(INSIGHT_CONSENT_KEY, '1');
    } else {
      await AsyncStorage.removeItem(INSIGHT_CONSENT_KEY);
    }
  } catch {
    // Best-effort: a failed write just means the toggle re-reads next mount.
  }
}
