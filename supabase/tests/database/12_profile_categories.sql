-- T8 (#9) — pgTAP: profil + kategori kustom ("Profile & Settings" tanpa
-- export/delete, itu milik T9).
--
-- Seam yang diuji adalah perilaku eksternal yang dijanjikan AC #9:
--   * nama profil dibatasi 60 char (check constraint), currency tersimpan;
--   * kategori kustom: create/update/delete milik sendiri, unik
--     (user_id, name, kind), nama 1..40 char;
--   * kategori bawaan (user_id null, is_system): tidak bisa di-update/di-delete
--     oleh user (RLS no-op) — arsipnya lewat `category_mutes` per-user;
--   * `category_mutes`: unik (user_id, category_id), RLS antar-user, anon
--     ditolak, cascade saat kategorinya dihapus;
--   * kategori kustom yang punya transaksi tidak bisa dihapus (FK RESTRICT,
--     23503) — UI harus menawarkan arsip.

set role postgres;
set search_path = public, extensions;

begin;
select plan(32);

-- ---------------------------------------------------------------------------
-- Data uji: alice dan bob.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('c80e0000-0000-4000-a000-000000000001', 't8-alice@test.com'),
  ('c80b0000-0000-4000-a000-000000000002', 't8-bob@test.com');

insert into public.wallets (id, user_id, name, type, opening_balance) values
  ('c8a00000-0000-4000-a000-000000000001', 'c80e0000-0000-4000-a000-000000000001', 'Cash', 'cash', 0);

insert into public.categories (id, user_id, name, icon, kind, is_system) values
  ('c8c00000-0000-4000-a000-000000000001', null, 'Makan T8', 'restaurant', 'expense', true),
  ('c8c00000-0000-4000-a000-000000000002', 'c80e0000-0000-4000-a000-000000000001', 'Jajan T8', 'fastfood', 'expense', false),
  ('c8c00000-0000-4000-a000-000000000003', 'c80b0000-0000-4000-a000-000000000002', 'Hobi T8', 'palette', 'expense', false);

-- ---------------------------------------------------------------------------
-- Kategori kustom: unique, batas nama, update/delete milik sendiri
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.categories
    where id = 'c8c00000-0000-4000-a000-000000000002'),
  1,
  'custom: baris milik alice tersimpan');

select throws_ok(
  $$ insert into public.categories (user_id, name, icon, kind, is_system) values
     ('c80e0000-0000-4000-a000-000000000001', 'Jajan T8', 'fastfood', 'expense', false) $$,
  '23505', null,
  'custom: duplikat (user_id, name, kind) ditolak');

select lives_ok(
  $$ insert into public.categories (user_id, name, icon, kind, is_system) values
     ('c80e0000-0000-4000-a000-000000000001', 'Jajan T8', 'trending-up', 'income', false) $$,
  'custom: nama sama beda kind diizinkan');

select throws_ok(
  $$ insert into public.categories (user_id, name, icon, kind, is_system) values
     ('c80e0000-0000-4000-a000-000000000001', 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'category', 'expense', false) $$,
  '23514', null,
  'custom: nama >40 char ditolak');

update public.categories set name = 'Jajan Revisi T8'
  where id = 'c8c00000-0000-4000-a000-000000000002';

select is(
  (select name from public.categories
    where id = 'c8c00000-0000-4000-a000-000000000002'),
  'Jajan Revisi T8',
  'custom: update milik sendiri berhasil');

-- Bob mencoba mengubah kategori alice lewat hak RLS-nya sendiri: no-op.
select lives_ok(
  $$ set local role authenticated;
     set local request.jwt.claim.sub = 'c80b0000-0000-4000-a000-000000000002'; $$,
  'as bob untuk update silang');

select lives_ok(
  $$ update public.categories set name = 'Dibajak'
     where id = 'c8c00000-0000-4000-a000-000000000002' $$,
  'custom: update milik user lain tidak error (no-op RLS)');

select lives_ok(
  $$ reset role; set role postgres; set search_path = public, extensions; $$,
  'kembali ke postgres (1)');

select is(
  (select name from public.categories
    where id = 'c8c00000-0000-4000-a000-000000000002'),
  'Jajan Revisi T8',
  'custom: nama alice tidak berubah oleh bob');

-- ---------------------------------------------------------------------------
-- Kategori bawaan: tidak bisa dihapus/diubah user (RLS no-op)
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ set local role authenticated;
     set local request.jwt.claim.sub = 'c80e0000-0000-4000-a000-000000000001'; $$,
  'as alice untuk operasi sistem');

select lives_ok(
  $$ delete from public.categories
     where id = 'c8c00000-0000-4000-a000-000000000001' $$,
  'sistem: delete tidak error (no-op RLS)');

select is(
  (select count(*)::int from public.categories
    where id = 'c8c00000-0000-4000-a000-000000000001'),
  1,
  'sistem: baris bawaan tetap ada setelah delete');

select lives_ok(
  $$ update public.categories set archived_at = now()
     where id = 'c8c00000-0000-4000-a000-000000000001' $$,
  'sistem: archive via archived_at tidak error (no-op RLS)');

select is(
  (select archived_at from public.categories
    where id = 'c8c00000-0000-4000-a000-000000000001'),
  null,
  'sistem: archived_at tetap null (alasan category_mutes ada)');

