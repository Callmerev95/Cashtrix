-- T2 — pgTAP: constraint & index sesuai spec.
-- unique(user_id, idempotency_key), amount > 0, note <= 200,
-- unique(user_id, category_id, month), unique(user_id, category_id, month, threshold),
-- check (type), check (extract(day from month) = 1), index performa.
-- Semua insert dijalankan sebagai superuser (RLS bypass) agar yang diuji
-- murni constraint, bukan policy.

-- Helper (schema `tests`, extension pgTAP) dibuat oleh 00_setup.sql yang
-- dijalankan pgTAP lebih dulu secara alfabetis; DDL-nya persisten.
set role postgres;
set search_path = public, extensions;

begin;
select plan(24);

insert into auth.users (id, email) values
  ('23000c90-c136-43d2-81b4-29e162613627', 'alice@test.com');

insert into public.wallets (id, user_id, name, type) values
  ('71000000-0000-4000-a000-000000000001', '23000c90-c136-43d2-81b4-29e162613627', 'Cash', 'cash');
insert into public.categories (id, user_id, name, icon, kind, is_system) values
  ('72000000-0000-4000-a000-000000000001', '23000c90-c136-43d2-81b4-29e162613627', 'Fotografi', 'photo_camera', 'expense', false);

-- ---------------------------------------------------------------------------
-- transactions
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ insert into public.transactions (user_id, wallet_id, category_id, type, amount, occurred_at, note, idempotency_key)
     values ('23000c90-c136-43d2-81b4-29e162613627', '71000000-0000-4000-a000-000000000001',
             '72000000-0000-4000-a000-000000000001', 'expense', 25000, now(), 'kopi pagi',
             '74000000-0000-4000-a000-000000000001') $$,
  'transactions: baris valid tersimpan');

select throws_ok(
  $$ insert into public.transactions (user_id, wallet_id, category_id, type, amount, occurred_at, idempotency_key)
     values ('23000c90-c136-43d2-81b4-29e162613627', '71000000-0000-4000-a000-000000000001',
             '72000000-0000-4000-a000-000000000001', 'expense', 0, now(),
             '74000000-0000-4000-a000-000000000002') $$,
  '23514',
  null,
  'transactions: amount = 0 ditolak (check amount > 0)');

select throws_ok(
  $$ insert into public.transactions (user_id, wallet_id, category_id, type, amount, occurred_at, idempotency_key)
     values ('23000c90-c136-43d2-81b4-29e162613627', '71000000-0000-4000-a000-000000000001',
             '72000000-0000-4000-a000-000000000001', 'expense', -100, now(),
             '74000000-0000-4000-a000-000000000003') $$,
  '23514',
  null,
  'transactions: amount negatif ditolak (check amount > 0)');

select throws_ok(
  $$ insert into public.transactions (user_id, wallet_id, category_id, type, amount, occurred_at, note, idempotency_key)
     values ('23000c90-c136-43d2-81b4-29e162613627', '71000000-0000-4000-a000-000000000001',
             '72000000-0000-4000-a000-000000000001', 'expense', 1000, now(), repeat('x', 201),
             '74000000-0000-4000-a000-000000000004') $$,
  '23514',
  null,
  'transactions: note 201 char ditolak (check char_length <= 200)');

select lives_ok(
  $$ insert into public.transactions (user_id, wallet_id, category_id, type, amount, occurred_at, note, idempotency_key)
     values ('23000c90-c136-43d2-81b4-29e162613627', '71000000-0000-4000-a000-000000000001',
             '72000000-0000-4000-a000-000000000001', 'expense', 1000, now(), repeat('x', 200),
             '74000000-0000-4000-a000-000000000005') $$,
  'transactions: note 200 char diterima (boundary)');

select throws_ok(
  $$ insert into public.transactions (user_id, wallet_id, category_id, type, amount, occurred_at, idempotency_key)
     values ('23000c90-c136-43d2-81b4-29e162613627', '71000000-0000-4000-a000-000000000001',
             '72000000-0000-4000-a000-000000000001', 'expense', 1000, now(),
             '74000000-0000-4000-a000-000000000001') $$,
  '23505',
  null,
  'transactions: idempotency_key duplikat untuk user sama ditolak');

select throws_ok(
  $$ insert into public.transactions (user_id, wallet_id, category_id, type, amount, occurred_at, idempotency_key)
     values ('23000c90-c136-43d2-81b4-29e162613627', '71000000-0000-4000-a000-000000000001',
             '72000000-0000-4000-a000-000000000001', 'refund', 1000, now(),
             '74000000-0000-4000-a000-000000000006') $$,
  '23514',
  null,
  'transactions: type di luar income/expense/transfer ditolak');

-- ---------------------------------------------------------------------------
-- wallets
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.wallets (user_id, name, type)
     values ('23000c90-c136-43d2-81b4-29e162613627', 'Cash', 'bank') $$,
  '23505',
  null,
  'wallets: name duplikat untuk user sama ditolak');

select throws_ok(
  $$ insert into public.wallets (user_id, name, type)
     values ('23000c90-c136-43d2-81b4-29e162613627', 'Dompet', 'crypto') $$,
  '23514',
  null,
  'wallets: type di luar bank/ewallet/cash/card ditolak');

-- ---------------------------------------------------------------------------
-- categories
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.categories (user_id, name, icon, kind)
     values ('23000c90-c136-43d2-81b4-29e162613627', 'Fotografi', 'photo_camera', 'expense') $$,
  '23505',
  null,
  'categories: (user_id, name, kind) duplikat ditolak');

select lives_ok(
  $$ insert into public.categories (user_id, name, icon, kind)
     values ('23000c90-c136-43d2-81b4-29e162613627', 'Fotografi', 'photo_camera', 'income') $$,
  'categories: nama sama dengan kind berbeda diterima');

