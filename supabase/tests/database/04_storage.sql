-- T2 — pgTAP: bucket avatar privat + policy hanya path milik user sendiri.
-- Path objek: {user_id}/avatar.png (policy membaca elemen pertama lewat
-- storage.foldername(name)).
--
-- Catatan portabilitas (ditemukan saat verifikasi remote):
--  * `path_tokens` adalah generated column → jangan diisi manual saat insert.
--  * Update objek milik user lain: RLS yang menolak (`using` tidak match) → tak ada
--    baris berubah; UPDATE ... RETURNING mengembalikan hasil kosong.
--  * DELETE objek milik user lain: RLS lolos dulu sehingga trigger
--    `storage.protect_delete()` (instance hosted) yang melempar 42501 — bukan
--    policy. Keduanya sama-sama membuktikan akses ditolak; test mengunci kode
--    errornya agar tidak lolos diam-diam.

-- Helper (schema `tests`, extension pgTAP) dibuat oleh 00_setup.sql yang
-- dijalankan pgTAP lebih dulu secara alfabetis; DDL-nya persisten.
set role postgres;
set search_path = public, extensions;

begin;
select plan(10);

insert into auth.users (id, email) values
  ('23000c90-c136-43d2-81b4-29e162613627', 'alice@test.com'),
  ('5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b', 'bob@test.com');

-- ---------------------------------------------------------------------------
-- Bucket avatars: privat, 2MB, PNG/JPG
-- ---------------------------------------------------------------------------

select is(
  (select public from storage.buckets where id = 'avatars'),
  false,
  'storage: bucket avatars privat (tidak public)');

select is(
  (select file_size_limit from storage.buckets where id = 'avatars'),
  2097152::bigint,
  'storage: bucket avatars membatasi file 2MB');

select ok(
  (select allowed_mime_types from storage.buckets where id = 'avatars')
    @> array['image/png', 'image/jpeg']::text[],
  'storage: bucket avatars menerima PNG/JPG');

select isnt_empty(
  $$ select 1 from pg_catalog.pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname = 'avatars_select_own' $$,
  'storage: policy select avatar milik sendiri terpasang');

-- ---------------------------------------------------------------------------
-- Policy: user hanya bisa akses path miliknya sendiri
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '23000c90-c136-43d2-81b4-29e162613627';

select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner, version, metadata)
     values ('avatars', '23000c90-c136-43d2-81b4-29e162613627/avatar.png',
             '23000c90-c136-43d2-81b4-29e162613627', '1', '{"size":1}'::jsonb) $$,
  'storage: alice bisa upload avatar di path miliknya');

select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner, version, metadata)
     values ('avatars', '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b/avatar.png',
             '23000c90-c136-43d2-81b4-29e162613627', '1', '{"size":1}'::jsonb) $$,
  '42501',
  null,
  'storage: alice tidak bisa upload avatar ke path bob');

select results_eq(
  $$ update storage.objects set version = '2'
     where bucket_id = 'avatars' and name like '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b/%' returning 1 $$,
  array[]::integer[],
  'storage: alice tidak bisa update objek di path bob (tak ada baris berubah)');

select throws_ok(
  $$ delete from storage.objects
     where bucket_id = 'avatars' and name like '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b/%' returning 1 $$,
  '42501',
  null,
  'storage: alice tidak bisa delete objek di path bob (ditolak)');

-- Kontrol: objek milik bob ada, dan tidak terlihat oleh alice.
-- `reset role` mengembalikan role ke session user (bukan postgres), jadi role
-- owner + search_path di-set ulang eksplisit (RESET ROLE memulihkan GUC).
reset role;
set role postgres;
set search_path = public, extensions;

insert into storage.objects (bucket_id, name, owner, version, metadata)
values ('avatars', '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b/avatar.png',
        '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b', '1', '{"size":1}'::jsonb);

select is(
  (select count(*)::int from storage.objects
   where bucket_id = 'avatars' and name like '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b/%'),
  1,
  'storage: objek bob ada di bucket (kontrol setup)');

set local role authenticated;
set local request.jwt.claim.sub = '23000c90-c136-43d2-81b4-29e162613627';

select is_empty(
  $$ select 1 from storage.objects
     where bucket_id = 'avatars' and name = '5b12b708-39b4-4b1f-93cf-8a4ac33a0e8b/avatar.png' $$,
  'storage: alice tidak bisa melihat avatar bob');

select * from finish();
rollback;