select lives_ok(
  $$ reset role; set role postgres; set search_path = public, extensions; $$,
  'kembali ke postgres (2)');

-- ---------------------------------------------------------------------------
-- category_mutes: arsip per-user atas kategori bawaan
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ set local role authenticated;
     set local request.jwt.claim.sub = 'c80e0000-0000-4000-a000-000000000001'; $$,
  'as alice untuk mute');

select lives_ok(
  $$ insert into public.category_mutes (user_id, category_id) values
     ('c80e0000-0000-4000-a000-000000000001', 'c8c00000-0000-4000-a000-000000000001') $$,
  'mutes: alice mem-mute kategori bawaan via RLS');

select is(
  (select count(*)::int from public.category_mutes
    where user_id = 'c80e0000-0000-4000-a000-000000000001'
      and category_id = 'c8c00000-0000-4000-a000-000000000001'),
  1,
  'mutes: baris mute alice tersimpan');

select throws_ok(
  $$ insert into public.category_mutes (user_id, category_id) values
     ('c80e0000-0000-4000-a000-000000000001', 'c8c00000-0000-4000-a000-000000000001') $$,
  '23505', null,
  'mutes: duplikat (user_id, category_id) ditolak');

select lives_ok(
  $$ reset role; set role postgres; set search_path = public, extensions; $$,
  'kembali ke postgres (3)');

-- Bob tidak melihat mute alice (RLS scoping per-user).
select lives_ok(
  $$ set local role authenticated;
     set local request.jwt.claim.sub = 'c80b0000-0000-4000-a000-000000000002'; $$,
  'as bob untuk baca mutes');

select is(
  (select count(*)::int from public.category_mutes),
  0,
  'mutes: bob tidak melihat mute milik alice');

select lives_ok(
  $$ reset role; set role postgres; set search_path = public, extensions; $$,
  'kembali ke postgres (4)');

-- ---------------------------------------------------------------------------
-- Profil: batas nama, currency tersimpan, isolasi antar-user
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ update public.profiles set display_name = repeat('a', 61)
     where id = 'c80e0000-0000-4000-a000-000000000001' $$,
  '23514', null,
  'profil: nama >60 char ditolak');

update public.profiles set display_name = 'Evelyn T8', currency_code = 'USD'
  where id = 'c80e0000-0000-4000-a000-000000000001';

select is(
  (select display_name || '/' || currency_code from public.profiles
    where id = 'c80e0000-0000-4000-a000-000000000001'),
  'Evelyn T8/USD',
  'profil: nama + currency tersimpan');

select lives_ok(
  $$ set local role authenticated;
     set local request.jwt.claim.sub = 'c80b0000-0000-4000-a000-000000000002'; $$,
  'as bob untuk update profil');

select lives_ok(
  $$ update public.profiles set display_name = 'Bob Jahat'
     where id = 'c80e0000-0000-4000-a000-000000000001' $$,
  'profil: update milik user lain tidak error (no-op RLS)');

select lives_ok(
  $$ reset role; set role postgres; set search_path = public, extensions; $$,
  'kembali ke postgres (5)');

select is(
  (select display_name from public.profiles
    where id = 'c80e0000-0000-4000-a000-000000000001'),
  'Evelyn T8',
  'profil: nama alice tidak berubah oleh bob');

-- ---------------------------------------------------------------------------
-- Kategori bertransaksi tidak bisa dihapus (FK RESTRICT → tawarkan arsip)
-- ---------------------------------------------------------------------------

insert into public.transactions
  (user_id, wallet_id, category_id, type, amount, occurred_at, idempotency_key) values
  ('c80e0000-0000-4000-a000-000000000001', 'c8a00000-0000-4000-a000-000000000001',
   'c8c00000-0000-4000-a000-000000000002', 'expense', 50000,
   '2026-09-10T12:00:00+07:00', 'c8e00000-0000-4000-a000-000000000001');

select throws_ok(
  $$ delete from public.categories
     where id = 'c8c00000-0000-4000-a000-000000000002' $$,
  '23503', null,
  'custom: hapus kategori bertransaksi ditolak FK');

-- ---------------------------------------------------------------------------
-- Privileges: authenticated saja, anon dicabut
-- ---------------------------------------------------------------------------

select ok(
  has_table_privilege('authenticated', 'public.category_mutes', 'select')
  and has_table_privilege('authenticated', 'public.category_mutes', 'insert'),
  'mutes: authenticated bisa select+insert');

select ok(
  not has_table_privilege('anon', 'public.category_mutes', 'select')
  and not has_table_privilege('anon', 'public.category_mutes', 'insert'),
  'mutes: anon ditolak');

-- ---------------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------------

delete from public.transactions
  where user_id = 'c80e0000-0000-4000-a000-000000000001';
delete from public.category_mutes
  where user_id in ('c80e0000-0000-4000-a000-000000000001',
                    'c80b0000-0000-4000-a000-000000000002');
delete from public.wallets
  where user_id = 'c80e0000-0000-4000-a000-000000000001';
delete from public.categories
  where user_id in ('c80e0000-0000-4000-a000-000000000001',
                    'c80b0000-0000-4000-a000-000000000002')
     or id = 'c8c00000-0000-4000-a000-000000000001';
delete from auth.users
  where id in ('c80e0000-0000-4000-a000-000000000001',
               'c80b0000-0000-4000-a000-000000000002');

select * from finish();
rollback;
