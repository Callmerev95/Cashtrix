-- SV1 (#105) — pgTAP: tabel target tabungan (`savings_goals`).
--
-- Seam yang diuji:
--   * bentuk tabel/kolom + nullable yang disengaja (`name`, `target_date`);
--   * satu target per Wallet (`unique(user_id, wallet_id)`);
--   * FK komposit `(wallet_id, user_id)` tidak bisa menunjuk Wallet orang lain;
--   * hapus Wallet yang masih punya target ditolak FK (backstop guard UI);
--   * guard nominal (0/negatif/melebihi batas) dan nama (61 char/kosong);
--   * nama null dan target_date masa lalu tetap legal (target lama diedit);
--   * trigger `updated_at`;
--   * RLS: pemilik select/insert/update/delete, silang-user no-op, anon tanpa
--     hak, cascade saat user dihapus.
--
-- Fixture memakai UUID hex dan tidak bergantung `now()`; semua tanggal target
-- adalah tanggal kalender, bukan occurred_at, jadi trigger no-future V2 tidak
-- terlibat.

set role postgres;
set search_path = public, extensions;

begin;
select plan(29);

insert into auth.users (id, email) values
  ('a2100000-0000-4000-a000-000000000001', 'sv1-alice@test.com'),
  ('b2100000-0000-4000-a000-000000000002', 'sv1-bob@test.com');

insert into public.wallets (id, user_id, name, type, opening_balance) values
  ('da210000-0000-4000-a000-000000000001', 'a2100000-0000-4000-a000-000000000001', 'BCA', 'bank', 0),
  ('da210000-0000-4000-a000-000000000002', 'a2100000-0000-4000-a000-000000000001', 'Cash', 'cash', 0),
  ('da210000-0000-4000-a000-000000000003', 'a2100000-0000-4000-a000-000000000001', 'Temp', 'bank', 0),
  ('da210000-0000-4000-a000-000000000004', 'b2100000-0000-4000-a000-000000000002', 'Bob Bank', 'bank', 0),
  ('da210000-0000-4000-a000-000000000005', 'a2100000-0000-4000-a000-000000000001', 'Check', 'bank', 0),
  ('da210000-0000-4000-a000-000000000006', 'a2100000-0000-4000-a000-000000000001', 'Cross', 'bank', 0);

insert into public.savings_goals
  (id, user_id, wallet_id, name, target_amount, target_date, updated_at) values
  ('ea210000-0000-4000-a000-000000000001', 'a2100000-0000-4000-a000-000000000001',
   'da210000-0000-4000-a000-000000000001', 'Liburan', 10000000, '2027-01-01', now()),
  ('ea210000-0000-4000-a000-000000000002', 'a2100000-0000-4000-a000-000000000001',
   'da210000-0000-4000-a000-000000000002', null, 2000000, null, now()),
  ('ea210000-0000-4000-a000-000000000003', 'a2100000-0000-4000-a000-000000000001',
   'da210000-0000-4000-a000-000000000003', 'Temp', 1000000, '2020-01-01',
   '2020-01-01T00:00:00Z'),
  ('ea210000-0000-4000-a000-000000000004', 'b2100000-0000-4000-a000-000000000002',
   'da210000-0000-4000-a000-000000000004', 'Bob Goal', 5000000, null, now());

-- ---------------------------------------------------------------------------
-- Bentuk tabel
-- ---------------------------------------------------------------------------

select has_table(
  'public', 'savings_goals',
  'savings_goals: tabel ada');

select has_column(
  'public', 'savings_goals', 'target_amount',
  'savings_goals: kolom target_amount ada');

select has_column(
  'public', 'savings_goals', 'target_date',
  'savings_goals: kolom target_date ada');

select is(
  (select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'savings_goals'
      and column_name = 'target_amount'),
  'numeric',
  'savings_goals: target_amount bertipe numeric');

select is(
  (select data_type from information_schema.columns
    where table_schema = 'public' and table_name = 'savings_goals'
      and column_name = 'target_date'),
  'date',
  'savings_goals: target_date bertipe date');

select is(
  (select is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'savings_goals'
      and column_name = 'name'),
  'YES',
  'savings_goals: name opsional');

select is(
  (select is_nullable from information_schema.columns
    where table_schema = 'public' and table_name = 'savings_goals'
      and column_name = 'target_date'),
  'YES',
  'savings_goals: target_date opsional');

-- ---------------------------------------------------------------------------
-- Constraint
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.savings_goals (user_id, wallet_id, target_amount) values
     ('a2100000-0000-4000-a000-000000000001',
      'da210000-0000-4000-a000-000000000001', 1000) $$,
  '23505',
  null,
  'savings_goals: satu Wallet hanya boleh punya satu target');

select throws_ok(
  $$ insert into public.savings_goals (user_id, wallet_id, target_amount) values
     ('a2100000-0000-4000-a000-000000000001',
      'da210000-0000-4000-a000-000000000004', 1000) $$,
  '23503',
  null,
  'savings_goals: FK komposit menolak Wallet milik user lain');

select throws_ok(
  $$ delete from public.wallets where id = 'da210000-0000-4000-a000-000000000003' $$,
  '23503',
  null,
  'savings_goals: hapus Wallet yang masih punya target ditolak FK');

select throws_ok(
  $$ insert into public.savings_goals (user_id, wallet_id, target_amount) values
     ('a2100000-0000-4000-a000-000000000001',
      'da210000-0000-4000-a000-000000000005', 0) $$,
  '23514',
  null,
  'savings_goals: target 0 ditolak');

