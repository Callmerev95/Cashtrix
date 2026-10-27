/**
 * Outbox provider (OB1/OB2, issues #74/#75).
 *
 * Owns the queue rows so the History list can merge them into the feed and
 * the form can enqueue or edit a save when the network is gone. The flush
 * engine lives in `flush.ts`; this provider serializes calls to it and keeps
 * the rendered rows in sync as each attempt lands.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { useAuth } from '@/features/auth';
import { onLocalDataPurge } from '@/supabase';

import { clearAllCache } from './cache';
import {
  OUTBOX_DONE_MS,
  OutboxUnavailableError,
  referencedReceiptPaths,
  type OutboxEnqueueInput,
  type OutboxRow,
} from './domain';
import { flushOutbox, type FlushResult } from './flush';
import { sweepOrphanOutboxPhotos } from './files';
import {
  clearAllOutbox,
  deleteOutboxRow,
  enqueueOutbox,
  getOutboxRow,
  listOutbox,
} from './outbox';

export type OutboxFlushNotice = FlushResult & {
  /** When the clean pass landed. */
  at: number;
};

type OutboxContextValue = {
  pendingRows: OutboxRow[];
  pendingCount: number;
  /** False when SQLite/the native module is unavailable (queue fail-open). */
  available: boolean;
  /** True while a flush pass is in flight (manual or automatic). */
  flushing: boolean;
  /** Last clean pass (sent > 0, no failures, not stopped); clears after 4 s. */
  lastFlush: OutboxFlushNotice | null;
  refreshPending: () => Promise<void>;
  enqueue: (input: OutboxEnqueueInput) => Promise<OutboxRow>;
  drop: (id: string) => Promise<void>;
  getRow: (id: string) => Promise<OutboxRow | null>;
  restore: (row: OutboxRow) => Promise<void>;
  flush: () => Promise<FlushResult>;
};

const OutboxContext = createContext<OutboxContextValue | null>(null);

export function OutboxProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [pendingRows, setPendingRows] = useState<OutboxRow[]>([]);
  const [available, setAvailable] = useState(true);
  const [flushingNow, setFlushingNow] = useState(false);
  const [lastFlush, setLastFlush] = useState<OutboxFlushNotice | null>(null);
  const mounted = useRef(true);
  const sweptFor = useRef<string | null>(null);
  const flushing = useRef<Promise<FlushResult> | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generation = useRef(0);

  const clearDoneTimer = useCallback(() => {
    if (doneTimer.current) {
      clearTimeout(doneTimer.current);
      doneTimer.current = null;
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (doneTimer.current) clearTimeout(doneTimer.current);
    };
  }, []);

  const refreshPending = useCallback(async () => {
    if (!userId) {
      if (mounted.current) setPendingRows([]);
      return;
    }

    try {
      const rows = await listOutbox(userId);
      if (!mounted.current) return;
      setPendingRows(rows);
      setAvailable(true);

      if (sweptFor.current !== userId) {
        sweptFor.current = userId;
        try {
          sweepOrphanOutboxPhotos({
            userId,
            referencedPaths: referencedReceiptPaths(rows),
          });
        } catch {
          // The sweep is a housekeeping backstop, never a screen blocker.
        }
      }
    } catch {
      // No SQLite (Jest, or a binary older than the OB1 rebuild): the queue
      // is simply unavailable. Every online path keeps working.
      if (mounted.current) setAvailable(false);
    }
  }, [userId]);

  // The mount refresh is scheduled as a promise callback, never called
  // synchronously in the effect body (`react-hooks/set-state-in-effect`).
  useEffect(() => {
    Promise.resolve()
      .then(() => refreshPending())
      .catch(() => undefined);
  }, [refreshPending]);

  const enqueue = useCallback(
    async (input: OutboxEnqueueInput) => {
      if (!userId || input.userId !== userId) {
        throw new OutboxUnavailableError();
      }
      const row = await enqueueOutbox(input);
      await refreshPending();
      return row;
    },
    [refreshPending, userId],
  );

  const drop = useCallback(
    async (id: string) => {
      if (!userId) return;
      await deleteOutboxRow(userId, id);
      await refreshPending();
    },
    [refreshPending, userId],
  );

  const getRow = useCallback(
    async (id: string) => {
      if (!userId) return null;
      try {
        return await getOutboxRow(userId, id);
      } catch {
        // Fail open like every other queue read: a binary without SQLite (or
        // a transient open failure) must not break server edits/deletes.
        return null;
      }
    },
    [userId],
  );

  const restore = useCallback(
    async (row: OutboxRow) => {
      if (!userId || row.userId !== userId) {
        throw new OutboxUnavailableError();
      }
      await enqueueOutbox({
        ...row.payload,
        display: row.display,
      });
      await refreshPending();
    },
    [refreshPending, userId],
  );

  const flush = useCallback(() => {
    if (!userId || !available) {
      return Promise.resolve({ sent: 0, failed: 0, stopped: false });
    }
    if (!flushing.current) {
      const pass = generation.current;
      clearDoneTimer();
      setLastFlush(null);
      setFlushingNow(true);
      flushing.current = flushOutbox({
        userId,
        onProgress: refreshPending,
      })
        .then((result) => {
          // Only a clean full pass earns the green “sent” strip. A stopped
          // pass still has work left; a failed row is not a success.
          if (
            mounted.current &&
            generation.current === pass &&
            result.sent > 0 &&
            result.failed === 0 &&
            !result.stopped
          ) {
            clearDoneTimer();
            setLastFlush({ ...result, at: Date.now() });
            doneTimer.current = setTimeout(() => {
              doneTimer.current = null;
              if (mounted.current && generation.current === pass) {
                setLastFlush(null);
              }
            }, OUTBOX_DONE_MS);
          }
          return result;
        })
        .finally(() => {
          flushing.current = null;
          if (mounted.current) setFlushingNow(false);
        });
    }
    return flushing.current;
  }, [available, clearDoneTimer, refreshPending, userId]);

  useEffect(
    () =>
      onLocalDataPurge(() => {
        if (!mounted.current) return;
        generation.current += 1;
        clearDoneTimer();
        setPendingRows([]);
        setAvailable(true);
        setFlushingNow(false);
        setLastFlush(null);
        sweptFor.current = null;
        void clearAllOutbox().catch(() => undefined);
        void clearAllCache().catch(() => undefined);
      }),
    [clearDoneTimer],
  );

  const value = useMemo(
    () => ({
      pendingRows,
      pendingCount: pendingRows.length,
      available,
      flushing: flushingNow,
      lastFlush,
      refreshPending,
      enqueue,
      drop,
      getRow,
      restore,
      flush,
    }),
    [
      pendingRows,
      available,
      flushingNow,
      lastFlush,
      refreshPending,
      enqueue,
      drop,
      getRow,
      restore,
      flush,
    ],
  );

  return (
    <OutboxContext.Provider value={value}>{children}</OutboxContext.Provider>
  );
}

export function useOutbox(): OutboxContextValue {
  const context = useContext(OutboxContext);
  if (!context) {
    throw new Error('useOutbox harus dipakai di dalam OutboxProvider');
  }
  return context;
}
