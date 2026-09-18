/**
 * Wallet data access. Every read goes through `v_wallet_balances` — balances
 * are never computed client-side and there is no mutable balance column
 * (PRD §4.1). RLS scopes every statement to the signed-in user, so no query
 * needs an explicit `user_id` filter; it is added on writes because the policy
 * is `WITH CHECK (user_id = auth.uid())`.
 */
import { supabase } from '@/supabase';

import type { Wallet, WalletType } from './domain';

type WalletBalanceRow = {
  wallet_id: string;
  name: string;
  type: WalletType;
  opening_balance: number | string;
  balance: number | string;
  transaction_count: number | string;
};

function toWallet(row: WalletBalanceRow): Wallet {
  return {
    id: row.wallet_id,
    name: row.name,
    type: row.type,
    openingBalance: Number(row.opening_balance),
    balance: Number(row.balance),
    transactionCount: Number(row.transaction_count),
  };
}

/** All wallets with their balances, oldest first (stable order for lists). */
export async function listWallets(): Promise<Wallet[]> {
  const { data, error } = await supabase
    .from('v_wallet_balances')
    .select('wallet_id, name, type, opening_balance, balance, transaction_count')
    .order('created_at', { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => toWallet(row as WalletBalanceRow));
}

export async function createWallet(input: {
  userId: string;
  name: string;
  type: WalletType;
  openingBalance: number;
}): Promise<string> {
  const { data, error } = await supabase
    .from('wallets')
    .insert({
      user_id: input.userId,
      name: input.name.trim(),
      type: input.type,
      opening_balance: input.openingBalance,
    })
    .select('id')
    .single();

  if (error) throw error;
  return (data as { id: string }).id;
}

export async function updateWallet(input: {
  id: string;
  name: string;
  type: WalletType;
  openingBalance: number;
}): Promise<void> {
  const { error } = await supabase
    .from('wallets')
    .update({
      name: input.name.trim(),
      type: input.type,
      opening_balance: input.openingBalance,
    })
    .eq('id', input.id);

  if (error) throw error;
}

/**
 * Hard-deletes a wallet. The DB refuses when transactions still reference it
 * (`on delete restrict` + composite FK), which is exactly the "tolak" half of
 * AC #5 — callers offer reassignment first.
 */
export async function deleteWallet(id: string): Promise<void> {
  const { error } = await supabase.from('wallets').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Moves every transaction off `fromWalletId` in one atomic RPC, then deletes
 * the empty wallet. Returns how many transactions were moved.
 */
export async function reassignAndDeleteWallet(input: {
  fromWalletId: string;
  toWalletId: string;
}): Promise<number> {
  const { data, error } = await supabase.rpc('reassign_wallet_transactions', {
    from_wallet: input.fromWalletId,
    to_wallet: input.toWalletId,
  });

  if (error) throw error;

  await deleteWallet(input.fromWalletId);
  return Number(data ?? 0);
}