select throws_ok(
  $$ insert into public.savings_goals (user_id, wallet_id, target_amount) values
     ('a2100000-0000-4000-a000-000000000001',
      'da210000-0000-4000-a000-000000000005', -1000) $$,
  '23514',
  null,
  'savings_goals: target negatif ditolak');

select throws_ok(
  $$ insert into public.savings_goals (user_id, wallet_id, target_amount) values
     ('a2100000-0000-4000-a000-000000000001',
      'da210000-0000-4000-a000-000000000005', 1000000000000) $$,
  '23514',
  null,
  'savings_goals: target di atas 999.999.999.999 ditolak');

select throws_ok(
  $$ insert into public.savings_goals (user_id, wallet_id, name, target_amount) values
     ('a2100000-0000-4000-a000-000000000001',
      'da210000-0000-4000-a000-000000000005', repeat('a', 61), 1000) $$,
  '23514',
  null,
  'savings_goals: nama 61 karakter ditolak');

select throws_ok(
  $$ insert into public.savings_goals (user_id, wallet_id, name, target_amount) values
     ('a2100000-0000-4000-a000-000000000001',
      'da210000-0000-4000-a000-000000000005', '   ', 1000) $$,
  '23514',
  null,
  'savings_goals: nama kosong ditolak');

select lives_ok(
  $$ insert into public.savings_goals (user_id, wallet_id, name, target_amount) values
     ('a2100000-0000-4000-a000-000000000001',
      'da210000-0000-4000-a000-000000000005', null, 1000) $$,
  'savings_goals: nama null legal');

-- Bebaskan Wallet Check setelah uji nama null.
delete from public.savings_goals
  where wallet_id = 'da210000-0000-4000-a000-000000000005';

select is(
  (select target_date from public.savings_goals
    where id = 'ea210000-0000-4000-a000-000000000003'),
  '2020-01-01'::date,
  'savings_goals: target_date masa lalu tetap tersimpan (target lama diedit)');

update public.savings_goals
   set name = 'Temp Updated'
 where id = 'ea210000-0000-4000-a000-000000000003';

select ok(
  (select updated_at > '2020-01-01T00:00:00Z'::timestamptz
     from public.savings_goals
    where id = 'ea210000-0000-4000-a000-000000000003'),
  'savings_goals: trigger updated_at memperbarui timestamp');

-- ---------------------------------------------------------------------------
-- RLS + isolasi per-user
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'a2100000-0000-4000-a000-000000000001';

select is(
  (select count(*)::int from public.savings_goals),
  3,
  'savings_goals: alice hanya melihat 3 target miliknya');

select lives_ok(
  $$ insert into public.savings_goals (user_id, wallet_id, target_amount) values
     ('a2100000-0000-4000-a000-000000000001',
      'da210000-0000-4000-a000-000000000005', 3000000) $$,
  'savings_goals: alice bisa membuat target untuk Wallet miliknya');

select throws_ok(
  $$ insert into public.savings_goals (user_id, wallet_id, target_amount) values
     ('b2100000-0000-4000-a000-000000000002',
      'da210000-0000-4000-a000-000000000006', 1000) $$,
  '42501',
  null,
  'savings_goals: insert dengan user_id orang lain ditolak RLS');

select throws_ok(
  $$ insert into public.savings_goals (user_id, wallet_id, target_amount) values
     ('a2100000-0000-4000-a000-000000000001',
      'da210000-0000-4000-a000-000000000004', 1000) $$,
  '23503',
  null,
  'savings_goals: alice tidak bisa menarget Wallet bob (FK komposit)');

set local request.jwt.claim.sub = 'b2100000-0000-4000-a000-000000000002';

select is(
  (select count(*)::int from public.savings_goals),
  1,
  'savings_goals: bob hanya melihat target miliknya');

select is(
  (select count(*)::int from public.savings_goals
    where id = 'ea210000-0000-4000-a000-000000000001'),
  0,
  'savings_goals: target alice tidak terlihat oleh bob');

with updated as (
  update public.savings_goals set name = 'Hacked'
   where id = 'ea210000-0000-4000-a000-000000000001'
   returning 1
)
select is(
  (select count(*)::int from updated),
  0,
  'savings_goals: update target alice oleh bob no-op');

with deleted as (
  delete from public.savings_goals
   where id = 'ea210000-0000-4000-a000-000000000001'
   returning 1
)
select is(
  (select count(*)::int from deleted),
  0,
  'savings_goals: delete target alice oleh bob no-op');

-- ---------------------------------------------------------------------------
-- Hak anon + hapus Wallet setelah target dilepas
-- ---------------------------------------------------------------------------

reset role;
set role postgres;
set search_path = public, extensions;

select ok(
  not has_table_privilege('anon', 'public.savings_goals', 'select'),
  'savings_goals: anon tidak punya hak select');

select lives_ok(
  $$ delete from public.savings_goals
      where id = 'ea210000-0000-4000-a000-000000000003';
     delete from public.wallets
      where id = 'da210000-0000-4000-a000-000000000003' $$,
  'savings_goals: Wallet bisa dihapus setelah targetnya dilepas');

-- ---------------------------------------------------------------------------
-- Cascade saat user dihapus
-- ---------------------------------------------------------------------------

delete from auth.users
  where id in ('a2100000-0000-4000-a000-000000000001',
               'b2100000-0000-4000-a000-000000000002');

select is(
  (select count(*)::int from public.savings_goals),
  0,
  'savings_goals: target ikut terhapus saat user dihapus (cascade)');

select * from finish();
rollback;
