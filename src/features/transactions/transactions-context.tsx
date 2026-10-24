/**
 * Transaction context — one shared source for the Dashboard history list, the
 * Add/Edit form, and the delete flow.
 *
 * Responsibilities, deliberately narrow:
 *  - history pages (append-only, keyset-free offset paging at 20/page);
 *  - the *live* option lists the form needs (categories + wallets);
 *  - the two remember-me preferences the AC calls for: last Expense/Income
 *    toggle and last-used wallet.
 *
 * Balances are **not** derived here. Saving a transaction invalidates both the
 * history and `v_wallet_balances`; the wallet context refetches its own view
 * (that is the only place a balance is computed).
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
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

import { onLocalDataPurge } from '@/supabase';
import { dictionaryFor, fill, useLanguage } from '@/i18n';
import { tapUndo } from '@/features/haptics';
import { useAuth } from '@/features/auth';
import { useConnectivity } from '@/features/connectivity/connectivity-context';
import {
  OutboxFullError,
  OutboxUnavailableError,
  deleteOutboxPhoto,
  mergePendingRows,
  shouldQueueSaveError,
  toPendingTransaction,
  useOutbox,
  writeCache,
  readCache,
  type OutboxRow,
} from '@/features/outbox';
import { linkReceiptsToTransaction } from '@/features/receipts/api';

import {
  createTransaction,
  getTransaction,
  lastUsedWalletId,
  listCategories,
  listTransactions,
  listWalletOptions,
  restoreTransaction,
  softDeleteTransaction,
  updateTransaction,
  type TransactionDraft,
} from './api';
import {
  DEFAULT_TRANSACTION_TYPE,
  PAGE_SIZE,
  deletedTransactionLabel,
  formatGrouped,
  hasMoreAfter,
  isTransactionType,
  savedTransactionLabel,
  transferFeedLabel,
  type Category,
  type Transaction,
  type TransactionType,
  type WalletOption,
} from './domain';

export const LAST_TYPE_KEY = 'cashtrix:last-transaction-type';
export const LAST_WALLET_KEY = 'cashtrix:last-wallet-id';

type TransactionsContextValue = {
  transactions: Transaction[];
  categories: Category[];
  wallets: WalletOption[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  /** Persisted Expense/Income preference (default `expense`). */
  lastType: TransactionType;
  lastWalletId: string | null;
  /** Soft-deleted just now — non-null renders the undo snackbar (V4). */
  lastDeleted: LatestTransaction | null;
  /**
   * Saved just now — non-null renders the success snackbar (S1 follow-up).
   * Unlike `lastDeleted` there is nothing to act on, only proof the commit
   * landed before the form closed.
   */
  lastSaved: SavedNotice | null;
  /** The feed came from the device cache, not a live server read (OB1). */
  cacheUsed: boolean;
  /** ISO timestamp of the cached feed, null when live. */
  cachedAt: string | null;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  loadTransaction: (id: string) => Promise<Transaction | null>;
  save: (input: SaveInput) => Promise<SaveResult>;
  remove: (id: string) => Promise<void>;
  undoDelete: () => Promise<void>;
  /** Cancel an offline save inside its 10 s proof window (story 8). */
  undoQueuedSave: (id: string) => Promise<void>;
  dismissUndo: () => void;
  dismissSaved: () => void;
  rememberType: (type: TransactionType) => Promise<void>;
  rememberWallet: (walletId: string) => Promise<void>;
};

export type LatestTransaction = {
  /** Id of the soft-deleted row — what `restore_transaction` addresses. */
  id: string;
  /** The snackbar's copy, built from the row that left the list. */
  label: string;
  /** When the delete landed; the snackbar hides itself after 10 s. */
  createdAt: number;
  /** Present when the deleted row lived only in the outbox (no server RPC). */
  pendingRow?: OutboxRow;
};

export type SavedNotice = {
  /** The snackbar's copy, built from the committed input. */
  label: string;
  /** When the save landed; the snackbar hides itself after 6 s. */
  createdAt: number;
  /** True when the row entered the offline outbox instead of the server. */
  queued?: boolean;
  /** Queue row id; present only for a queued save (enables undo). */
  queuedId?: string;
};

/** What `save()` actually did — callers use `queued` to pick the proof copy. */
export type SaveResult = { queued: boolean; queuedId?: string };

