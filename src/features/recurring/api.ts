/**
 * Recurring data access.
 *
 * Reads hit `recurring_rules` directly (RLS scopes to the caller) with the
 * wallet/category names joined for display — the same shape the category
 * manager uses. Writes go to `recurring_rules`; births go through the
 * `run_recurring_catchup` RPC, never through client inserts (the client must
 * not invent occurrences — story 27).
 */
import { supabase } from '@/supabase';

import {
  isRecurringKind,
  isRuleStatus,
  type RecurringKind,
  type RecurringRule,
  type RuleStatus,
} from './domain';

type JoinedWallet = { name: string; archived_at: string | null };
type JoinedCategory = { name: string; icon: string };

type RuleRow = {
  id: string;
  kind: string;
  amount: number | string;
  wallet_id: string;
  category_id: string;
  due_day: number | null;
  due_last: boolean;
  starts_on: string;
  ends_on: string | null;
  status: string;
  wallets: JoinedWallet | JoinedWallet[] | null;
  categories: JoinedCategory | JoinedCategory[] | null;
};

/** PostgREST may hand a to-one join back as a 1-tuple — take the row. */
function pickOne<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

const RULE_COLUMNS =
  'id, kind, amount, wallet_id, category_id, due_day, due_last, starts_on, ends_on, status, wallets!inner(name, archived_at), categories!inner(name, icon)';

function toRule(row: RuleRow): RecurringRule {
  const wallet = pickOne(row.wallets);
  const category = pickOne(row.categories);
  return {
    id: row.id,
    kind: isRecurringKind(row.kind) ? row.kind : 'expense',
    amount: Number(row.amount),
    walletId: row.wallet_id,
    walletName: wallet?.name ?? '',
    walletArchived: (wallet?.archived_at ?? null) !== null,
    categoryId: row.category_id,
    categoryName: category?.name ?? '',
    categoryIcon: category?.icon ?? 'category',
    dueDay: row.due_day,
    dueLast: row.due_last,
    startsOn: row.starts_on,
    endsOn: row.ends_on,
    status: isRuleStatus(row.status) ? row.status : 'active',
  };
}

/** Every rule of the caller, oldest first (stable order for the list). */
export async function listRecurringRules(): Promise<RecurringRule[]> {
  const { data, error } = await supabase
    .from('recurring_rules')
    .select(RULE_COLUMNS)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as unknown as RuleRow[]).map(toRule);
}

export async function createRecurringRule(input: {
  userId: string;
  kind: RecurringKind;
  amount: number;
  walletId: string;
  categoryId: string;
  dueDay: number | null;
  dueLast: boolean;
  startsOn: string;
  endsOn: string | null;
}): Promise<string> {
  const { data, error } = await supabase
    .from('recurring_rules')
    .insert({
      user_id: input.userId,
      kind: input.kind,
      amount: input.amount,
      wallet_id: input.walletId,
      category_id: input.categoryId,
      due_day: input.dueLast ? null : input.dueDay,
      due_last: input.dueLast,
      starts_on: input.startsOn,
      ends_on: input.endsOn,
    })
    .select('id')
    .single();

  if (error) throw error;
  return (data as { id: string }).id;
}

/**
 * Edits a rule. Kind is locked after creation (like the category form):
 * born occurrences keep their meaning, and only unborn dues follow the new
 * amount/wallet/category/due/ends.
 */
export async function updateRecurringRule(input: {
  id: string;
  amount: number;
  walletId: string;
  categoryId: string;
  dueDay: number | null;
  dueLast: boolean;
  endsOn: string | null;
}): Promise<void> {
  const { error } = await supabase
    .from('recurring_rules')
    .update({
      amount: input.amount,
      wallet_id: input.walletId,
      category_id: input.categoryId,
      due_day: input.dueLast ? null : input.dueDay,
      due_last: input.dueLast,
      ends_on: input.endsOn,
    })
    .eq('id', input.id);

  if (error) throw error;
}

/** Pause (Jeda) or resume a rule. Born occurrences stay untouched. */
export async function setRecurringRuleStatus(input: {
  id: string;
  status: RuleStatus;
}): Promise<void> {
  const { error } = await supabase
    .from('recurring_rules')
    .update({ status: input.status })
    .eq('id', input.id);

  if (error) throw error;
}

/**
 * Deletes a rule. The detach trigger keeps every born occurrence as an
 * ordinary transaction (`recurring_rule_id` nulled) — history is never
 * orphaned and never cascade-deleted (ADR-0005).
 */
export async function deleteRecurringRule(id: string): Promise<void> {
  const { error } = await supabase
    .from('recurring_rules')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/**
 * Runs the catch-up RPC. Returns how many occurrences were written (0 when
 * there is nothing due). Never throws for "nothing to do" — only for real
 * transport/RLS failures, which the provider swallows on foreground runs.
 */
export async function runCatchUpRpc(): Promise<number> {
  const { data, error } = await supabase.rpc('run_recurring_catchup');

  if (error) throw error;
  return Number(data ?? 0);
}

/** The caller's timezone, so month arithmetic matches the server's. */
export async function fetchRecurringTimezone(): Promise<string> {
  const { data, error } = await supabase
    .from('profiles')
    .select('timezone')
    .maybeSingle();

  if (error) throw error;
  return (data as { timezone: string } | null)?.timezone ?? 'Asia/Jakarta';
}

/**
 * Day-1 of the running month in the caller's timezone. `current_month(tz)`
 * from T6 is the single source — the client never computes a month boundary
 * itself (PRD §4.2). The form feeds it to `defaultStartsOn`.
 */
export async function fetchRecurringCurrentMonth(tz: string): Promise<string> {
  const { data, error } = await supabase.rpc('current_month', { tz });
  if (error) throw error;
  return data as string;
}
