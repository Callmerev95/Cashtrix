-- T2 — pgTAP: RLS deny-by-default + isolasi antar-user di 100% tabel.
-- Skenario: alice dan bob. alice harus gagal SELECT/UPDATE/DELETE baris bob
-- di setiap tabel public, dan tetap bisa mengakses barisnya sendiri.
--
-- Catatan: UPDATE/DELETE bentrok RLS diuji lewat perilaku observable — baris milik
-- user lain tidak ikut berubah dan tetap utuh saat dicek ulang sebagai postgres —
-- karena baris yang tidak lolos RLS memang tidak terlihat (`returning` kosong).

-- Helper (schema `tests`, extension pgTAP) dibuat oleh 00_setup.sql yang
-- dijalankan pgTAP lebih dulu secara alfabetis; DDL-nya persisten.
set role postgres;
set search_path = public, extensions;

begin;
select plan(37);

-- ---------------------------------------------------------------------------
-- Data uji (dibuat sebagai postgres, RLS bypass)
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('23000c90-c136-43d2-81b4-29e162613627', 'alice@test.com'),
  ('5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b', 'bob@test.com');

-- profil dibuat otomatis oleh trigger handle_new_user (dicek di file 05).

insert into public.wallets (id, user_id, name, type, opening_balance) values
  ('71000000-0000-4000-a000-000000000001', '23000c90-c136-43d2-81b4-29e162613627', 'Cash', 'cash', 0),
  ('71000000-0000-4000-a000-000000000002', '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b', 'Cash', 'cash', 0);

insert into public.categories (id, user_id, name, icon, kind, is_system) values
  ('72000000-0000-4000-a000-000000000001', '23000c90-c136-43d2-81b4-29e162613627', 'Fotografi', 'photo_camera', 'expense', false),
  ('72000000-0000-4000-a000-000000000002', '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b', 'Fotografi', 'photo_camera', 'expense', false);

insert into public.transactions (id, user_id, wallet_id, category_id, type, amount, currency_code, occurred_at, note, idempotency_key) values
  ('73000000-0000-4000-a000-000000000001', '23000c90-c136-43d2-81b4-29e162613627',
   '71000000-0000-4000-a000-000000000001', '72000000-0000-4000-a000-000000000001',
   'expense', 25000, 'IDR', now() - interval '1 day', 'kopi', '74000000-0000-4000-a000-000000000001'),
  ('73000000-0000-4000-a000-000000000002', '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b',
   '71000000-0000-4000-a000-000000000002', '72000000-0000-4000-a000-000000000002',
   'expense', 50000, 'IDR', now() - interval '1 day', 'makan', '74000000-0000-4000-a000-000000000002');

insert into public.budgets (id, user_id, category_id, month, amount_limit) values
  ('75000000-0000-4000-a000-000000000001', '23000c90-c136-43d2-81b4-29e162613627',
   '72000000-0000-4000-a000-000000000001', '2026-09-01', 1000000),
  ('75000000-0000-4000-a000-000000000002', '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b',
   '72000000-0000-4000-a000-000000000002', '2026-09-01', 500000);

insert into public.budget_alerts (id, user_id, category_id, month, threshold) values
  ('76000000-0000-4000-a000-000000000001', '23000c90-c136-43d2-81b4-29e162613627',
   '72000000-0000-4000-a000-000000000001', '2026-09-01', 'warning_80'),
  ('76000000-0000-4000-a000-000000000002', '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b',
   '72000000-0000-4000-a000-000000000002', '2026-09-01', 'warning_80');

-- ---------------------------------------------------------------------------
-- RLS enabled di 100% tabel
-- ---------------------------------------------------------------------------

select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.profiles'::regclass),
  'RLS enabled: profiles');
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.wallets'::regclass),
  'RLS enabled: wallets');
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.categories'::regclass),
  'RLS enabled: categories');
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.transactions'::regclass),
  'RLS enabled: transactions');
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.budgets'::regclass),
  'RLS enabled: budgets');
select ok(
  (select relrowsecurity from pg_catalog.pg_class where oid = 'public.budget_alerts'::regclass),
  'RLS enabled: budget_alerts');

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '23000c90-c136-43d2-81b4-29e162613627';

select isnt_empty(
  $$ select 1 from public.profiles where id = '23000c90-c136-43d2-81b4-29e162613627' $$,
  'profiles: alice bisa melihat profilnya sendiri');
select is_empty(
  $$ select 1 from public.profiles where id = '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b' $$,
  'profiles: alice tidak bisa melihat profil bob');
select results_eq(
  $$ update public.profiles set display_name = 'hacked' where id = '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b' returning 1 $$,
  array[]::integer[],
  'profiles: alice tidak bisa update profil bob');
select results_eq(
  $$ delete from public.profiles where id = '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b' returning 1 $$,
  array[]::integer[],
  'profiles: alice tidak bisa delete profil bob');

-- ---------------------------------------------------------------------------
-- wallets
-- ---------------------------------------------------------------------------

select isnt_empty(
  $$ select 1 from public.wallets where user_id = '23000c90-c136-43d2-81b4-29e162613627' $$,
  'wallets: alice bisa melihat wallet-nya sendiri');
select is_empty(
  $$ select 1 from public.wallets where user_id = '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b' $$,
  'wallets: alice tidak bisa melihat wallet bob');