export type SaveInput = {
  /** Present = edit, absent = create. */
  id?: string;
  /** Present = editing an outbox row; the queue row id is the idempotency key. */
  queuedId?: string;
  userId: string;
  walletId: string;
  /** Null for `transfer`. */
  categoryId: string | null;
  /** Destination wallet — set only for `transfer`. */
  counterpartyWalletId?: string | null;
  type: TransactionType;
  amount: number;
  occurredAt: Date;
  note: string | null;
  /** Minted when the form opened (AC #22). Ignored when editing. */
  idempotencyKey: string;
  /** Pre-save receipt rows to link once the save commits (S2, Opsi A). */
  receiptIds: string[];
  /** Offline photos persisted locally; OB2 uploads them on flush. */
  receiptPaths?: string[];
};

const TransactionsContext = createContext<TransactionsContextValue | null>(
  null,
);

export function TransactionsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;
  const { isOnline } = useConnectivity();
  const { pendingRows, enqueue, drop, getRow, restore } = useOutbox();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [wallets, setWallets] = useState<WalletOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastType, setLastType] = useState<TransactionType>(
    DEFAULT_TRANSACTION_TYPE,
  );
  const [lastWalletId, setLastWalletId] = useState<string | null>(null);
  const [lastDeleted, setLastDeleted] = useState<LatestTransaction | null>(
    null,
  );
  const [lastSaved, setLastSaved] = useState<SavedNotice | null>(null);
  const [cacheUsed, setCacheUsed] = useState(false);
  const [cachedAt, setCachedAt] = useState<string | null>(null);

  const mounted = useRef(true);
  const onlineRef = useRef(isOnline);
  useEffect(() => {
    onlineRef.current = isOnline;
  }, [isOnline]);
  const inflight = useRef<Promise<void> | null>(null);
  // C6: load-error + undo copy follow the OS language (ADR-0008).
  const language = useLanguage();
  const copy = dictionaryFor(language);
  const loadError = copy.transactions.loadError;
  const pendingTransactions = useMemo(
    () => pendingRows.map((row) => toPendingTransaction(row, language)),
    [pendingRows, language],
  );
  const mergedTransactions = useMemo(
    () => mergePendingRows(transactions, pendingTransactions),
    [transactions, pendingTransactions],
  );
  // Guards `loadMore` against a double-fire from `onEndReached` while a page
  // is already in flight — appending twice would duplicate rows.
  const fetchingPage = useRef(false);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(() => {
    // Same in-flight reuse as the wallets context (see the save flow calling
    // both refreshes back to back).
    if (!inflight.current) {
      inflight.current = (async () => {
        try {
          const [page, nextCategories, nextWallets] = await Promise.all([
            listTransactions({ offset: 0 }),
            listCategories(),
            listWalletOptions(),
          ]);
          if (!mounted.current) return;
          setTransactions(page);
          setCategories(nextCategories);
          setWallets(nextWallets);
          setHasMore(hasMoreAfter(PAGE_SIZE, page.length));
          setError(null);
          setCacheUsed(false);
          setCachedAt(null);
          if (userId) {
            void writeCache(userId, 'feed', page.slice(0, 100));
            void writeCache(userId, 'categories', nextCategories);
            void writeCache(userId, 'wallet-options', nextWallets);
          }
        } catch (cause) {
          if (!mounted.current) return;
          // OB1: a failed live read falls back to the last successful one.
          // Only replace an empty server feed so a post-save refresh blip
          // cannot erase the row that just landed.
          const [feed, cachedCategories, cachedWallets] = userId
            ? await Promise.all([
                readCache<Transaction[]>(userId, 'feed'),
                readCache<Category[]>(userId, 'categories'),
                readCache<WalletOption[]>(userId, 'wallet-options'),
              ])
            : [null, null, null];
          if (!mounted.current) return;
          if (feed && transactions.length === 0) {
            setTransactions(feed.data.slice(0, 100));
            setHasMore(false);
            setCacheUsed(true);
            setCachedAt(feed.fetchedAt);
            setError(null);
          } else if (!feed) {
            setError(
              onlineRef.current
                ? cause instanceof Error
                  ? cause.message
                  : loadError
                : copy.outbox.offlineNoData,
            );
          }
          if (cachedCategories) setCategories(cachedCategories.data);
          if (cachedWallets) setWallets(cachedWallets.data);
        } finally {
          if (mounted.current) setLoading(false);
        }
      })().finally(() => {
        inflight.current = null;
      });
    }
    return inflight.current;
  }, [copy.outbox.offlineNoData, loadError, transactions.length, userId]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [page, nextCategories, nextWallets, walletId, storedType] =
          await Promise.all([
            listTransactions({ offset: 0 }),
            listCategories(),
            listWalletOptions(),
            lastUsedWalletId(),
            readStoredType(),
          ]);
        if (cancelled || !mounted.current) return;
        setTransactions(page);
        setCategories(nextCategories);
        setWallets(nextWallets);
        setHasMore(hasMoreAfter(PAGE_SIZE, page.length));
        setLastWalletId(walletId);
        if (storedType) setLastType(storedType);
        setError(null);
        setCacheUsed(false);
        setCachedAt(null);
        if (userId) {
          void writeCache(userId, 'feed', page.slice(0, 100));
          void writeCache(userId, 'categories', nextCategories);
          void writeCache(userId, 'wallet-options', nextWallets);
        }
      } catch (cause) {
        if (cancelled || !mounted.current) return;
        const [feed, cachedCategories, cachedWallets] = userId
          ? await Promise.all([
              readCache<Transaction[]>(userId, 'feed'),
              readCache<Category[]>(userId, 'categories'),
              readCache<WalletOption[]>(userId, 'wallet-options'),
            ])
          : [null, null, null];
        if (cancelled || !mounted.current) return;
        if (feed) {
          setTransactions(feed.data.slice(0, 100));
          setHasMore(false);
          setCacheUsed(true);
          setCachedAt(feed.fetchedAt);
          setError(null);
        } else {
          setError(
            onlineRef.current
              ? cause instanceof Error
                ? cause.message
                : loadError
              : copy.outbox.offlineNoData,
          );
        }
        if (cachedCategories) setCategories(cachedCategories.data);
        if (cachedWallets) setWallets(cachedWallets.data);
      } finally {
        if (!cancelled && mounted.current) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [copy.outbox.offlineNoData, loadError, userId]);

  // Sign out drops the cached history and every remembered preference.
  useEffect(
    () =>
      onLocalDataPurge(() => {
        if (!mounted.current) return;
        setTransactions([]);
        setCategories([]);
        setWallets([]);
        setLastWalletId(null);
        setLastType(DEFAULT_TRANSACTION_TYPE);
        setLastDeleted(null);
        setError(null);
        setCacheUsed(false);
        setCachedAt(null);
      }),
    [],
  );

  const loadMore = useCallback(async () => {
    // OB1: paging is a server read; offline the list ends honestly at the
    // cached window instead of pretending there is more.
    if (!isOnline || fetchingPage.current || !mounted.current) return;
    fetchingPage.current = true;
    setLoadingMore(true);

    try {
      // Offset paging is stable here because `occurred_at desc, id desc` is a
      // total order; appended rows can never interleave with an earlier page.
      const next = await listTransactions({ offset: transactions.length });
      if (!mounted.current) return;
      const merged = mergePages(transactions, next);
      setTransactions(merged);
      setHasMore(hasMoreAfter(PAGE_SIZE, next.length));
      if (userId) void writeCache(userId, 'feed', merged.slice(0, 100));
    } catch (cause) {
      if (!mounted.current) return;
      setError(cause instanceof Error ? cause.message : loadError);
    } finally {
      fetchingPage.current = false;
      if (mounted.current) setLoadingMore(false);
    }
  }, [isOnline, transactions, loadError, userId]);

  const loadTransaction = useCallback(
    async (id: string) => {
      const queued = await getRow(id);
      if (queued) return toPendingTransaction(queued, language);
      return getTransaction(id);
    },
    [getRow, language],
  );

  const rememberType = useCallback(async (value: TransactionType) => {
    setLastType(value);
    await AsyncStorage.setItem(LAST_TYPE_KEY, value);
  }, []);

  const rememberWallet = useCallback(async (walletId: string) => {
    setLastWalletId(walletId);
    await AsyncStorage.setItem(LAST_WALLET_KEY, walletId);
  }, []);

  const save = useCallback(
    async (input: SaveInput): Promise<SaveResult> => {
      const savedCategory = input.categoryId
        ? (categories.find((item) => item.id === input.categoryId)?.name ??
          null)
        : null;
      const savedCategoryIcon = input.categoryId
        ? (categories.find((item) => item.id === input.categoryId)?.icon ??
          null)
        : null;
      const savedCounterparty = input.counterpartyWalletId
        ? (wallets.find((item) => item.id === input.counterpartyWalletId)
            ?.name ?? null)
        : null;
      const savedWallet = wallets.find((item) => item.id === input.walletId);
      const savedName =
        input.type === 'transfer'
          ? transferFeedLabel(savedCounterparty, language)
          : (savedCategory ?? copy.transactions.saved.fallback);

      const enqueueOffline = async (queuedId?: string): Promise<SaveResult> => {
        const key = queuedId ?? input.idempotencyKey;
        let row: OutboxRow;
        try {
          row = await enqueue({
            userId: input.userId,
            walletId: input.walletId,
            categoryId: input.categoryId,
            counterpartyWalletId: input.counterpartyWalletId ?? null,
            type: input.type,
            amount: input.amount,
            occurredAt: input.occurredAt.toISOString(),
            note: input.note,
            idempotencyKey: key,
            receiptIds: input.receiptIds,
            receiptPaths: input.receiptPaths ?? [],
            display: {
              type: input.type,
              amount: input.amount,
              note: input.note,
              occurredAt: input.occurredAt.toISOString(),
              walletName: savedWallet?.name ?? '',
              categoryName: savedCategory,
              categoryIcon: savedCategoryIcon,
              counterpartyWalletName: savedCounterparty,
            },
          });
        } catch (cause) {
          if (cause instanceof OutboxFullError) {
            throw new Error(copy.outbox.queueFull);
          }
          if (cause instanceof OutboxUnavailableError) {
            throw new Error(copy.outbox.unavailable);
          }
          throw cause;
        }

        setLastSaved({
          label: fill(copy.outbox.queuedSaved, {
            name: savedName,
            amount: formatGrouped(input.amount, language),
          }),
          createdAt: Date.now(),
          queued: true,
          queuedId: row.id,
        });
        void rememberType(input.type);
        void rememberWallet(input.walletId);
        return { queued: true, queuedId: row.id };
      };

      // A queued edit never touches the server: it rewrites the row that is
      // still in the queue, preserving its idempotency key and FIFO position.
      // If the row was flushed while this form was open, refusing is honest —
      // recreating the key would silently drop the user's correction.
      if (input.queuedId) {
        const queued = await getRow(input.queuedId);
        if (!queued || queued.status === 'sending') {
          throw new Error(copy.outbox.alreadySent);
        }
        return enqueueOffline(input.queuedId);
      }

      // Known-offline creates go straight to the outbox: inserting an
      // optimistic "server" row first would flash a row the server never saw.
      // A server edit still needs a target row and stays blocked offline.
      if (!isOnline) {
        if (input.id) throw new Error(copy.outbox.editRequiresConnection);
        return enqueueOffline();
      }

      // Optimistic insert: the row shows immediately, then `refresh()` replaces
      // the page with server truth (which also fills in the joined names).
      const optimistic = toOptimistic(input, categories, wallets);
      if (optimistic) {
        setTransactions((current) => [optimistic, ...current]);
      }

      // The committed row id (created or edited) — the receipt link below
      // needs it, and it only exists past this point.
      let committedId: string;
      try {
        if (input.id) {
          await updateTransaction({
            id: input.id,
            walletId: input.walletId,
            categoryId: input.categoryId,
            counterpartyWalletId: input.counterpartyWalletId ?? null,
            type: input.type,
            amount: input.amount,
            occurredAt: input.occurredAt.toISOString(),
            note: input.note,
          });
          committedId = input.id;
        } else {
          const draft: TransactionDraft = {
            userId: input.userId,
            walletId: input.walletId,
            categoryId: input.categoryId,
            counterpartyWalletId: input.counterpartyWalletId ?? null,
            type: input.type,
            amount: input.amount,
            occurredAt: input.occurredAt.toISOString(),
            note: input.note,
            idempotencyKey: input.idempotencyKey,
          };
          committedId = await createTransaction(draft);
        }
      } catch (cause) {
        // Roll the optimistic row back so the UI never lies about what saved.
        if (optimistic) {
          setTransactions((current) =>
            current.filter((row) => row.id !== optimistic.id),
          );
        }
        // A transport/5xx failure is retryable; a validation/RLS refusal is
        // not and must surface to the form.
        // OB1 queues creates only: a failed edit has no target id in the
        // outbox payload yet, so queueing it would later create a duplicate.
        if (!input.id && shouldQueueSaveError(cause, true)) {
          return enqueueOffline();
        }
        throw cause;
      }

      // The success window opens only once the save is committed, so the
      // snackbar never claims an uncommitted write (S1 follow-up — the form
      // closes on this same resolution, and the snackbar is its proof).
      setLastSaved({
        label: savedTransactionLabel(
          {
            type: input.type,
            amount: input.amount,
            categoryName: savedCategory,
            counterpartyWalletName: savedCounterparty,
          },
          language,
        ),
        createdAt: Date.now(),
      });

      // Fire-and-forget (S1 follow-up): the form awaits `save()` as its
      // commit proof, so blocking here on a stalled refresh would trap the
      // submit spinner on saved data. The optimistic row is already painted;
      // `refresh()` replaces the page with server truth when it lands.
      // The receipt link rides along (S2, Opsi A): the photos are already
      // uploaded, this is one UPDATE. It can never reject the group — a
      // failed link leaves repairable orphan rows for the 30-day sweep,
      // never a lost save.
      void Promise.all([
        refresh(),
        rememberType(input.type),
        rememberWallet(input.walletId),
        linkReceiptsToTransaction({
          userId: input.userId,
          receiptIds: input.receiptIds,
          transactionId: committedId,
        }).catch(() => 0),
      ]);
      return { queued: false };
    },
    [
      categories,
      copy.outbox.alreadySent,
      copy.outbox.editRequiresConnection,
      copy.outbox.queueFull,
      copy.outbox.queuedSaved,
      copy.outbox.unavailable,
      copy.transactions.saved.fallback,
      enqueue,
      getRow,
      isOnline,
      language,
      refresh,
      rememberType,
      rememberWallet,
      wallets,
    ],
  );

  const remove = useCallback(
    async (id: string) => {
      // A queued row has no server row yet: deleting it is a local drop, and
      // undo restores the exact queue row. A `sending` row may already have
      // committed, so it cannot be cancelled safely.
      const queued = await getRow(id);
      if (queued) {
        if (queued.status === 'sending') {
          throw new Error(copy.outbox.alreadySent);
        }
        await drop(id);
        setLastDeleted({
          id,
          label: deletedTransactionLabel(
            toPendingTransaction(queued, language),
            language,
          ),
          createdAt: Date.now(),
          pendingRow: queued,
        });
        void tapUndo();
        return;
      }

      if (!isOnline) throw new Error(copy.outbox.deleteRequiresConnection);
      const previous = transactions;
      const deleted = transactions.find((row) => row.id === id) ?? null;
      setTransactions((current) => current.filter((row) => row.id !== id));

      try {
        await softDeleteTransaction(id);
      } catch (cause) {
        setTransactions(previous);
        throw cause;
      }

      // The undo window opens only once the delete is committed, so the
      // snackbar never points at a row that is still alive. A create/edit has
      // no `deleted` row (the id is not in the page) and simply gets no snack.
      setLastDeleted(
        deleted
          ? {
              id,
              label: deletedTransactionLabel(deleted, language),
              createdAt: Date.now(),
            }
          : null,
      );
      // B1: the snackbar is the delete's proof — buzz only when it opens.
      if (deleted) void tapUndo();

      await refresh();
    },
    [
      copy.outbox.alreadySent,
      copy.outbox.deleteRequiresConnection,
      drop,
      getRow,
      isOnline,
      refresh,
      transactions,
      language,
    ],
  );

  /**
   * Undo the last soft-delete (V4 AC #1). Called within the snackbar's window;
   * `restore_transaction` is the same RPC the DB has exposed since T5, so the
   * 30-day retention and the feed filtering are unchanged. The snackbar is
   * cleared first so a double-tap cannot fire two restores.
   */
  const undoDelete = useCallback(async () => {
    const target = lastDeleted;
    setLastDeleted(null);
    if (!target) return;

    if (target.pendingRow) {
      await restore(target.pendingRow);
      return;
    }

    const restored = await restoreTransaction(target.id);
    if (restored) await refresh();
  }, [lastDeleted, refresh, restore]);

  const undoQueuedSave = useCallback(
    async (id: string) => {
      setLastSaved(null);
      const row = await getRow(id);
      if (!row || row.status === 'sending') return;
      await drop(id);
      // Cancelling the save also discards the proof photo; no undo window
      // remains for it. The sweep would eventually catch it, but immediate
      // cleanup keeps the sandbox honest.
      for (const path of row.payload.receiptPaths) deleteOutboxPhoto(path);
    },
    [drop, getRow],
  );

  const dismissUndo = useCallback(() => {
    const pending = lastDeleted?.pendingRow;
    setLastDeleted(null);
    if (pending) {
      // The undo window closed without a restore: the queue row is already
      // gone, so its local photos are orphans. Drop them now instead of
      // waiting for the 7-day sweep.
      for (const path of pending.payload.receiptPaths) deleteOutboxPhoto(path);
    }
  }, [lastDeleted]);

  const dismissSaved = useCallback(() => setLastSaved(null), []);

  const value = useMemo(
    () => ({
      transactions: mergedTransactions,
      categories,
      wallets,
      loading,
      loadingMore,
      hasMore,
      error,
      lastType,
      lastWalletId,
      lastDeleted,
      lastSaved,
      cacheUsed,
      cachedAt,
      refresh,
      loadMore,
      loadTransaction,
      save,
      remove,
      undoDelete,
      undoQueuedSave,
      dismissUndo,
      dismissSaved,
      rememberType,
      rememberWallet,
    }),
    [
      mergedTransactions,
      categories,
      wallets,
      loading,
      loadingMore,
      hasMore,
      error,
      lastType,
      lastWalletId,
      lastDeleted,
      lastSaved,
      cacheUsed,
      cachedAt,
      refresh,
      loadMore,
      loadTransaction,
      save,
      remove,
      undoDelete,
      undoQueuedSave,
      dismissUndo,
      dismissSaved,
      rememberType,
      rememberWallet,
    ],
  );

  return (
    <TransactionsContext.Provider value={value}>
      {children}
    </TransactionsContext.Provider>
  );
}

