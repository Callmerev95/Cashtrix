/**
 * Reconnect refresh (D4) — refires the reads an offline stretch may have
 * failed, plus the recurring catch-up (occurrences due while offline only
 * materialize on app open/foreground otherwise).
 *
 * Mounted once, innermost in the provider chain so every refresh hook is in
 * scope. The mount itself never refreshes (providers just loaded); only an
 * offline→online transition does. Like the providers' own mount effects, the
 * effect only *starts* async work — every refresh lands its state in promise
 * callbacks, so `react-hooks/set-state-in-effect` stays quiet. Everything is
 * best-effort: a failed reconnect refresh must not break the session.
 */
import { useEffect, useRef } from 'react';

import { useAnalytics } from '@/features/analytics';
import { useAuth } from '@/features/auth';
import { useBudgets } from '@/features/budgets';
import { useRecurring } from '@/features/recurring';
import { useTransactions } from '@/features/transactions';
import { useWallets } from '@/features/wallets';

import { useConnectivity } from './connectivity-context';

export function ReconnectRefresh() {
  const { isOnline } = useConnectivity();
  const { refresh: refreshWallets } = useWallets();
  const { refresh: refreshTransactions } = useTransactions();
  const { refresh: refreshBudgets, evaluateAndAlert } = useBudgets();
  const { refresh: refreshAnalytics } = useAnalytics();
  const { runCatchUp } = useRecurring();
  const { session } = useAuth();
  const userId = session?.user.id;

  const wasOnline = useRef<boolean | null>(null);

  useEffect(() => {
    if (wasOnline.current === null) {
      wasOnline.current = isOnline;
      return;
    }
    const reconnected = !wasOnline.current && isOnline;
    wasOnline.current = isOnline;
    if (!reconnected) return;

    void runCatchUp()
      .catch(() => 0)
      .then(() =>
        Promise.all([
          refreshWallets(),
          refreshTransactions(),
          refreshBudgets(),
          refreshAnalytics(),
        ]),
      )
      .then(() => evaluateAndAlert({ userId: userId ?? '' }))
      .catch(() => undefined);
  }, [
    isOnline,
    refreshWallets,
    refreshTransactions,
    refreshBudgets,
    refreshAnalytics,
    runCatchUp,
    evaluateAndAlert,
    userId,
  ]);

  return null;
}
