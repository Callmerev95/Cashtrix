-- T6 (#7) — Analytics ("Financial Intelligence").
--
-- Semua agregat finansial dihitung di Postgres (PRD §4.2 / D2): klien tidak
-- pernah menarik transaksi mentah lalu menghitung sendiri. Migrasi ini
-- menambahkan:
--   1. `current_month(tz)` — awal bulan kalender di timezone user (T7 akan
--      memakainya untuk budget; T6 memakainya untuk rentang 1M).
--   2. `v_monthly_summary` — income/expense/net per bulan (tz user).
--   3. `v_category_breakdown(range_start, range_end, tz, wallet)` — agregat
--      expense per kategori untuk donut & bar chart.
--   4. `v_analytics_series(...)` — bucket harian (rentang ≤ 1 bulan) atau
--      bulanan (> 1 bulan) untuk bar chart.
--   5. `v_daily_series(...)` / `analytics_overview(...)` — KPI + delta vs
--      periode sebelumnya yang sama panjang, plus donut & bar dalam SATU
--      round-trip (target p95 <300ms, AC).
--
-- Pola view T4/T5 dipertahankan: `security_invoker = true` + `revoke all from
-- anon, public` lalu `grant select to authenticated`. Fungsi agregasi di sini
-- adalah `security invoker` juga (bukan security definer), sehingga RLS tabel
-- dasar tetap menjadi penjaga dan tidak ada jalur bocor saldo/transaksi user
-- lain.
--
-- Aturan arah uang (PRD §6.1 R4): `amount` selalu positif, `type` yang
-- menentukan tanda. Tidak ada tempat di sini yang menjumlahkan `amount` mentah
-- tanpa `case when type = ...`.

-- ---------------------------------------------------------------------------
-- current_month(tz) — awal bulan kalender di timezone user
-- ---------------------------------------------------------------------------

-- Dipakai T6 (rentang 1M) dan T7 (month budget). `date_trunc('month', ... at
-- time zone tz)` mengembalikan *timestamp* di tz itu; cast ke `date` memberi
-- hari-1 bulan kalender user. Boundary WIB vs UTC diuji di pgTAP
-- (`10_analytics.sql`) karena inilah satu-satunya tempat konversi tz terjadi.
create or replace function public.current_month(tz text default 'Asia/Jakarta')
returns date
language sql
stable
set search_path = ''
as $$
  select date_trunc('month', (now() at time zone tz))::date;
$$;

comment on function public.current_month(text) is
  'Hari-1 bulan kalender saat ini di timezone `tz` (default Asia/Jakarta). Satu-satunya sumber bulan budget/analytics.';

revoke all on function public.current_month(text) from public, anon;
grant execute on function public.current_month(text) to authenticated;

-- ---------------------------------------------------------------------------
-- v_monthly_summary — income/expense/net per bulan (tz user)
-- ---------------------------------------------------------------------------

-- Bentuk "view" sesuai PRD §4.2: satu baris per (user, bulan). `month`
-- dihitung dari `occurred_at at time zone tz` sehingga transaksi 31 Des 23:59
-- WIB jatuh di bulan Desember, bukan Januari (UTC). `security_invoker` wajib.
create or replace view public.v_monthly_summary
with (security_invoker = true)
as
select
  t.user_id,
  date_trunc('month', (t.occurred_at at time zone coalesce(p.timezone, 'Asia/Jakarta')))::date as month,
  coalesce(sum(case when t.type = 'income' then t.amount end), 0) as total_income,
  coalesce(sum(case when t.type = 'expense' then t.amount end), 0) as total_expense,
  coalesce(sum(case when t.type = 'income' then t.amount end), 0)
    - coalesce(sum(case when t.type = 'expense' then t.amount end), 0) as net
from public.transactions t
join public.profiles p on p.id = t.user_id
where t.deleted_at is null
  and t.type in ('income', 'expense')
group by t.user_id, p.timezone,
         date_trunc('month', (t.occurred_at at time zone coalesce(p.timezone, 'Asia/Jakarta')));

comment on view public.v_monthly_summary is
  'Income/expense/net per bulan kalender user (tz dari profiles.timezone). Soft-deleted dikecualikan. security_invoker: RLS pemanggil berlaku.';

revoke all on public.v_monthly_summary from anon, public;
grant select on public.v_monthly_summary to authenticated;

-- ---------------------------------------------------------------------------
-- v_category_breakdown — agregat expense per kategori untuk satu rentang
-- ---------------------------------------------------------------------------

-- PRD §4.2 menamainya `v_category_breakdown(user_id, range_start, range_end)`;
-- bentuk parameter itu tidak bisa jadi view biasa, jadi diimplementasikan
-- sebagai set-returning SQL function yang dipanggil `from v_category_breakdown(...)`.
-- Tetap `security invoker` (default) → RLS tabel dasar berlaku; `user_id`
-- tidak diambil dari argumen melainkan dari `auth.uid()`.
--
-- `range_end` EKSKLUSIF (`occurred_at < range_end`) supaya dua periode
-- berurutan tidak saling tumpang tindih di boundary.
-- `wallet_filter` null = semua wallet.
create or replace function public.v_category_breakdown(
  range_start timestamptz,
  range_end timestamptz,
  tz text default 'Asia/Jakarta',
  wallet_filter uuid default null
)
returns table (
  category_id uuid,
  category_name text,
  category_icon text,
  total_expense numeric,
  transaction_count bigint,
  share numeric
)
language sql
stable
set search_path = ''
as $$
  with scoped as (
    select
      t.category_id,
      t.amount
    from public.transactions t
    where t.deleted_at is null
      and t.type = 'expense'
      and t.occurred_at >= range_start
      and t.occurred_at < range_end
      and (wallet_filter is null or t.wallet_id = wallet_filter)
  ),
  totals as (
    select coalesce(sum(amount), 0) as grand_total from scoped
  )
  select
    c.id,
    c.name,
    c.icon,
    coalesce(sum(s.amount), 0) as total_expense,
    count(s.amount) as transaction_count,
    case
      when (select grand_total from totals) > 0
        then coalesce(sum(s.amount), 0) / (select grand_total from totals)
      else 0
    end as share
  from scoped s
  join public.categories c on c.id = s.category_id
  group by c.id, c.name, c.icon
  order by total_expense desc, c.name asc;
$$;

comment on function public.v_category_breakdown(timestamptz, timestamptz, text, uuid) is
  'Agregat expense per kategori untuk [range_start, range_end) + share. security invoker: RLS pemanggil berlaku.';

revoke all on function public.v_category_breakdown(timestamptz, timestamptz, text, uuid) from public, anon;
grant execute on function public.v_category_breakdown(timestamptz, timestamptz, text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- v_analytics_series — bucket bar chart (harian ≤1M, bulanan >1M)
-- ---------------------------------------------------------------------------

-- Satu fungsi, dua mode, supaya klien tidak perlu tahu granularitasnya:
-- `daily = true` mengelompokkan per hari (tz user), `false` per bulan.
-- Bucket KOSONG tidak dikembalikan (klien mengisi gap dengan 0) — itu menjaga
-- query tetap murah dan menghindari `generate_series` yang membengkak di
-- rentang ALL.
create or replace function public.v_analytics_series(
  range_start timestamptz,
  range_end timestamptz,
  tz text default 'Asia/Jakarta',
  wallet_filter uuid default null,
  daily boolean default true
)
returns table (
  bucket date,
  total_expense numeric,
  total_income numeric,
  net numeric
)
language sql
stable
set search_path = ''
as $$
  select
    case
      when daily
        then (t.occurred_at at time zone tz)::date
      else date_trunc('month', (t.occurred_at at time zone tz))::date
    end as bucket,
    coalesce(sum(case when t.type = 'expense' then t.amount end), 0) as total_expense,
    coalesce(sum(case when t.type = 'income' then t.amount end), 0) as total_income,
    coalesce(sum(case when t.type = 'income' then t.amount end), 0)
      - coalesce(sum(case when t.type = 'expense' then t.amount end), 0) as net
  from public.transactions t
  where t.deleted_at is null
    and t.type in ('income', 'expense')
    and t.occurred_at >= range_start
    and t.occurred_at < range_end
    and (wallet_filter is null or t.wallet_id = wallet_filter)
  group by 1
  order by 1 asc;
$$;

comment on function public.v_analytics_series(timestamptz, timestamptz, text, uuid, boolean) is
  'Bucket expense/income/net harian atau bulanan untuk bar chart. Bucket kosong tidak dikembalikan. security invoker.';

revoke all on function public.v_analytics_series(timestamptz, timestamptz, text, uuid, boolean) from public, anon;
grant execute on function public.v_analytics_series(timestamptz, timestamptz, text, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- analytics_overview — KPI + delta + donut + bar dalam satu round-trip
-- ---------------------------------------------------------------------------

-- Satu RPC mengembalikan seluruh payload layar supaya p95 <300ms tercapai
-- (satu query, bukan 4 round-trip berturut-turut yang masing-masing menghitung
-- ulang scan `transactions`). Delta % dihitung di sini, bukan di klien
-- (PRD §4.2: tidak ada agregat finansial di klien).
--
-- `range_start`/`range_end` diberikan klien (rentang kalender tz user);
-- `prev_start`/`prev_end` = periode sebelumnya yang sama panjang.
-- `daily` menandakan granularitas bar chart (rentang ≤1 bulan → harian).
-- Delta dinyatakan dalam persen: `(current - previous) / previous * 100`,
-- `null` bila periode sebelumnya nol (klien merender "—", bukan Infinity/NaN).
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
    'series', series
  );
end;
$$;

comment on function public.analytics_overview(timestamptz, timestamptz, timestamptz, timestamptz, text, uuid, boolean) is
  'Payload layar Analytics: totals + delta % vs periode sebelumnya + donut breakdown + bar series, satu round-trip. security invoker.';

revoke all on function public.analytics_overview(timestamptz, timestamptz, timestamptz, timestamptz, text, uuid, boolean) from public, anon;
grant execute on function public.analytics_overview(timestamptz, timestamptz, timestamptz, timestamptz, text, uuid, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Index — p95 <300ms pada 10k transaksi
-- ---------------------------------------------------------------------------

-- `transactions_user_occurred_idx (user_id, occurred_at desc)` sudah ada (T2)
-- dan melayani semua agregat rentang di atas (filter `user_id` × `occurred_at`
-- range). Filter wallet opsional dilayani `transactions_wallet_idx` (T2) untuk
-- selektivitas wallet tunggal. Tidak ada index baru yang dibutuhkan; ini
-- dicatat supaya tidak ada yang menambahkannya "untuk berjaga-jaga" lalu
-- membebani write path transaksi.
