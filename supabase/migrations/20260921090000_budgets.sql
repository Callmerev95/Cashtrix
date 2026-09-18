-- T7 (#8) — Budget + alert dedup ("Budget Architecture").
--
-- Yang ditambahkan:
--   1. `v_budget_status` — satu baris per budget: spent, percent, state
--      (`ok`/`warning`/`exceeded`). Spent = Σ expense transaksi kategori itu
--      dalam bulan budget, dihitung di timezone user (join `profiles.timezone`),
--      soft-deleted dikecualikan, income tidak ikut (PRD §6.1 R4).
--   2. Trigger `enforce_budget_expense_only` — budget hanya untuk kategori
--      expense (AC #8). `CHECK` biasa tidak bisa melihat tabel lain, jadi
--      memakai trigger `BEFORE INSERT OR UPDATE` yang raise `23514`.
--
-- Yang SENGAJA tidak ditambahkan:
--   - RPC `record_budget_alert`: dedup sudah dijamin unique constraint
--     `budget_alerts(user_id, category_id, month, threshold)` (PRD §6.1 R1);
--     klien insert langsung dengan `ON CONFLICT DO NOTHING` / upsert
--     `ignoreDuplicates`. Satu fungsi RPC hanya menambah permukaan API tanpa
--     menambah jaminan.
--   - Index baru: `transactions_user_category_occurred_idx
--     (user_id, category_id, occurred_at)` dari T2 sudah melayani join spent.
--   - Cron reset bulanan: `month` adalah dimensi data — budget bulan baru
--     otomatis kosong karena tidak ada baris budget/transaksi di bulan itu
--     (PRD Epic E). `current_month(tz)` dari T6 tetap satu-satunya sumber
--     "bulan berjalan".
--
-- Pola T4/T5/T6 dipertahankan: `security_invoker = true` + `revoke all from
-- anon, public` lalu `grant select to authenticated`, sehingga RLS tabel dasar
-- tetap menjadi penjaga.

-- ---------------------------------------------------------------------------
-- Guard: budget hanya untuk kategori expense
-- ---------------------------------------------------------------------------

create or replace function public.enforce_budget_expense_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  category_kind text;
begin
  select kind into category_kind
  from public.categories
  where id = new.category_id;

  if category_kind is distinct from 'expense' then
    raise exception
      using message = 'budget hanya untuk kategori expense',
            errcode = '23514';
  end if;

  return new;
end;
$$;

comment on function public.enforce_budget_expense_only() is
  'Guard T7: INSERT/UPDATE budgets ditolak (23514) kecuali kategorinya expense.';

-- Fungsi trigger tidak perlu bisa dipanggil langsung (PostgREST me-expose
-- semua fungsi sebagai RPC — linter advisor menandainya). Trigger tetap jalan
-- tanpa hak EXECUTE; yang dicabut hanya jalur pemanggilan langsung.
revoke all on function public.enforce_budget_expense_only() from public, anon, authenticated;

drop trigger if exists budgets_enforce_expense_only on public.budgets;

create trigger budgets_enforce_expense_only
  before insert or update of category_id on public.budgets
  for each row execute function public.enforce_budget_expense_only();

-- ---------------------------------------------------------------------------
-- v_budget_status — spent × percent × state per budget
-- ---------------------------------------------------------------------------

-- Satu baris per baris `budgets`. `month` datang dari baris budget itu sendiri
-- (hari-1, sudah dijamin CHECK `extract(day from month) = 1` sejak T2);
-- transaksi dianggap masuk bulan itu bila `date_trunc('month', occurred_at di
-- tz user) = budgets.month`. Boundary WIB vs UTC diuji di pgTAP
-- (`11_budgets.sql`): transaksi 1 Okt 00:30 WIB (+07) jatuh di bulan Oktober
-- meski di UTC masih 30 Sep.
--
-- `percent` dalam persen (0..100+, bukan fraksi) supaya klien tidak perlu
-- mengalikan sendiri; `state`: `percent >= 100` → `exceeded`,
-- `percent >= 80` → `warning`, selain itu `ok` (threshold PRD Epic E).
create or replace view public.v_budget_status
with (security_invoker = true)
as
select
  b.user_id,
  b.id as budget_id,
  b.category_id,
  c.name as category_name,
  c.icon as category_icon,
  b.month,
  b.amount_limit,
  coalesce(sum(case when t.type = 'expense' then t.amount end), 0) as spent,
  case
    when b.amount_limit > 0
      then coalesce(sum(case when t.type = 'expense' then t.amount end), 0)
           / b.amount_limit * 100
    else 0
  end as percent,
  case
    when b.amount_limit > 0
         and coalesce(sum(case when t.type = 'expense' then t.amount end), 0)
             / b.amount_limit * 100 >= 100 then 'exceeded'
    when b.amount_limit > 0
         and coalesce(sum(case when t.type = 'expense' then t.amount end), 0)
             / b.amount_limit * 100 >= 80 then 'warning'
    else 'ok'
  end as state
from public.budgets b
join public.categories c on c.id = b.category_id
join public.profiles p on p.id = b.user_id
left join public.transactions t
  on t.user_id = b.user_id
  and t.category_id = b.category_id
  and t.deleted_at is null
  and t.type = 'expense'
  and date_trunc(
        'month',
        (t.occurred_at at time zone coalesce(p.timezone, 'Asia/Jakarta'))
      )::date = b.month
group by
  b.user_id, b.id, b.category_id, c.name, c.icon, b.month, b.amount_limit;

comment on view public.v_budget_status is
  'Spent, percent, dan state (ok/warning/exceeded) per budget. security_invoker: RLS pemanggil berlaku. Bulan baru otomatis kosong (tanpa cron).';

revoke all on public.v_budget_status from anon, public;
grant select on public.v_budget_status to authenticated;
