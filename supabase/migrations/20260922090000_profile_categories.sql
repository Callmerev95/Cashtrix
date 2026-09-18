-- Cashtrix — profil + kategori kustom, arsip per-user (T8, issue #9).
--
-- Kategori sistem (`user_id is null`) dipakai bersama semua akun, jadi satu
-- user tidak boleh mengubah barisnya: policy UPDATE/DELETE categories
-- mensyaratkan `user_id = auth.uid()`, sehingga "mengarsipkan" kategori
-- bawaan lewat `archived_at` selalu no-op RLS. Arsip kategori bawaan karena
-- itu disimpan per-user di `category_mutes` — klien menggabungkan kedua
-- sumber saat me-render grid (kategori sistem yang di-mute disembunyikan
-- hanya untuk user tersebut). Kategori kustom tetap memakai `archived_at`
-- (semantik lama, tidak berubah).
--
-- Tidak ada view/RPC baru: profil + kategori adalah CRUD RLS biasa.

-- ---------------------------------------------------------------------------
-- category_mutes — arsip per-user atas kategori bawaan (sistem)
-- ---------------------------------------------------------------------------

create table public.category_mutes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, category_id)
);

create trigger category_mutes_set_updated_at before update on public.category_mutes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS deny-by-default (pola yang sama dengan 6 tabel T2)
-- ---------------------------------------------------------------------------

alter table public.category_mutes enable row level security;

create policy category_mutes_select_own on public.category_mutes
  for select to authenticated using (user_id = (select auth.uid()));
create policy category_mutes_insert_own on public.category_mutes
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy category_mutes_update_own on public.category_mutes
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy category_mutes_delete_own on public.category_mutes
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Grants — authenticated saja, anon dicabut (deny-by-default)
-- ---------------------------------------------------------------------------

revoke all on public.category_mutes from anon, public;
grant select, insert, update, delete on public.category_mutes to authenticated;
grant all on public.category_mutes to service_role;
