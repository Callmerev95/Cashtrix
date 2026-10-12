-- P2b-spark: per-category expense series for breakdown sparklines.
--
-- `analytics_overview` carries only whole-screen aggregates (per-category
-- totals without time, per-bucket totals without category), so sparklines
-- need their own grain: (category, bucket) -> expense. Separate function
-- (not embedded in the overview) keeps the hot single-round-trip query
-- untouched and lets the client fetch sparklines best-effort alongside it.
--
-- Same cost discipline as `v_analytics_series`: no `generate_series`
-- (empty buckets are omitted; the client gap-fills with 0), expense-only
-- (transfers carry no category; income never draws), `security invoker`
-- so RLS scopes every row to the caller.

create or replace function public.v_category_series(
  range_start timestamptz,
  range_end timestamptz,
  tz text default 'Asia/Jakarta',
  wallet_filter uuid default null,
  daily boolean default true
)
returns table (
  category_id uuid,
  bucket date,
  total_expense numeric
)
language sql
stable
set search_path = ''
as $$
  select
    t.category_id,
    case
      when daily
        then (t.occurred_at at time zone tz)::date
      else date_trunc('month', (t.occurred_at at time zone tz))::date
    end as bucket,
    coalesce(sum(t.amount), 0) as total_expense
  from public.transactions t
  where t.deleted_at is null
    and t.type = 'expense'
    and t.category_id is not null
    and t.occurred_at >= range_start
    and t.occurred_at < range_end
    and (wallet_filter is null or t.wallet_id = wallet_filter)
  group by 1, 2
  order by 1 asc, 2 asc;
$$;

comment on function public.v_category_series(timestamptz, timestamptz, text, uuid, boolean) is
  'Deret expense per kategori per bucket untuk sparkline breakdown (P2b-spark). Bucket kosong tidak dikembalikan. security invoker.';

revoke all on function public.v_category_series(timestamptz, timestamptz, text, uuid, boolean) from public, anon;
grant execute on function public.v_category_series(timestamptz, timestamptz, text, uuid, boolean) to authenticated;
