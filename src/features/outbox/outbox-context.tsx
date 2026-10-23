/**
 * Outbox provider (OB1, issue #74).
 *
 * Owns the queue rows so the History list can merge them into the feed and
 * the form can enqueue a save when the network is gone. The provider never
 * flushes — OB2 adds the engine; OB1 only proves the queue survives, renders,
 * and is purged on sign-out.
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
  OutboxUnavailableError,
  referencedReceiptPaths,
  type OutboxEnqueueInput,
  type OutboxRow,
} from './domain';
import { sweepOrphanOutboxPhotos } from './files';
import {
  clearAllOutbox,
  deleteOutboxRow,
  enqueueOutbox,
  listOutbox,
} from './outbox';

type OutboxContextValue = {
  pendingRows: OutboxRow[];
  pendingCount: number;
  /** False when SQLite/the native module is unavailable (queue fail-open). */
  available: boolean;
  refreshPending: () => Promise<void>;
  enqueue: (input: OutboxEnqueueInput) => Promise<OutboxRow>;
  drop: (id: string) => Promise<void>;
};

const OutboxContext = createContext<OutboxContextValue | null>(null);

export function OutboxProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const [pendingRows, setPendingRows] = useState<OutboxRow[]>([]);
  const [available, setAvailable] = useState(true);
  const mounted = useRef(true);
  const sweptFor = useRef<string | null>(null);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
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

  useEffect(
    () =>
      onLocalDataPurge(() => {
        if (!mounted.current) return;
        setPendingRows([]);
        setAvailable(true);
        sweptFor.current = null;
        void clearAllOutbox().catch(() => undefined);
        void clearAllCache().catch(() => undefined);
      }),
    [],
  );

  const value = useMemo(
    () => ({
      pendingRows,
      pendingCount: pendingRows.length,
      available,
      refreshPending,
      enqueue,
      drop,
    }),
    [pendingRows, available, refreshPending, enqueue, drop],
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
