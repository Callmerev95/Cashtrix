/**
 * Reconnect refresh (D4): refires the reads an offline stretch may have
 * failed, plus the recurring catch-up (occurrences due while offline only
 * materialize on app open/foreground otherwise).
 *
 * Mounted once, innermost in the provider chain so every refresh hook is in
 * scope. Mount only flushes a queue left by a previous session (and refreshes
 * only if something was actually sent); the full catch-up chain runs on an
 * offline→online transition. Retryable rows also get a bounded online retry
 * loop, so a pass that stopped on a flaky connection is not stranded until the
 * next reconnect or manual tap. Foregrounding the app flushes the queue too
 * (the recurring provider already owns its own AppState catch-up).
 *
 * Like the providers' own mount effects, the effects only *start* async work —
 * every refresh lands its state in promise callbacks, so
 * `react-hooks/set-state-in-effect` stays quiet. Everything is best-effort: a
 * failed reconnect refresh must not break the session.
 */
import { useCallback, useEffect, useRef } from 'react';
import { AppState } from 'react-native';

import { useAnalytics } from '@/features/analytics';
import { useAuth } from '@/features/auth';
import { useBudgets } from '@/features/budgets';
import {
  isRetryableOutboxRow,
  outboxRetryDelay,
  useOutbox,
} from '@/features/outbox';
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
  const { flush, pendingRows, flushing } = useOutbox();
  const { session } = useAuth();
  const userId = session?.user.id;

  const wasOnline = useRef<boolean | null>(null);
  const started = useRef(false);
  const running = useRef<Promise<void> | null>(null);
  const retryAttempt = useRef(0);

  const refreshAll = useCallback(
    () =>
      Promise.all([
        refreshWallets(),
        refreshTransactions(),
        refreshBudgets(),
        refreshAnalytics(),
        refreshSavings(),
        refreshProfile(),
      ]),
    [
      refreshWallets,
      refreshTransactions,
      refreshBudgets,
      refreshAnalytics,
      refreshSavings,
      refreshProfile,
    ],
  );

  const flushAndRefresh = useCallback(
    (catchUp: boolean) => {
      if (!userId) return Promise.resolve();
      if (running.current) return running.current;

      const run = (async () => {
        try {
          // Reconnect is the contract (story 12): catch-up first, then flush,
          // then one refresh pass, then one alert evaluation. Mount/foreground
          // only flush; RecurringProvider owns its own catch-up there.
          if (catchUp) {
            await runCatchUp({ deferEvaluation: true }).catch(() => 0);
          }
          const result = await flush().catch(() => null);
          const sent = result?.sent ?? 0;
          if (catchUp || sent > 0) {
            await refreshAll().catch(() => undefined);
            await evaluateAndAlert({ userId }).catch(() => undefined);
          }
          if (result && !result.stopped) retryAttempt.current = 0;
        } catch {
          // Best-effort: the next retry/reconnect will try again.
        }
      })();

      running.current = run;
      void run.finally(() => {
        if (running.current === run) running.current = null;
      });
      return run;
    },
    [evaluateAndAlert, flush, refreshAll, runCatchUp, userId],
  );

  useEffect(() => {
    if (!userId) {
      wasOnline.current = isOnline;
      return;
    }

    if (!started.current) {
      started.current = true;
      wasOnline.current = isOnline;
      if (isOnline) void flushAndRefresh(false);
      return;
    }

    const reconnected = !wasOnline.current && isOnline;
    wasOnline.current = isOnline;
    if (reconnected) void flushAndRefresh(true);
  }, [isOnline, userId, flushAndRefresh]);

  useEffect(() => {
    if (!userId) return;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && isOnline) void flushAndRefresh(false);
    });
    return () => subscription.remove();
  }, [isOnline, userId, flushAndRefresh]);

  useEffect(() => {
    if (!isOnline) {
      retryAttempt.current = 0;
      return;
    }
    if (!userId || flushing) return;
    if (!pendingRows.some(isRetryableOutboxRow)) {
      retryAttempt.current = 0;
      return;
    }

    const delay = outboxRetryDelay(retryAttempt.current);
    const timer = setTimeout(() => {
      retryAttempt.current += 1;
      void flushAndRefresh(false);
    }, delay);
    return () => clearTimeout(timer);
  }, [isOnline, userId, flushing, pendingRows, flushAndRefresh]);

  return null;
}
