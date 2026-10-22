/**
 * Savings goal data access (SV2). One row per wallet (`unique(user_id,
 * wallet_id)`), so the duplicate error is a friendly domain message rather
 * than a raw Postgres 23505.
 */
import { supabase } from '@/supabase';

import type { SavingsGoal } from './domain';

type SavingsGoalRow = {
  id: string;
  user_id: string;
  wallet_id: string;
  name: string | null;
  target_amount: number | string;
  target_date: string | null;
  created_at: string;
};

const GOAL_COLUMNS =
  'id, user_id, wallet_id, name, target_amount, target_date, created_at';

export type SavingsApiErrorCode = 'duplicate_wallet' | 'session_missing';

export class SavingsApiError extends Error {
  readonly code: SavingsApiErrorCode;

  constructor(code: SavingsApiErrorCode, message: string) {
    super(message);
    this.name = 'SavingsApiError';
    this.code = code;
  }
}

function toGoal(row: SavingsGoalRow): SavingsGoal {
  return {
    id: row.id,
    userId: row.user_id,
    walletId: row.wallet_id,
    name: row.name,
    targetAmount: Number(row.target_amount),
    targetDate: row.target_date,
    createdAt: row.created_at,
  };
}

function mapWriteError(cause: unknown): Error {
  const error = cause as { code?: string; message?: string };
  if (error?.code === '23505') {
    return new SavingsApiError(
      'duplicate_wallet',
      'Dompet ini sudah punya target',
    );
  }
  return cause instanceof Error
    ? cause
    : new Error(error?.message ?? 'Gagal menyimpan target tabungan');
}

async function currentUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  const userId = data.session?.user.id;
  if (!userId) {
    throw new SavingsApiError('session_missing', 'Sesi tidak ditemukan');
  }
  return userId;
}

/** All goals of the signed-in user (RLS scopes the rows), oldest first. */
export async function listSavingsGoals(): Promise<SavingsGoal[]> {
  const { data, error } = await supabase
    .from('savings_goals')
    .select(GOAL_COLUMNS)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as SavingsGoalRow[]).map(toGoal);
}

export async function createSavingsGoal(input: {
  walletId: string;
  name: string | null;
  targetAmount: number;
  targetDate: string | null;
}): Promise<string> {
  const userId = await currentUserId();
  const { data, error } = await supabase
    .from('savings_goals')
    .insert({
      user_id: userId,
      wallet_id: input.walletId,
      name: input.name?.trim() || null,
      target_amount: input.targetAmount,
      target_date: input.targetDate,
    })
    .select('id')
    .single();

  if (error) throw mapWriteError(error);
  return (data as { id: string }).id;
}

export type SavingsGoalPatch = {
  walletId?: string;
  name?: string | null;
  targetAmount?: number;
  targetDate?: string | null;
};

export async function updateSavingsGoal(
  id: string,
  patch: SavingsGoalPatch,
): Promise<void> {
  const userId = await currentUserId();
  const payload: Record<string, unknown> = {};
  if (patch.walletId !== undefined) payload.wallet_id = patch.walletId;
  if (patch.name !== undefined) {
    payload.name = patch.name?.trim() || null;
  }
  if (patch.targetAmount !== undefined) {
    payload.target_amount = patch.targetAmount;
  }
  if (patch.targetDate !== undefined) payload.target_date = patch.targetDate;
  if (Object.keys(payload).length === 0) return;

  // PostgREST rejects an UPDATE without a WHERE even under RLS (T8 pattern);
  // the user_id filter also makes a foreign id a silent no-op.
  const { error } = await supabase
    .from('savings_goals')
    .update(payload)
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw mapWriteError(error);
}

export async function deleteSavingsGoal(id: string): Promise<void> {
  const userId = await currentUserId();
  const { error } = await supabase
    .from('savings_goals')
    .delete()
    .eq('id', id)
    .eq('user_id', userId);

  if (error) throw error;
}
