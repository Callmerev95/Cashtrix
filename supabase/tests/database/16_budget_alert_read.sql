-- A5 (#48) — pgTAP: flag dibaca `budget_alerts.read_at` (inbox notifikasi).
--
-- Seam yang diuji:
--   * kolom ada, nullable, default NULL (baris baru = belum dibaca);
--   * tandai dibaca (now()) dan buka kembali (NULL) per baris, threshold
--     tetangga tidak tersentuh;
--   * dedup tidak rusak oleh kolom baru (konflik sama = tetap 1 baris);
--   * jalur klien via RLS: pemilik select/update miliknya, update milik orang
--     = no-op sunyi (0 baris), anon tanpa hak.

set role postgres;
set search_path = public, extensions;

begin;
select plan(16);

insert into auth.users (id, email) values
  ('a16ce000-0000-4000-a000-000000000001', 'a5-alice@test.com'),
  ('b16b0000-0000-4000-a000-000000000002', 'a5-bob@test.com');

insert into public.categories (id, user_id, name, icon, kind, is_system) values
  ('cb160000-0000-4000-a000-000000000001', null, 'Makan A5', 'restaurant', 'expense', true);

insert into public.budget_alerts (id, user_id, category_id, month, threshold) values
  ('ba160000-0000-4000-a000-000000000001', 'a16ce000-0000-4000-a000-000000000001',
   'cb160000-0000-4000-a000-000000000001', '2026-09-01', 'warning_80'),
  ('ba160000-0000-4000-a000-000000000002', 'a16ce000-0000-4000-a000-000000000001',
   'cb160000-0000-4000-a000-000000000001', '2026-09-01', 'exceeded_100'),
  ('ba160000-0000-4000-a000-000000000003', 'b16b0000-0000-4000-a000-000000000002',
   'cb160000-0000-4000-a000-000000000001', '2026-09-01', 'warning_80');

-- ---------------------------------------------------------------------------
-- Bentuk kolom
-- ---------------------------------------------------------------------------

select ok(
  has_column('public', 'budget_alerts', 'read_at'),
  'read_at: kolom ada');

select ok(
  (select is_nullable = 'YES'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'budget_alerts'
      and column_name = 'read_at'),
  'read_at: nullable');

select is(
  (select read_at from public.budget_alerts
    where id = 'ba160000-0000-4000-a000-000000000001'),
  null,
  'read_at: baris baru default belum dibaca (NULL)');

-- ---------------------------------------------------------------------------
-- Tandai dibaca / buka kembali (jalur klien = UPDATE biasa)
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ update public.budget_alerts set read_at = now()
     where id = 'ba160000-0000-4000-a000-000000000001' $$,
  'read_at: tandai dibaca tersimpan');

select ok(
  (select read_at is not null from public.budget_alerts
    where id = 'ba160000-0000-4000-a000-000000000001'),
  'read_at: baris itu kini terbaca');

select is(
  (select read_at from public.budget_alerts
    where id = 'ba160000-0000-4000-a000-000000000002'),
  null,
  'read_at: threshold tetangga tidak tersentuh');

select lives_ok(
  $$ update public.budget_alerts set read_at = null
     where id = 'ba160000-0000-4000-a000-000000000001' $$,
  'read_at: buka kembali (NULL) tersimpan');

-- ---------------------------------------------------------------------------
-- Dedup tidak rusak oleh kolom baru
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ insert into public.budget_alerts (user_id, category_id, month, threshold) values
     ('a16ce000-0000-4000-a000-000000000001', 'cb160000-0000-4000-a000-000000000001',
      '2026-09-01', 'warning_80')
     on conflict do nothing $$,
  'read_at: konflik dedup tetap no-op');

select is(
  (select count(*)::int from public.budget_alerts
    where user_id = 'a16ce000-0000-4000-a000-000000000001'),
  2,
  'read_at: tetap 2 baris milik alice');

-- ---------------------------------------------------------------------------
-- Jalur klien via RLS (authenticated sebagai alice)
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ set local role authenticated;
     set local request.jwt.claim.sub = 'a16ce000-0000-4000-a000-000000000001'; $$,
  'sebagai alice untuk baca/tandai via RLS');

select is(
  (select count(*)::int from public.budget_alerts),
  2,
  'read_at: alice hanya melihat 2 miliknya (bob tersembunyi)');

select lives_ok(
  $$ update public.budget_alerts set read_at = now()
     where id = 'ba160000-0000-4000-a000-000000000001' $$,
  'read_at: alice bisa menandai miliknya via RLS');

select lives_ok(
  $$ update public.budget_alerts set read_at = now()
     where id = 'ba160000-0000-4000-a000-000000000003' $$,
  'read_at: update milik bob sebagai alice tidak error (no-op sunyi)');

select lives_ok(
  $$ reset role; set role postgres; set search_path = public, extensions; $$,
  'kembali ke postgres');

select is(
  (select read_at from public.budget_alerts
    where id = 'ba160000-0000-4000-a000-000000000003'),
  null,
  'read_at: baris bob tetap belum dibaca (no-op terbukti)');

-- ---------------------------------------------------------------------------
-- Anon tanpa hak
-- ---------------------------------------------------------------------------

select ok(
  not has_table_privilege('anon', 'public.budget_alerts', 'select'),
  'read_at: anon tidak punya hak select');

-- ---------------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------------

delete from public.budget_alerts
  where user_id in ('a16ce000-0000-4000-a000-000000000001',
                    'b16b0000-0000-4000-a000-000000000002');
delete from public.categories
  where id = 'cb160000-0000-4000-a000-000000000001';
delete from auth.users
  where id in ('a16ce000-0000-4000-a000-000000000001',
               'b16b0000-0000-4000-a000-000000000002');

select * from finish();
rollback;
