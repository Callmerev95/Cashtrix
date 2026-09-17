-- T2 — pgTAP: profil dibuat otomatis (trigger handle_new_user) dengan
-- default sesuai PRD: display_name 'Pengguna', currency IDR, timezone
-- Asia/Jakarta, locale id-ID.

-- Helper (schema `tests`, extension pgTAP) dibuat oleh 00_setup.sql yang
-- dijalankan pgTAP lebih dulu secara alfabetis; DDL-nya persisten.
set role postgres;
set search_path = public, extensions;

begin;
select plan(5);

select lives_ok(
  $$ insert into auth.users (id, email) values
     ('91000000-0000-4000-a000-000000000001', 'carol@test.com') $$,
  'auth.users: insert user baru tidak error');

select is(
  (select count(*)::int from public.profiles
   where id = '91000000-0000-4000-a000-000000000001'),
  1,
  'profiles: baris profil dibuat otomatis oleh trigger');

select row_eq(
  $$ select display_name, currency_code, timezone, locale from public.profiles
     where id = '91000000-0000-4000-a000-000000000001' $$,
  row('Pengguna'::text, 'IDR'::char(3), 'Asia/Jakarta'::text, 'id-ID'::text),
  'profiles: default sesuai PRD (nama, IDR, Asia/Jakarta, id-ID)');

select throws_ok(
  $$ insert into public.profiles (id) values ('91000000-0000-4000-a000-000000000001') $$,
  '23505',
  null,
  'profiles: id unik ditegakkan');

select throws_ok(
  $$ insert into public.profiles (id, display_name) values
     ('92000000-0000-4000-a000-000000000001', repeat('x', 61)) $$,
  '23514',
  null,
  'profiles: display_name > 60 char ditolak');

select * from finish();
rollback;
