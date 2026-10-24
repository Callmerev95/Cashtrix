/**
 * Reconnect refresh (D4): refires the reads an offline stretch may have
 * failed, plus the recurring catch-up (occurrences due while offline only
 * materialize on app open/foreground otherwise).
 *
 * Mounted once, innermost in the provider chain so every refresh hook is in
 * scope. Mount only flushes a queue left by a previous session (and refreshes
 * only if something was actually sent); the full catch-up chain runs on an
 * offline→online transition. Like the providers' own mount effects, the
 * effect only *starts* async work — every refresh lands its state in promise
 * callbacks, so `react-hooks/set-state-in-effect` stays quiet. Everything is
 * best-effort: a failed reconnect refresh must not break the session.
 */
import { useEffect, useRef } from 'react';

import { useAnalytics } from '@/features/analytics';
import { useAuth } from '@/features/auth';
import { useBudgets } from '@/features/budgets';
import { useOutbox } from '@/features/outbox';
import { useProfile } from '@/features/profile';
import { useRecurring } from '@/features/recurring';
import { useSavings } from '@/features/savings';
import { useTransactions } from '@/features/transactions';
import { useWallets } from '@/features/wallets';

import { useConnectivity } from './connectivity-context';

export function ReconnectRefresh() {
  const { isOnline } = useConnectivity();
  const { refresh: refreshWallets } = useWallets();
  const { refresh: refreshTransactions } = useTransactions();
  const { refresh: refreshBudgets, evaluateAndAlert } = useBudgets();
  const { refresh: refreshAnalytics } = useAnalytics();
  const { refresh: refreshSavings } = useSavings();
  const { refresh: refreshProfile } = useProfile();
  const { runCatchUp } = useRecurring();
  const { flush } = useOutbox();
  const { session } = useAuth();
  const userId = session?.user.id;

  const wasOnline = useRef<boolean | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!userId) {
      wasOnline.current = isOnline;
      return;
    }

    const refreshAll = () =>
      Promise.all([
        refreshWallets(),
        refreshTransactions(),
        refreshBudgets(),
        refreshAnalytics(),
        refreshSavings(),
        refreshProfile(),
      ]);

    // Reconnect is the contract (story 12): catch-up first, then flush, then
    // one refresh pass, then one alert evaluation. Mount only flushes a queue
    // that survived a previous session — RecurringProvider owns mount
    // catch-up, so doing it again here would double-run the RPC.
    if (!started.current) {
      started.current = true;
      wasOnline.current = isOnline;
      if (!isOnline) return;
      void flush()
        .then((result) =>
          result.sent > 0
            ? refreshAll().then(() => evaluateAndAlert({ userId }))
            : undefined,
        )
        .catch(() => undefined);
      return;
    }

    const reconnected = !wasOnline.current && isOnline;
    wasOnline.current = isOnline;
    if (!reconnected) return;

    void runCatchUp({ deferEvaluation: true })
      .catch(() => 0)
      .then(() => flush().catch(() => undefined))
      .then(refreshAll)
      .then(() => evaluateAndAlert({ userId }))
      .catch(() => undefined);
  }, [
    isOnline,
    refreshWallets,
    refreshTransactions,
    refreshBudgets,
    refreshAnalytics,
    refreshSavings,
    refreshProfile,
    runCatchUp,
    flush,
    evaluateAndAlert,
    userId,
  ]);

  return null;
}
