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
  type Category,
  type Transaction,
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
  category_id: string;
  category_name: string;
  category_icon: string;
  wallet_id: string;
  wallet_name: string;
};

const FEED_COLUMNS =
  'id, type, amount, currency_code, occurred_at, note, category_id, category_name, category_icon, wallet_id, wallet_name';

function toTransaction(row: FeedRow): Transaction {
  return {
    id: row.id,
    type: row.type,
    amount: Number(row.amount),
    currencyCode: row.currency_code,
    occurredAt: row.occurred_at,
    note: row.note,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryIcon: row.category_icon,
    walletId: row.wallet_id,
    walletName: row.wallet_name,
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

export type TransactionDraft = {
  userId: string;
  walletId: string;
  categoryId: string;
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
  categoryId: string;
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
