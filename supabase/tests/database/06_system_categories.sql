-- T2 — pgTAP: kategori sistem dari migrasi 0002_seed_system_categories.sql
-- (idempotent) + visible ke user terautentikasi lewat policy
-- categories_select_own_or_system, tapi tidak bisa diubah/dihapus user.

-- Helper (schema `tests`, extension pgTAP) dibuat oleh 00_setup.sql yang
-- dijalankan pgTAP lebih dulu secara alfabetis; DDL-nya persisten.
set role postgres;
set search_path = public, extensions;

begin;
select plan(7);

insert into auth.users (id, email)
values ('23000c90-c136-43d2-81b4-29e162613627', 'alice@test.com');

-- ---------------------------------------------------------------------------
-- Isi seed
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.categories where user_id is null and is_system and kind = 'expense'),
  8,
  'seed: 8 kategori sistem expense');

select is(
  (select count(*)::int from public.categories where user_id is null and is_system and kind = 'income'),
  4,
  'seed: 4 kategori sistem income');

select is(
  (select count(*)::int from public.categories
   where user_id is null and is_system and name = 'Makanan' and icon = 'restaurant'),
  1,
  'seed: kategori "Makanan" memakai ikon restaurant');

-- ---------------------------------------------------------------------------
-- Idempotent: menjalankan ulang insert seed tidak menambah baris/error
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ insert into public.categories (user_id, name, icon, kind, is_system) values
       (null, 'Makanan', 'restaurant', 'expense', true),
       (null, 'Gaji',    'payments',   'income',  true)
     on conflict (name, kind) where user_id is null do nothing $$,
  'seed: insert ulang tidak error (ON CONFLICT DO NOTHING)');

select is(
  (select count(*)::int from public.categories where user_id is null and is_system),
  12,
  'seed: menjalankan ulang tidak menambah baris');

-- ---------------------------------------------------------------------------
-- Policy kategori sistem
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '23000c90-c136-43d2-81b4-29e162613627';

select is(
  (select count(*)::int from public.categories where user_id is null and is_system),
  12,
  'RLS: user terautentikasi bisa membaca 12 kategori sistem');

select results_eq(
  $$ update public.categories set name = 'hacked' where user_id is null returning 1 $$,
  array[]::integer[],
  'RLS: kategori sistem tidak bisa diubah user');

select * from finish();
rollback;
