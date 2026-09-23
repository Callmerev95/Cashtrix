/**
 * Transaction data access.
 *
 * Reads go through `v_transactions_feed` (T5 migration), which joins the
 * category name/icon and wallet name server-side — the client never stitches
 * three tables together and never sees soft-deleted rows. Writes go to the
 * `transactions` table with RLS as the guard; deletes go through the
 * `soft_delete_transaction` RPC so the 30-day retention window is explicit
 * rather than an inline `update`.
 *
 * Idempotency (AC #22): the key is minted when the form *opens* and sent on
 * insert. A retry of the same submission hits `unique(user_id,
 * idempotency_key)`; Postgres raises `23505` and we translate that into the
 * already-saved row instead of an error.
 */
import { supabase } from '@/supabase';

import {
  PAGE_SIZE,
  buildSearchPattern,
  type Category,
  type Transaction,
  type TransactionKindFilter,
  type TransactionType,
  type WalletOption,
} from './domain';

type FeedRow = {
  id: string;
  type: TransactionType;
  amount: number | string;
  currency_code: string;
  occurred_at: string;
  note: string | null;
  category_id: string | null;
  category_name: string | null;
  category_icon: string | null;
  wallet_id: string;
  wallet_name: string;
  counterparty_wallet_id: string | null;
  counterparty_wallet_name: string | null;
};

const FEED_COLUMNS =
  'id, type, amount, currency_code, occurred_at, note, category_id, category_name, category_icon, wallet_id, wallet_name, counterparty_wallet_id, counterparty_wallet_name';

function toTransaction(row: FeedRow): Transaction {
  return {
    id: row.id,
    type: row.type,
    amount: Number(row.amount),
    currencyCode: row.currency_code,
    occurredAt: row.occurred_at,
    note: row.note,
    categoryId: row.category_id,
    categoryName: row.category_name ?? '',
    categoryIcon: row.category_icon ?? 'swap-horiz',
    walletId: row.wallet_id,
    walletName: row.wallet_name,
    counterpartyWalletId: row.counterparty_wallet_id,
    counterpartyWalletName: row.counterparty_wallet_name,
  };
}

/**
 * One page of history, newest first. Rows are the *live* transactions only —
 * `v_transactions_feed` filters `deleted_at is null`.
 */
export async function listTransactions(input?: {
  limit?: number;
  offset?: number;
}): Promise<Transaction[]> {
  const limit = input?.limit ?? PAGE_SIZE;
  const offset = input?.offset ?? 0;

  const { data, error } = await supabase
    .from('v_transactions_feed')
    .select(FEED_COLUMNS)
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return ((data ?? []) as FeedRow[]).map(toTransaction);
}

/** A single live transaction, used when the edit form opens via `?id=`. */
export async function getTransaction(id: string): Promise<Transaction | null> {
  const { data, error } = await supabase
    .from('v_transactions_feed')
    .select(FEED_COLUMNS)
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data ? toTransaction(data as FeedRow) : null;
}

export type SearchTransactionsInput = {
  query: string;
  kind: TransactionKindFilter;
  limit?: number;
  offset?: number;
};

/**
 * Search + kind filter over `v_transactions_feed` (A3). Same total order and
 * page size as the history feed, so the result list reuses
 * `TransactionHistoryList` unchanged — and A4 (bulk edit) reuses this query
 * with its own selection state on top.
 *
 * Text matches OR-wise against note, category name and both wallet names
 * (source + transfer destination), so "makanan" finds an un-noted food row
 * and "gopay" finds a transfer into GoPay. `RLS` scopes everything to the
 * caller, like the feed.
 */
export async function searchTransactions(
  input: SearchTransactionsInput,
): Promise<Transaction[]> {
  const limit = input.limit ?? PAGE_SIZE;
  const offset = input.offset ?? 0;
  const pattern = buildSearchPattern(input.query);

  let query = supabase
    .from('v_transactions_feed')
    .select(FEED_COLUMNS)
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false });

  if (input.kind !== 'all') {
    query = query.eq('type', input.kind);
  }
  if (pattern) {
    query = query.or(
      `note.ilike.${pattern},category_name.ilike.${pattern},wallet_name.ilike.${pattern},counterparty_wallet_name.ilike.${pattern}`,
    );
  }

  const { data, error } = await query.range(offset, offset + limit - 1);

  if (error) throw error;
  return ((data ?? []) as FeedRow[]).map(toTransaction);
}

export type BulkUpdateCategoryInput = {
  ids: string[];
  categoryId: string;
  /** Server-enforced uniformity: only rows of this type move. */
  kind: TransactionType;
};

/**
 * Bulk recategorise (A4): one UPDATE for the whole checked set. RLS scopes
 * the write to the caller's rows (a foreign id silently no-ops and is
 * excluded from the count), and the `type` guard keeps a UI bug from parking
 * an expense row under an income category where no budget/ring would see it.
 * Returns the number of rows that actually moved.
 */