export function useTransactions(): TransactionsContextValue {
  const context = useContext(TransactionsContext);
  if (!context) {
    throw new Error('useTransactions harus dipakai di dalam TransactionsProvider');
  }
  return context;
}

async function readStoredType(): Promise<TransactionType | null> {
  const stored = await AsyncStorage.getItem(LAST_TYPE_KEY);
  return isTransactionType(stored) ? stored : null;
}

/**
 * Appends a new page, dropping ids already present. `loadMore` cannot normally
 * produce duplicates, but a `refresh()` racing an in-flight page can — this
 * keeps the list a set.
 */
export function mergePages(
  current: Transaction[],
  next: Transaction[],
): Transaction[] {
  if (next.length === 0) return current;
  const seen = new Set(current.map((row) => row.id));
  return [...current, ...next.filter((row) => !seen.has(row.id))];
}

/**
 * The immediately-rendered row. Only an edit gets an optimistic row: the id is
 * known, and the option lists the form already holds supply the category/wallet
 * names, so the row looks identical to the server's and does not flash when
 * `refresh()` lands.
 *
 * A *create* has no id yet — minting a fake one would make the delete/undo
 * flows address a row that does not exist, so creates simply appear when the
 * refresh lands (the modal stays open with its spinner for that beat).
 */
export function toOptimistic(
  input: SaveInput,
  categories: Category[],
  wallets: WalletOption[],
): Transaction | null {
  if (!input.id) return null;

  const category = input.categoryId
    ? categories.find((item) => item.id === input.categoryId)
    : undefined;
  const wallet = wallets.find((item) => item.id === input.walletId);
  const counterparty = input.counterpartyWalletId
    ? wallets.find((item) => item.id === input.counterpartyWalletId)
    : undefined;

  return {
    id: input.id,
    type: input.type,
    amount: input.amount,
    currencyCode: 'IDR',
    occurredAt: input.occurredAt.toISOString(),
    note: input.note,
    categoryId: input.categoryId,
    categoryName: category?.name ?? '',
    categoryIcon: category?.icon ?? 'swap-horiz',
    walletId: input.walletId,
    walletName: wallet?.name ?? '',
    counterpartyWalletId: input.counterpartyWalletId ?? null,
    counterpartyWalletName: counterparty?.name ?? null,
  };
}
