-- L2 (Analytics Overhaul): `analytics_overview` + `prev_breakdown`.
--
-- Additive-only: the SAME `v_category_breakdown` call with the previous
-- window, exposed as one new `prev_breakdown` key. Signature, existing
-- keys, and existing math are byte-identical — old callers ignore the new
-- key. One round-trip preserved (p95 target): the prev scan rides the same
-- `transactions_user_occurred_idx` (T2) as every other range aggregate, so
-- no new index. No backfill (computed, not stored).
create or replace function public.analytics_overview(
  range_start timestamptz,
  range_end timestamptz,
  prev_start timestamptz,
  prev_end timestamptz,
  tz text default 'Asia/Jakarta',
  wallet_filter uuid default null,
  daily boolean default true
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  curr_expense numeric := 0;
  curr_income numeric := 0;
  prev_expense numeric := 0;
  prev_income numeric := 0;
  breakdown jsonb;
  prev_breakdown jsonb;
  series jsonb;
begin
  select
    coalesce(sum(case when t.type = 'expense' then t.amount end), 0),
    coalesce(sum(case when t.type = 'income' then t.amount end), 0)
  into curr_expense, curr_income
  from public.transactions t
  where t.deleted_at is null
    and t.type in ('income', 'expense')
    and t.occurred_at >= range_start
    and t.occurred_at < range_end
    and (wallet_filter is null or t.wallet_id = wallet_filter);

  select
    coalesce(sum(case when t.type = 'expense' then t.amount end), 0),
    coalesce(sum(case when t.type = 'income' then t.amount end), 0)
  into prev_expense, prev_income
  from public.transactions t
  where t.deleted_at is null
    and t.type in ('income', 'expense')
    and t.occurred_at >= prev_start
    and t.occurred_at < prev_end
    and (wallet_filter is null or t.wallet_id = wallet_filter);

  -- Donut: kategori expense, terurut menurun. Klien memotong top 8 + "Other".
  select coalesce(jsonb_agg(to_jsonb(b) order by b.total_expense desc, b.category_name asc), '[]'::jsonb)
  into breakdown
  from (
    select * from public.v_category_breakdown(range_start, range_end, tz, wallet_filter)
  ) b;

  -- L2: donut periode sebelumnya, agregat dan urutan yang sama persis.
  select coalesce(jsonb_agg(to_jsonb(b) order by b.total_expense desc, b.category_name asc), '[]'::jsonb)
  into prev_breakdown
  from (
    select * from public.v_category_breakdown(prev_start, prev_end, tz, wallet_filter)
  ) b;

  select coalesce(jsonb_agg(to_jsonb(s) order by s.bucket asc), '[]'::jsonb)
  into series
  from (
    select * from public.v_analytics_series(range_start, range_end, tz, wallet_filter, daily)
  ) s;

  return jsonb_build_object(
    'range', jsonb_build_object(
      'start', range_start,
      'end', range_end
    ),
    'totals', jsonb_build_object(
      'expense', curr_expense,
      'income', curr_income,
      'net', curr_income - curr_expense
    ),
    'previous', jsonb_build_object(
      'expense', prev_expense,
      'income', prev_income,
      'net', prev_income - prev_expense
    ),
    'delta', jsonb_build_object(
      'expense', case when prev_expense = 0 then null
                      else (curr_expense - prev_expense) / prev_expense * 100 end,
      'income', case when prev_income = 0 then null
                     else (curr_income - prev_income) / prev_income * 100 end,
      'net', case when (prev_income - prev_expense) = 0 then null
                  else ((curr_income - curr_expense) - (prev_income - prev_expense))
                       / abs(prev_income - prev_expense) * 100 end
    ),
    'breakdown', breakdown,
    'prev_breakdown', prev_breakdown,
    'series', series
  );
end;
$$;

comment on function public.analytics_overview(timestamptz, timestamptz, timestamptz, timestamptz, text, uuid, boolean) is
  'Payload layar Analytics: totals + delta % vs periode sebelumnya + donut breakdown + prev breakdown (L2) + bar series, satu round-trip. security invoker.';

revoke all on function public.analytics_overview(timestamptz, timestamptz, timestamptz, timestamptz, text, uuid, boolean) from public, anon;
grant execute on function public.analytics_overview(timestamptz, timestamptz, timestamptz, timestamptz, text, uuid, boolean) to authenticated;
