/**
 * Analytics data access.
 *
 * Two reads, both server-aggregated (PRD §4.2 — the client never sums money):
 *  - `analytics_overview(...)` returns the whole screen payload (KPIs, delta,
 *    donut breakdown, bar series) in **one round-trip**, which is how the
 *    p95 <300ms target is met on 10k transactions;
 *  - `v_wallet_balances` feeds the wallet filter chips (id + name only — the
 *    filter passes a `wallet_id`, it does not compute anything).
 *
 * The overview RPC is `security invoker`, so RLS scopes every aggregate to the
 * signed-in user without an explicit `user_id` here.
 */
import { supabase } from '@/supabase';

import type { AnalyticsOverview, DateRange } from './domain';

/** Raw JSON shape returned by the `analytics_overview` RPC. */
type OverviewPayload = {
  range: { start: string; end: string };
  totals: { expense: number | string; income: number | string; net: number | string };
  previous: {
    expense: number | string;
    income: number | string;
    net: number | string;
  };
  delta: {
    expense: number | string | null;
    income: number | string | null;
    net: number | string | null;
  };
  breakdown: {
    category_id: string;
    category_name: string;
    category_icon: string;
    total_expense: number | string;
    transaction_count: number | string;
    share: number | string;
  }[];
  series: {
    bucket: string;
    total_expense: number | string;
    total_income: number | string;
    net: number | string;
  }[];
};

const num = (value: number | string | null): number =>
  value === null ? 0 : Number(value);

const numOrNull = (value: number | string | null): number | null =>
  value === null ? null : Number(value);

function toOverview(payload: OverviewPayload): AnalyticsOverview {
  return {
    range: payload.range,
    totals: {
      expense: num(payload.totals.expense),
      income: num(payload.totals.income),
      net: num(payload.totals.net),
    },
    previous: {
      expense: num(payload.previous.expense),
      income: num(payload.previous.income),
      net: num(payload.previous.net),
    },
    delta: {
      expense: numOrNull(payload.delta.expense),
      income: numOrNull(payload.delta.income),
      net: numOrNull(payload.delta.net),
    },
    breakdown: (payload.breakdown ?? []).map((row) => ({
      categoryId: row.category_id,
      categoryName: row.category_name,
      categoryIcon: row.category_icon,
      totalExpense: num(row.total_expense),
      transactionCount: num(row.transaction_count),
      share: num(row.share),
    })),
    series: (payload.series ?? []).map((row) => ({
      bucket: row.bucket,
      totalExpense: num(row.total_expense),
      totalIncome: num(row.total_income),
      net: num(row.net),
    })),
  };
}

export type FetchOverviewInput = {
  range: DateRange;
  /** `profiles.timezone` — the server buckets in the user's tz, not UTC. */
  tz: string;
  /** null = all wallets. */
  walletId: string | null;
  daily: boolean;
};

/**
 * The whole Analytics screen in a single RPC. `range_start` inclusive,
 * `range_end` exclusive; the previous window is equal-length and sits
 * immediately before `start` (both computed by `resolveRange`).
 */
export async function fetchOverview(
  input: FetchOverviewInput,
): Promise<AnalyticsOverview> {
  const { data, error } = await supabase.rpc('analytics_overview', {
    range_start: input.range.start.toISOString(),
    range_end: input.range.end.toISOString(),
    prev_start: input.range.previousStart.toISOString(),
    prev_end: input.range.previousEnd.toISOString(),
    tz: input.tz,
    wallet_filter: input.walletId,
    daily: input.daily,
  });

  if (error) throw error;
  return toOverview(data as OverviewPayload);
}

/** Wallet chips for the filter. Balance is irrelevant here — id + name only. */
export async function listWalletFilters(): Promise<
  { id: string; name: string }[]
> {
  const { data, error } = await supabase
    .from('v_wallet_balances')
    .select('wallet_id, name')
    .is('archived_at', null)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return ((data ?? []) as { wallet_id: string; name: string }[]).map((row) => ({
    id: row.wallet_id,
    name: row.name,
  }));
}

/** The user's timezone, so the client and server bucket months identically. */
export async function fetchTimezone(): Promise<string> {
  const { data, error } = await supabase
    .from('profiles')
    .select('timezone')
    .maybeSingle();

  if (error) throw error;
  return (data as { timezone: string } | null)?.timezone ?? 'Asia/Jakarta';
}
