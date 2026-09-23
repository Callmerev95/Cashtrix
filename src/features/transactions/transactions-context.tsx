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
import { dictionaryFor, useLanguage } from '@/i18n';

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
  hasMoreAfter,
  isTransactionType,
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
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
  loadTransaction: (id: string) => Promise<Transaction | null>;
  save: (input: SaveInput) => Promise<void>;
  remove: (id: string) => Promise<void>;
  undoDelete: () => Promise<void>;
  dismissUndo: () => void;
  rememberType: (type: TransactionType) => Promise<void>;
  rememberWallet: (walletId: string) => Promise<void>;
};

export type LatestTransaction = {
  /** Id of the soft-deleted row — what `restore_transaction` addresses. */
  id: string;
  /** The snackbar's copy, built from the row that left the list. */
  label: string;
  /** When the delete landed; the snackbar hides itself after 5 s. */
  createdAt: number;
};

export type SaveInput = {
  /** Present = edit, absent = create. */
  id?: string;
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
};

const TransactionsContext = createContext<TransactionsContextValue | null>(
  null,
);

export function TransactionsProvider({ children }: { children: ReactNode }) {
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

  const mounted = useRef(true);
  const inflight = useRef<Promise<void> | null>(null);
  // C6: load-error + undo copy follow the OS language (ADR-0008).
  const language = useLanguage();
  const loadError = dictionaryFor(language).transactions.loadError;
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
        } catch (cause) {
          if (!mounted.current) return;
          setError(
            cause instanceof Error ? cause.message : loadError,
          );
        } finally {
          if (mounted.current) setLoading(false);
        }
      })().finally(() => {
        inflight.current = null;
      });
    }
    return inflight.current;
  }, [loadError]);

  useEffect(() => {
    let cancelled = false;

    Promise.all([
      listTransactions({ offset: 0 }),
      listCategories(),
      listWalletOptions(),
      lastUsedWalletId(),
      readStoredType(),
    ])
      .then(([page, nextCategories, nextWallets, walletId, storedType]) => {
        if (cancelled || !mounted.current) return;
        setTransactions(page);
        setCategories(nextCategories);
        setWallets(nextWallets);
        setHasMore(hasMoreAfter(PAGE_SIZE, page.length));
        setLastWalletId(walletId);
        if (storedType) setLastType(storedType);
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled || !mounted.current) return;
        setError(cause instanceof Error ? cause.message : loadError);
      })
      .finally(() => {
        if (!cancelled && mounted.current) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [loadError]);

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
      }),
    [],
  );

  const loadMore = useCallback(async () => {
    if (fetchingPage.current || !mounted.current) return;
    fetchingPage.current = true;
    setLoadingMore(true);

    try {
      // Offset paging is stable here because `occurred_at desc, id desc` is a
      // total order; appended rows can never interleave with an earlier page.
      const next = await listTransactions({ offset: transactions.length });
      if (!mounted.current) return;
      setTransactions((current) => mergePages(current, next));
      setHasMore(hasMoreAfter(PAGE_SIZE, next.length));
    } catch (cause) {
      if (!mounted.current) return;
      setError(cause instanceof Error ? cause.message : loadError);
    } finally {
      fetchingPage.current = false;
      if (mounted.current) setLoadingMore(false);
    }
  }, [transactions.length, loadError]);

  const loadTransaction = useCallback(
    async (id: string) => getTransaction(id),
    [],
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
    async (input: SaveInput) => {
      // Optimistic insert: the row shows immediately, then `refresh()` replaces
      // the page with server truth (which also fills in the joined names).
      const optimistic = toOptimistic(input, categories, wallets);
      if (optimistic) {
        setTransactions((current) => [optimistic, ...current]);
      }

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
          await createTransaction(draft);
        }
      } catch (cause) {
        // Roll the optimistic row back so the UI never lies about what saved.
        if (optimistic) {
          setTransactions((current) =>
            current.filter((row) => row.id !== optimistic.id),
          );
        }
        throw cause;
      }

      await Promise.all([
        refresh(),
        rememberType(input.type),
        rememberWallet(input.walletId),
      ]);
    },
    [categories, refresh, rememberType, rememberWallet, wallets],
  );

  const remove = useCallback(
    async (id: string) => {
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

      await refresh();
    },
    [refresh, transactions, language],
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

    const restored = await restoreTransaction(target.id);
    if (restored) await refresh();
  }, [lastDeleted, refresh]);

  const dismissUndo = useCallback(() => setLastDeleted(null), []);

  const value = useMemo(
    () => ({
      transactions,
      categories,
      wallets,
      loading,
      loadingMore,
      hasMore,
      error,
      lastType,
      lastWalletId,
      lastDeleted,
      refresh,
      loadMore,
      loadTransaction,
      save,
      remove,
      undoDelete,
      dismissUndo,
      rememberType,
      rememberWallet,
    }),
    [
      transactions,
      categories,
      wallets,
      loading,
      loadingMore,
      hasMore,
      error,
      lastType,
      lastWalletId,
      lastDeleted,
      refresh,
      loadMore,
      loadTransaction,
      save,
      remove,
      undoDelete,
      dismissUndo,
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
