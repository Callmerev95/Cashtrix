-- Cashtrix MVP — fondasi skema domain (T2, issue #2).
-- 6 tabel + constraint + index + RLS deny-by-default + bucket avatar privat.
-- View agregasi (v_wallet_balances, v_monthly_summary, v_category_breakdown, v_budget_status)
-- dan fungsi current_month(tz) menyusul di T4/T6/T7 sesuai specs/tickets.md.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Profil dibuat otomatis saat auth.users bertambah (timezone Asia/Jakarta default).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null default 'Pengguna' check (char_length(display_name) <= 60),
  avatar_url text,
  currency_code char(3) not null default 'IDR',
  timezone text not null default 'Asia/Jakarta',
  locale text not null default 'id-ID',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  type text not null check (type in ('bank', 'ewallet', 'cash', 'card')),
  opening_balance numeric(18,2) not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name),
  unique (id, user_id) -- target composite FK transactions(user_id, wallet_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade, -- null = kategori sistem
  name text not null check (char_length(name) between 1 and 40),
  icon text not null,
  kind text not null check (kind in ('income', 'expense')),
  is_system boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name, kind),
  check (not is_system or user_id is null)
);

-- Nama kategori sistem tidak boleh dobel (unique biasa tidak menjangkau user_id null).
create unique index categories_system_name_kind_idx
  on public.categories (name, kind)
  where user_id is null;

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  wallet_id uuid not null,
  category_id uuid not null references public.categories (id) on delete restrict,
  type text not null check (type in ('income', 'expense', 'transfer')), -- 'transfer' reserved v1.1
  amount numeric(18,2) not null check (amount > 0),
  currency_code char(3) not null default 'IDR',
  occurred_at timestamptz not null,
  note text check (char_length(note) <= 200),
  idempotency_key uuid not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  foreign key (wallet_id, user_id) references public.wallets (id, user_id) on delete restrict
);

create index transactions_user_occurred_idx
  on public.transactions (user_id, occurred_at desc);
create index transactions_user_category_occurred_idx
  on public.transactions (user_id, category_id, occurred_at);
create index transactions_wallet_idx on public.transactions (wallet_id);
create index transactions_category_idx on public.transactions (category_id);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  month date not null check (extract(day from month) = 1), -- hari-1 bulan tz user
  amount_limit numeric(18,2) not null check (amount_limit > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, month)
);

create table public.budget_alerts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  month date not null check (extract(day from month) = 1),
  threshold text not null check (threshold in ('warning_80', 'exceeded_100')),
  fired_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id, month, threshold) -- dedup alert per-user (PRD §6.1 R1)
);

create index budget_alerts_user_month_idx on public.budget_alerts (user_id, month);

create trigger profiles_set_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger wallets_set_updated_at before update on public.wallets
  for each row execute function public.set_updated_at();
create trigger categories_set_updated_at before update on public.categories
  for each row execute function public.set_updated_at();
create trigger transactions_set_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();
create trigger budgets_set_updated_at before update on public.budgets
  for each row execute function public.set_updated_at();
create trigger budget_alerts_set_updated_at before update on public.budget_alerts
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Maksimum 10 wallet per user
-- ---------------------------------------------------------------------------

create or replace function public.enforce_wallet_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  wallet_count integer;
begin
  -- ponytail: advisory lock per user, cukup untuk personal app (<10 wallet).
  perform pg_advisory_xact_lock(hashtextextended(new.user_id::text, 0));

  select count(*) into wallet_count
  from public.wallets
  where user_id = new.user_id;

  if wallet_count >= 10 then
    raise exception 'wallet limit reached (max 10)' using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger wallets_enforce_limit
before insert on public.wallets
for each row execute function public.enforce_wallet_limit();

-- ---------------------------------------------------------------------------
-- Row Level Security — deny-by-default, 100% tabel, tanpa USING (true)
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.wallets enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.budgets enable row level security;
alter table public.budget_alerts enable row level security;

create policy profiles_select_own on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
create policy profiles_update_own on public.profiles
  for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy profiles_delete_own on public.profiles
  for delete to authenticated using ((select auth.uid()) = id);

create policy wallets_select_own on public.wallets
  for select to authenticated using (user_id = (select auth.uid()));
create policy wallets_insert_own on public.wallets
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy wallets_update_own on public.wallets
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy wallets_delete_own on public.wallets
  for delete to authenticated using (user_id = (select auth.uid()));

-- Kategori sistem (user_id null) boleh dibaca semua user terautentikasi; kategori
-- milik user lain tetap tidak terlihat.
create policy categories_select_own_or_system on public.categories
  for select to authenticated
  using (user_id is null or user_id = (select auth.uid()));
create policy categories_insert_own on public.categories
  for insert to authenticated
  with check (user_id = (select auth.uid()) and not is_system);
create policy categories_update_own on public.categories
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()) and not is_system);
create policy categories_delete_own on public.categories
  for delete to authenticated
  using (user_id = (select auth.uid()) and not is_system);

create policy transactions_select_own on public.transactions
  for select to authenticated using (user_id = (select auth.uid()));
create policy transactions_insert_own on public.transactions
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy transactions_update_own on public.transactions
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy transactions_delete_own on public.transactions
  for delete to authenticated using (user_id = (select auth.uid()));

create policy budgets_select_own on public.budgets
  for select to authenticated using (user_id = (select auth.uid()));
create policy budgets_insert_own on public.budgets
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy budgets_update_own on public.budgets
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy budgets_delete_own on public.budgets
  for delete to authenticated using (user_id = (select auth.uid()));

create policy budget_alerts_select_own on public.budget_alerts
  for select to authenticated using (user_id = (select auth.uid()));
create policy budget_alerts_insert_own on public.budget_alerts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy budget_alerts_update_own on public.budget_alerts
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy budget_alerts_delete_own on public.budget_alerts
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Storage — bucket avatar privat, path {user_id}/...
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 2097152, array['image/png', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy avatars_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Grants — authenticated + service_role saja, anon dicabut (deny-by-default)
-- ---------------------------------------------------------------------------

grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
revoke all on all tables in schema public from anon;