select results_eq(
  $$ update public.wallets set name = 'hacked' where user_id = '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b' returning 1 $$,
  array[]::integer[],
  'wallets: alice tidak bisa update wallet bob');
select results_eq(
  $$ delete from public.wallets where user_id = '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b' returning 1 $$,
  array[]::integer[],
  'wallets: alice tidak bisa delete wallet bob');

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------

select isnt_empty(
  $$ select 1 from public.categories where user_id = '23000c90-c136-43d2-81b4-29e162613627' $$,
  'categories: alice bisa melihat kategori miliknya');
select is_empty(
  $$ select 1 from public.categories where user_id = '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b' $$,
  'categories: alice tidak bisa melihat kategori bob');
select results_eq(
  $$ update public.categories set name = 'hacked' where user_id = '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b' returning 1 $$,
  array[]::integer[],
  'categories: alice tidak bisa update kategori bob');
select results_eq(
  $$ delete from public.categories where user_id = '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b' returning 1 $$,
  array[]::integer[],
  'categories: alice tidak bisa delete kategori bob');

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------

select isnt_empty(
  $$ select 1 from public.transactions where user_id = '23000c90-c136-43d2-81b4-29e162613627' $$,
  'transactions: alice bisa melihat transaksinya sendiri');
select is_empty(
  $$ select 1 from public.transactions where user_id = '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b' $$,
  'transactions: alice tidak bisa melihat transaksi bob');
select results_eq(
  $$ update public.transactions set note = 'hacked' where user_id = '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b' returning 1 $$,
  array[]::integer[],
  'transactions: alice tidak bisa update transaksi bob');
select results_eq(
  $$ delete from public.transactions where user_id = '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b' returning 1 $$,
  array[]::integer[],
  'transactions: alice tidak bisa delete transaksi bob');

-- ---------------------------------------------------------------------------
-- budgets
-- ---------------------------------------------------------------------------

select isnt_empty(
  $$ select 1 from public.budgets where user_id = '23000c90-c136-43d2-81b4-29e162613627' $$,
  'budgets: alice bisa melihat budget-nya sendiri');
select is_empty(
  $$ select 1 from public.budgets where user_id = '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b' $$,
  'budgets: alice tidak bisa melihat budget bob');
select results_eq(
  $$ update public.budgets set amount_limit = 1 where user_id = '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b' returning 1 $$,
  array[]::integer[],
  'budgets: alice tidak bisa update budget bob');
select results_eq(
  $$ delete from public.budgets where user_id = '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b' returning 1 $$,
  array[]::integer[],
  'budgets: alice tidak bisa delete budget bob');

-- ---------------------------------------------------------------------------
-- budget_alerts
-- ---------------------------------------------------------------------------

select isnt_empty(
  $$ select 1 from public.budget_alerts where user_id = '23000c90-c136-43d2-81b4-29e162613627' $$,
  'budget_alerts: alice bisa melihat alert-nya sendiri');
select is_empty(
  $$ select 1 from public.budget_alerts where user_id = '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b' $$,
  'budget_alerts: alice tidak bisa melihat alert bob');
select results_eq(
  $$ update public.budget_alerts set fired_at = now() where user_id = '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b' returning 1 $$,
  array[]::integer[],
  'budget_alerts: alice tidak bisa update alert bob');
select results_eq(
  $$ delete from public.budget_alerts where user_id = '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b' returning 1 $$,
  array[]::integer[],
  'budget_alerts: alice tidak bisa delete alert bob');

-- ---------------------------------------------------------------------------
-- Baris bob tetap utuh (bukti nyata UPDATE/DELETE alice tidak menyentuhnya)
-- dan tidak ada policy USING (true) / WITH CHECK (true) di public.
--
-- `reset role` mengembalikan role ke session user (bukan postgres), jadi role
-- owner di-set ulang eksplisit; `search_path` juga di-set ulang karena
-- RESET ROLE memulihkan GUC ke snapshot saat role di-set.
-- ---------------------------------------------------------------------------

reset role;
set role postgres;
set search_path = public, extensions;

select is(
  (select count(*)::int from public.profiles where id = '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b' and display_name = 'Pengguna'),
  1,
  'profiles: profil bob tidak berubah');
select is(
  (select count(*)::int from public.wallets where id = '71000000-0000-4000-a000-000000000002' and name = 'Cash'),
  1,
  'wallets: wallet bob tidak berubah');
select is(
  (select count(*)::int from public.categories where id = '72000000-0000-4000-a000-000000000002' and name = 'Fotografi'),
  1,
  'categories: kategori bob tidak berubah');
select is(
  (select count(*)::int from public.transactions where id = '73000000-0000-4000-a000-000000000002' and note = 'makan'),
  1,
  'transactions: transaksi bob tidak berubah');
select is(
  (select count(*)::int from public.budgets where id = '75000000-0000-4000-a000-000000000002' and amount_limit = 500000),
  1,
  'budgets: budget bob tidak berubah');
select is(
  (select count(*)::int from public.budget_alerts where id = '76000000-0000-4000-a000-000000000002'),
  1,
  'budget_alerts: alert bob tidak berubah');
select is_empty(
  $$ select 1 from pg_catalog.pg_policies
     where schemaname = 'public' and (qual = 'true' or with_check = 'true') $$,
  'tidak ada policy USING/WITH CHECK (true) di schema public');

select * from finish();
rollback;