export async function bulkUpdateCategory(
  input: BulkUpdateCategoryInput,
): Promise<number> {
  if (input.ids.length === 0) return 0;

  const { data, error } = await supabase
    .from('transactions')
    .update({ category_id: input.categoryId })
    .in('id', input.ids)
    .eq('type', input.kind)
    .select('id');

  if (error) throw error;
  return ((data ?? []) as { id: string }[]).length;
}

export type TransactionDraft = {
  userId: string;
  walletId: string;
  /** Null for `transfer` (DB check enforces the shape). */
  categoryId: string | null;
  /** Destination wallet — set only for `transfer`. */
  counterpartyWalletId?: string | null;
  type: TransactionType;
  amount: number;
  occurredAt: string;
  note: string | null;
  idempotencyKey: string;
};

/**
 * Insert with the form's idempotency key. A `23505` on
 * `(user_id, idempotency_key)` means this exact submission already landed
 * (network retry), so we return the existing row instead of throwing — the
 * caller's optimistic insert is then reconciled with the truth.
 */
export async function createTransaction(
  draft: TransactionDraft,
): Promise<string> {
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      user_id: draft.userId,
      wallet_id: draft.walletId,
      category_id: draft.categoryId,
      counterparty_wallet_id: draft.counterpartyWalletId ?? null,
      type: draft.type,
      amount: draft.amount,
      occurred_at: draft.occurredAt,
      note: draft.note,
      idempotency_key: draft.idempotencyKey,
    })
    .select('id')
    .single();

  if (error) {
    if (error.code === '23505') {
      const existing = await findByIdempotencyKey(
        draft.userId,
        draft.idempotencyKey,
      );
      if (existing) return existing;
    }
    throw error;
  }

  return (data as { id: string }).id;
}

async function findByIdempotencyKey(
  userId: string,
  key: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('transactions')
    .select('id')
    .eq('user_id', userId)
    .eq('idempotency_key', key)
    .maybeSingle();

  if (error) throw error;
  return (data as { id: string } | null)?.id ?? null;
}

/**
 * Edit a transaction. Amount stays positive; `type` carries the direction
 * (PRD §6.1 R3/R4).
 */
export async function updateTransaction(input: {
  id: string;
  walletId: string;
  categoryId: string | null;
  counterpartyWalletId?: string | null;
  type: TransactionType;
  amount: number;
  occurredAt: string;
  note: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({
      wallet_id: input.walletId,
      category_id: input.categoryId,
      counterparty_wallet_id: input.counterpartyWalletId ?? null,
      type: input.type,
      amount: input.amount,
      occurred_at: input.occurredAt,
      note: input.note,
    })
    .eq('id', input.id);

  if (error) throw error;
}

/**
 * Soft-delete (AC #24). The row keeps its `deleted_at` for 30 days so the
 * `purge_deleted_transactions` cron can drop it; the UI treats the delete as
 * final. Returns false when nothing matched (already gone / not the caller's).
 */
export async function softDeleteTransaction(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('soft_delete_transaction', {
    transaction_id: id,
  });

  if (error) throw error;
  return Number(data ?? 0) > 0;
}

/** Restore inside the retention window (used by undo, and by tests). */
export async function restoreTransaction(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('restore_transaction', {
    transaction_id: id,
  });

  if (error) throw error;
  return Number(data ?? 0) > 0;
}

/** Categories available to the picker grid (system + the user's own). */
export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, icon, kind')
    .is('archived_at', null)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as Category[];
}

/** Wallet options for the wallet picker (id + name is all the form needs). */
export async function listWalletOptions(): Promise<WalletOption[]> {
  const { data, error } = await supabase
    .from('wallets')
    .select('id, name')
    .is('archived_at', null)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []) as WalletOption[];
}

/**
 * The newest live transaction, fully joined — the undo snackbar's copy needs a
 * name, so it cannot reuse `lastUsedWalletId` (which selects `wallet_id` only).
 * Newest is `occurred_at desc, id desc`, the same total order the feed uses.
 */
export async function latestTransaction(): Promise<Transaction | null> {
  const { data, error } = await supabase
    .from('v_transactions_feed')
    .select(FEED_COLUMNS)
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data ? toTransaction(data as FeedRow) : null;
}

/**
 * The wallet of the most recent transaction — the form's default (AC #21).
 * Read from the feed, so a soft-deleted "last" transaction is ignored.
 */
export async function lastUsedWalletId(): Promise<string | null> {
  const { data, error } = await supabase
    .from('v_transactions_feed')
    .select('wallet_id')
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as { wallet_id: string } | null)?.wallet_id ?? null;
}