select throws_ok(
  $$ insert into public.categories (user_id, name, icon, kind, is_system)
     values ('23000c90-c136-43d2-81b4-29e162613627', 'Palsu', 'star', 'expense', true) $$,
  '23514',
  null,
  'categories: kategori milik user tidak boleh ditandai is_system');

-- ---------------------------------------------------------------------------
-- budgets
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ insert into public.budgets (user_id, category_id, month, amount_limit)
     values ('23000c90-c136-43d2-81b4-29e162613627', '72000000-0000-4000-a000-000000000001', '2026-09-01', 1000000) $$,
  'budgets: baris valid tersimpan');

select throws_ok(
  $$ insert into public.budgets (user_id, category_id, month, amount_limit)
     values ('23000c90-c136-43d2-81b4-29e162613627', '72000000-0000-4000-a000-000000000001', '2026-09-01', 2000000) $$,
  '23505',
  null,
  'budgets: unique(user_id, category_id, month) ditegakkan');

select throws_ok(
  $$ insert into public.budgets (user_id, category_id, month, amount_limit)
     values ('23000c90-c136-43d2-81b4-29e162613627', '72000000-0000-4000-a000-000000000001', '2026-09-15', 500) $$,
  '23514',
  null,
  'budgets: month bukan hari-1 ditolak');

-- ---------------------------------------------------------------------------
-- budget_alerts
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ insert into public.budget_alerts (user_id, category_id, month, threshold)
     values ('23000c90-c136-43d2-81b4-29e162613627', '72000000-0000-4000-a000-000000000001', '2026-09-01', 'warning_80') $$,
  'budget_alerts: baris valid tersimpan');

select throws_ok(
  $$ insert into public.budget_alerts (user_id, category_id, month, threshold)
     values ('23000c90-c136-43d2-81b4-29e162613627', '72000000-0000-4000-a000-000000000001', '2026-09-01', 'warning_80') $$,
  '23505',
  null,
  'budget_alerts: unique(user_id, category_id, month, threshold) ditegakkan (dedup)');

-- Kunci dedup per-user: user lain pada kategori/bulan/threshold sama tetap bisa
-- menyimpan alert-nya sendiri (PRD §6.1 R1). Kategori sistem dipakai bersama karena
-- categories.user_id boleh null.
insert into public.categories (id, user_id, name, icon, kind, is_system) values
  ('72000000-0000-4000-a000-0000000000ff', null, 'Sistem Uji', 'science', 'expense', true);

select lives_ok(
  $$ insert into public.budget_alerts (user_id, category_id, month, threshold)
     values ('23000c90-c136-43d2-81b4-29e162613627', '72000000-0000-4000-a000-0000000000ff', '2026-09-01', 'warning_80') $$,
  'budget_alerts: user pertama bisa menyimpan alert untuk kategori sistem');

insert into auth.users (id, email) values
  ('5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b', 'bob@test.com');

select lives_ok(
  $$ insert into public.budget_alerts (user_id, category_id, month, threshold)
     values ('5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b', '72000000-0000-4000-a000-0000000000ff', '2026-09-01', 'warning_80') $$,
  'budget_alerts: user kedua tetap dapat alert pada kategori sistem yang sama (dedup per-user)');

select throws_ok(
  $$ insert into public.budget_alerts (user_id, category_id, month, threshold)
     values ('23000c90-c136-43d2-81b4-29e162613627', '72000000-0000-4000-a000-000000000001', '2026-09-01', 'warning_80') $$,
  '23505',
  null,
  'budget_alerts: unique(category_id, month, threshold) ditegakkan (dedup)');

select throws_ok(
  $$ insert into public.budget_alerts (user_id, category_id, month, threshold)
     values ('23000c90-c136-43d2-81b4-29e162613627', '72000000-0000-4000-a000-000000000001', '2026-09-01', 'warning_50') $$,
  '23514',
  null,
  'budget_alerts: threshold di luar warning_80/exceeded_100 ditolak');

-- ---------------------------------------------------------------------------
-- index performa (spec: (user_id, occurred_at desc) & (user_id, category_id, occurred_at))
-- ---------------------------------------------------------------------------

select ok(
  exists (
    select 1 from pg_catalog.pg_class i
    join pg_catalog.pg_index ix on ix.indexrelid = i.oid
    where i.relname = 'transactions_user_occurred_idx'
      and (select array_agg(at.attname::text order by k.ord)
           from unnest(ix.indkey::int[]) with ordinality as k(attnum, ord)
           join pg_catalog.pg_attribute at on at.attrelid = ix.indrelid and at.attnum = k.attnum)
          = array['user_id', 'occurred_at']::text[]
  ),
  'index transactions (user_id, occurred_at) tersedia');

select ok(
  exists (
    select 1 from pg_catalog.pg_class i
    join pg_catalog.pg_index ix on ix.indexrelid = i.oid
    where i.relname = 'transactions_user_category_occurred_idx'
      and (select array_agg(at.attname::text order by k.ord)
           from unnest(ix.indkey::int[]) with ordinality as k(attnum, ord)
           join pg_catalog.pg_attribute at on at.attrelid = ix.indrelid and at.attnum = k.attnum)
          = array['user_id', 'category_id', 'occurred_at']::text[]
  ),
  'index transactions (user_id, category_id, occurred_at) tersedia');

select ok(
  exists (
    select 1 from pg_catalog.pg_class i
    join pg_catalog.pg_index ix on ix.indexrelid = i.oid
    where i.relname = 'categories_system_name_kind_idx'
      and ix.indpred is not null
  ),
  'index unik kategori sistem dengan predikat tersedia');

select * from finish();
rollback;
