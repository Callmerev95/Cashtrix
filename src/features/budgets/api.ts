/**
 * Budgets data access.
 *
 * Reads go through `v_budget_status` (T7 migration): `spent`, `percent` and
 * `state` are computed server-side in the user's timezone — the client never
 * sums transactions and never derives a month itself. Writes go to `budgets`
 * (upsert on `(user_id, category_id, month)` so updating the current month's
 * limit is one call) and `budget_alerts` (upsert with `ignoreDuplicates`, the
 * client half of the `ON CONFLICT DO NOTHING` dedup, PRD §6.1 R1).
 */
import { supabase } from '@/supabase';

import {
  isBudgetState,
  type BudgetAlertThreshold,
  type BudgetStatus,
} from './domain';

type StatusRow = {
  budget_id: string;
  category_id: string;
  category_name: string;
  category_icon: string;
  month: string;
  amount_limit: number | string;
  spent: number | string;
  percent: number | string;
  state: string;
};

const STATUS_COLUMNS =
  'budget_id, category_id, category_name, category_icon, month, amount_limit, spent, percent, state';

function toStatus(row: StatusRow): BudgetStatus {
  return {
    budgetId: row.budget_id,
    categoryId: row.category_id,
    categoryName: row.category_name,
    categoryIcon: row.category_icon,
    month: row.month,
    amountLimit: Number(row.amount_limit),
    spent: Number(row.spent),
    percent: Number(row.percent),
    state: isBudgetState(row.state) ? row.state : 'ok',
  };
}

/** All budgets of one month (`YYYY-MM-DD`, day-1), newest category first. */
export async function listBudgetStatus(
  month: string,
): Promise<BudgetStatus[]> {
  const { data, error } = await supabase
    .from('v_budget_status')
    .select(STATUS_COLUMNS)
    .eq('month', month)
    .order('category_name', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as StatusRow[]).map(toStatus);
}

export type ExpenseCategory = {
  id: string;
  name: string;
  icon: string;
};

/** Expense categories (system + own) for the budget form picker. */
export async function listExpenseCategories(): Promise<ExpenseCategory[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, icon')
    .eq('kind', 'expense')
    .is('archived_at', null)
    .order('name', { ascending: true });

  if (error) throw error;
  return (data ?? []) as ExpenseCategory[];
}

/**
 * Create or update the month's budget for a category. One row per
 * `(user, category, month)` — the unique constraint makes the second save an
 * update, which is exactly the "update di bulan berjalan diizinkan" AC.
 */
export async function upsertBudget(input: {
  userId: string;
  categoryId: string;
  month: string;
  amountLimit: number;
}): Promise<void> {
  const { error } = await supabase.from('budgets').upsert(
    {
      user_id: input.userId,
      category_id: input.categoryId,
      month: input.month,
      amount_limit: input.amountLimit,
    },
    { onConflict: 'user_id,category_id,month' },
  );

  if (error) throw error;
}

export async function deleteBudget(id: string): Promise<void> {
  const { error } = await supabase.from('budgets').delete().eq('id', id);
  if (error) throw error;
}

/**
 * Records a fired alert. Returns `true` when this call created the row —
 * `false` means the alert already fired this month (dedup hit), so the caller
 * must stay silent. `ON CONFLICT DO NOTHING` is the whole anti-spam mechanism
 * (PRD §6.1 R1); the unique key is per-user so shared system categories never
 * block another account's alert.
 */
export async function recordAlert(input: {
  userId: string;
  categoryId: string;
  month: string;
  threshold: BudgetAlertThreshold;
}): Promise<boolean> {
  const { data, error } = await supabase
    .from('budget_alerts')
    .upsert(
      {
        user_id: input.userId,
        category_id: input.categoryId,
        month: input.month,
        threshold: input.threshold,
      },
      {
        onConflict: 'user_id,category_id,month,threshold',
        ignoreDuplicates: true,
      },
    )
    .select('id');

  if (error) throw error;
  return ((data ?? []) as { id: string }[]).length > 0;
}

/** The user's timezone, so month arithmetic matches the server's. */
export async function fetchTimezone(): Promise<string> {
  const { data, error } = await supabase
    .from('profiles')
    .select('timezone')
    .maybeSingle();

  if (error) throw error;
  return (data as { timezone: string } | null)?.timezone ?? 'Asia/Jakarta';
}

/**
 * The current budget month (day-1 `YYYY-MM-DD`) in the user's timezone.
 * `current_month(tz)` from T6 is the single source — the client never computes
 * a month boundary itself (PRD §4.2).
 */
export async function fetchCurrentMonth(tz: string): Promise<string> {
  const { data, error } = await supabase.rpc('current_month', { tz });
  if (error) throw error;
  return data as string;
}
