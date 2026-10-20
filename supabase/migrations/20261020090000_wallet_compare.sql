-- L4b (multi-wallet compare): `analytics_wallet_compare` RPC.
--
-- One round-trip returns BOTH metrics per active wallet — expense + income,
-- each with its previous-window figure, delta % and share — plus a per-wallet
-- bucket series. The Expense/Income toggle on the card therefore never
-- refetches: the payload is complete on the first call.
--
-- `share` is measured against the range total across ALL wallets (the exact
-- figure behind the KPI), so a wallet archived mid-range that still holds
-- spending keeps the percentage honest instead of silently rescaling.
--
-- Rows are active wallets only (archived excluded); a wallet with no movement
-- stays as a zero row so the chips and the list always agree. Aggregation is
-- server-side only (PRD §4.2) and `security invoker` + RLS scopes it to the
-- caller. No new index: every scan rides `transactions_user_occurred_idx`
-- (T2), same as the other range aggregates.
create or replace function public.analytics_wallet_compare(
  range_start timestamptz,
  range_end timestamptz,
  prev_start timestamptz,
  prev_end timestamptz,
  tz text default 'Asia/Jakarta',
  daily boolean default true
)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  range_expense numeric := 0;
  range_income numeric := 0;
  rows jsonb;
begin
  -- Denominator for `share` (all wallets, archived included) — identical to
  -- `analytics_overview.totals`, so the card never disagrees with the KPI.
  select
    coalesce(sum(case when t.type = 'expense' then t.amount end), 0),
    coalesce(sum(case when t.type = 'income' then t.amount end), 0)
  into range_expense, range_income
  from public.transactions t
  where t.deleted_at is null
    and t.type in ('income', 'expense')
    and t.occurred_at >= range_start
    and t.occurred_at < range_end;

  with active_wallets as (
    select w.id, w.name
    from public.wallets w
    where w.archived_at is null
  ),
  curr as (
    select
      a.id as wallet_id,
      coalesce(sum(case when t.type = 'expense' then t.amount end), 0) as expense,
      coalesce(sum(case when t.type = 'income' then t.amount end), 0) as income
    from active_wallets a
    left join public.transactions t
      on t.wallet_id = a.id
     and t.deleted_at is null
     and t.type in ('income', 'expense')
     and t.occurred_at >= range_start
     and t.occurred_at < range_end
    group by a.id
  ),
  prev as (
    select
      a.id as wallet_id,
      coalesce(sum(case when t.type = 'expense' then t.amount end), 0) as expense,
      coalesce(sum(case when t.type = 'income' then t.amount end), 0) as income
    from active_wallets a
    left join public.transactions t
      on t.wallet_id = a.id
     and t.deleted_at is null
     and t.type in ('income', 'expense')
     and t.occurred_at >= prev_start
     and t.occurred_at < prev_end
    group by a.id
  ),
  series as (
    select
      a.id as wallet_id,
      case
        when daily then (t.occurred_at at time zone tz)::date
        else date_trunc('month', (t.occurred_at at time zone tz))::date
      end as bucket,
      coalesce(sum(case when t.type = 'expense' then t.amount end), 0) as total_expense,
      coalesce(sum(case when t.type = 'income' then t.amount end), 0) as total_income
    from active_wallets a
    join public.transactions t
      on t.wallet_id = a.id
     and t.deleted_at is null
     and t.type in ('income', 'expense')
     and t.occurred_at >= range_start
     and t.occurred_at < range_end
    group by a.id, 2
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'wallet_id', a.id,
        'name', a.name,
        'totals', jsonb_build_object('expense', c.expense, 'income', c.income),
        'previous', jsonb_build_object('expense', p.expense, 'income', p.income),
        'delta', jsonb_build_object(
          'expense', case when p.expense = 0 then null
                          else (c.expense - p.expense) / p.expense * 100 end,
          'income', case when p.income = 0 then null
                         else (c.income - p.income) / p.income * 100 end
        ),
        'share', jsonb_build_object(
          'expense', case when range_expense = 0 then 0
                          else c.expense / range_expense end,
          'income', case when range_income = 0 then 0
                         else c.income / range_income end
        ),
        'series', coalesce(
          (
            select jsonb_agg(
              jsonb_build_object(
                'bucket', s.bucket,
                'total_expense', s.total_expense,
                'total_income', s.total_income
              )
              order by s.bucket
            )
            from series s
            where s.wallet_id = a.id
          ),
          '[]'::jsonb
        )
      )
      order by c.expense desc, a.name asc
    ),
    '[]'::jsonb
  )
  into rows
  from active_wallets a
  join curr c on c.wallet_id = a.id
  join prev p on p.wallet_id = a.id;

  return jsonb_build_object(
    'range', jsonb_build_object('start', range_start, 'end', range_end),
    'totals', jsonb_build_object('expense', range_expense, 'income', range_income),
    'wallets', rows
  );
end;
$$;

comment on function public.analytics_wallet_compare(timestamptz, timestamptz, timestamptz, timestamptz, text, boolean) is
  'Payload kartu Bandingkan Dompet (L4b): totals expense+income per dompet aktif + previous + delta + share + series, satu round-trip. security invoker.';

revoke all on function public.analytics_wallet_compare(timestamptz, timestamptz, timestamptz, timestamptz, text, boolean) from public, anon;
grant execute on function public.analytics_wallet_compare(timestamptz, timestamptz, timestamptz, timestamptz, text, boolean) to authenticated;
