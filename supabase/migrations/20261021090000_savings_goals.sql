-- Cashtrix Savings v1 — target tabungan menempel pada satu Wallet (SV1, #105).
--
-- Model A: target adalah metadata Wallet, bukan rekening/ledger kedua. Progress
-- nanti dibaca dari `v_wallet_balances` (Saldo Wallet), jadi tidak ada kolom
-- saldo atau agregasi baru di sini. Satu Wallet maksimal satu target; batas 10
-- target mengikuti batas 10 Wallet yang sudah ditegakkan `enforce_wallet_limit`.
--
-- FK komposit `(wallet_id, user_id)` pola Transfer V2: target tidak bisa
-- menunjuk Wallet milik user lain. `on delete restrict` adalah backstop untuk
-- guard UI (hapus Wallet ditolak selama target ada). `target_date` sengaja
-- tanpa check relatif `now()`: target lama harus tetap valid saat diedit;
-- aturan "tanggal baru tidak boleh lewat" hidup di domain klien (SV2).

create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  wallet_id uuid not null,
  name text,
  target_amount numeric(18,2) not null,
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, wallet_id),
  foreign key (wallet_id, user_id)
    references public.wallets (id, user_id) on delete restrict,
  check (target_amount > 0 and target_amount <= 999999999999),
  check (name is null or char_length(btrim(name)) between 1 and 60)
);

-- Sisi child FK + lookup per user (unique di atas sudah melayani user_id).
create index savings_goals_wallet_idx
  on public.savings_goals (wallet_id, user_id);

create trigger savings_goals_set_updated_at before update on public.savings_goals
  for each row execute function public.set_updated_at();

alter table public.savings_goals enable row level security;

create policy savings_goals_select_own on public.savings_goals
  for select to authenticated using (user_id = (select auth.uid()));
create policy savings_goals_insert_own on public.savings_goals
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy savings_goals_update_own on public.savings_goals
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy savings_goals_delete_own on public.savings_goals
  for delete to authenticated using (user_id = (select auth.uid()));

-- Tabel lahir setelah revoke T2, jadi perlu grant/revoke sendiri
-- (pola `category_mutes` T8 / `recurring_rules` V3).
revoke all on public.savings_goals from anon, public;
grant select, insert, update, delete on public.savings_goals to authenticated;
grant all on public.savings_goals to service_role;
