-- S2 (#56) — pgTAP: bucket `receipts` privat + `transaction_receipts` + purge.
--
-- Seam yang diuji:
--   * bucket privat, 2MB, PNG/JPG + 4 policy `receipts_*_own`;
--   * tabel: `transaction_id` nullable (foto pra-save legal), FK komposit
--     (taut silang-user 23503), RLS 4 policy + anon dicabut;
--   * jalur klien via RLS: pemilik CRUD, update milik orang = no-op sunyi,
--     `user_id` tempaan ditolak 42501;
--   * `purge_expired_receipts()`: baris >30 hari hilang (termasuk yatim),
--     baris segar bertahan; cascade: hapus transaksi → lampiran ikut.
--
-- Catatan: agregat purge dihitung `>= 1` (pola V6) — DB bersama bisa memuat
-- data riil; ketepatan per-baris tetap `is`.

set role postgres;
set search_path = public, extensions;

begin;
select plan(29);

insert into auth.users (id, email) values
  ('a18ce000-0000-4000-a000-000000000001', 's2-alice@test.com'),
  ('b18b0000-0000-4000-a000-000000000002', 's2-bob@test.com');

insert into public.wallets (id, user_id, name, type, opening_balance) values
  ('c1800000-0000-4000-a000-000000000001', 'a18ce000-0000-4000-a000-000000000001', 'Dompet S2', 'cash', 1000000),
  ('c1800000-0000-4000-a000-000000000002', 'b18b0000-0000-4000-a000-000000000002', 'Bob S2', 'bank', 0);

insert into public.categories (id, user_id, name, icon, kind, is_system) values
  ('cb180000-0000-4000-a000-000000000001', null, 'Makan S2', 'restaurant', 'expense', true);

-- Semua tanggal fixture masa lalu (trigger no-future V2 menolak masa depan).
insert into public.transactions
  (id, user_id, wallet_id, category_id, type, amount, occurred_at, idempotency_key) values
  ('ce180000-0000-4000-a000-000000000001', 'a18ce000-0000-4000-a000-000000000001',
   'c1800000-0000-4000-a000-000000000001', 'cb180000-0000-4000-a000-000000000001',
   'expense', 30000, '2025-10-01T12:00:00+07:00', 'c5800000-0000-4000-a000-000000000001'),
  ('ce180000-0000-4000-a000-000000000002', 'b18b0000-0000-4000-a000-000000000002',
   'c1800000-0000-4000-a000-000000000002', 'cb180000-0000-4000-a000-000000000001',
   'expense', 50000, '2025-10-01T12:00:00+07:00', 'c5800000-0000-4000-a000-000000000002');

insert into public.transaction_receipts (id, user_id, transaction_id, storage_path, created_at) values
  ('cd180000-0000-4000-a000-000000000001', 'a18ce000-0000-4000-a000-000000000001',
   null, 'a18ce000-0000-4000-a000-000000000001/yatim.jpg', now()),
  ('cd180000-0000-4000-a000-000000000002', 'a18ce000-0000-4000-a000-000000000001',
   null, 'a18ce000-0000-4000-a000-000000000001/tua.jpg', now() - interval '31 days'),
  ('cd180000-0000-4000-a000-000000000003', 'a18ce000-0000-4000-a000-000000000001',
   'ce180000-0000-4000-a000-000000000001', 'a18ce000-0000-4000-a000-000000000001/taut.jpg', now()),
  ('cd180000-0000-4000-a000-000000000004', 'b18b0000-0000-4000-a000-000000000002',
   null, 'b18b0000-0000-4000-a000-000000000002/bob.jpg', now());

-- ---------------------------------------------------------------------------
-- Bucket receipts
-- ---------------------------------------------------------------------------

select is(
  (select public from storage.buckets where id = 'receipts'),
  false,
  'receipts: bucket privat (tidak public)');

select is(
  (select file_size_limit from storage.buckets where id = 'receipts'),
  2097152::bigint,
  'receipts: bucket membatasi file 2MB');

select ok(
  (select allowed_mime_types from storage.buckets where id = 'receipts')
    @> array['image/png', 'image/jpeg']::text[],
  'receipts: bucket menerima PNG/JPG');

-- ---------------------------------------------------------------------------
-- Bentuk tabel
-- ---------------------------------------------------------------------------

select has_table('public', 'transaction_receipts', 'receipts: tabel ada');

select ok(
  (select relrowsecurity from pg_catalog.pg_class
    where relnamespace = 'public'::regnamespace and relname = 'transaction_receipts'),
  'receipts: RLS aktif');

-- pgtap hosted v1.3 tanpa `col_is_nullable` (pelajaran A5): via information_schema.
select ok(
  (select is_nullable = 'YES'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'transaction_receipts'
      and column_name = 'transaction_id'),
  'receipts: transaction_id nullable (foto pra-save legal)');

select is(
  (select count(*)::int from pg_catalog.pg_constraint
    where conrelid = 'public.transaction_receipts'::regclass and contype = 'f'),
  2,
  'receipts: 2 FK (user_id + komposit transaction_id,user_id pola V2)');

select is(
  (select count(*)::int from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'transaction_receipts'),
  4,
  'receipts: 4 policy tabel (deny-by-default + revoke anon)');

select is(
  (select count(*)::int from pg_catalog.pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and policyname like 'receipts\_%\_own'),
  4,
  'receipts: 4 policy storage receipts_*_own');

-- ---------------------------------------------------------------------------
-- Jalur klien via RLS (authenticated sebagai alice)
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ set local role authenticated;
     set local request.jwt.claim.sub = 'a18ce000-0000-4000-a000-000000000001'; $$,
  'sebagai alice untuk CRUD via RLS');

select is(
  (select count(*)::int from public.transaction_receipts),
  3,
  'receipts: alice hanya melihat 3 miliknya (bob tersembunyi)');

select lives_ok(
  $$ insert into public.transaction_receipts (id, user_id, storage_path) values
     ('cd180000-0000-4000-a000-000000000005', 'a18ce000-0000-4000-a000-000000000001',
      'a18ce000-0000-4000-a000-000000000001/baru.jpg') $$,
  'receipts: alice bisa menyimpan foto pra-save (transaction_id NULL)');

select lives_ok(
  $$ update public.transaction_receipts
     set transaction_id = 'ce180000-0000-4000-a000-000000000001'
     where id = 'cd180000-0000-4000-a000-000000000005' $$,
  'receipts: alice bisa menautkan ke transaksinya saat save');

select throws_ok(
  $$ update public.transaction_receipts
     set transaction_id = 'ce180000-0000-4000-a000-000000000002'
     where id = 'cd180000-0000-4000-a000-000000000005' $$,
  '23503', null,
  'receipts: taut ke transaksi bob ditolak FK komposit');

select lives_ok(
  $$ update public.transaction_receipts set storage_path = 'jahat.jpg'
     where id = 'cd180000-0000-4000-a000-000000000004' $$,
  'receipts: update milik bob sebagai alice tidak error (no-op sunyi)');

select lives_ok(
  $$ reset role; set role postgres; set search_path = public, extensions; $$,
  'kembali ke postgres');

select is(
  (select storage_path from public.transaction_receipts
    where id = 'cd180000-0000-4000-a000-000000000004'),
  'b18b0000-0000-4000-a000-000000000002/bob.jpg',
  'receipts: baris bob tak tersentuh (no-op terbukti)');

select throws_ok(
  $$ set local role authenticated;
     set local request.jwt.claim.sub = 'a18ce000-0000-4000-a000-000000000001';
     insert into public.transaction_receipts (user_id, storage_path) values
     ('b18b0000-0000-4000-a000-000000000002', 'palsu.jpg'); $$,
  '42501', null,
  'receipts: user_id tempaan ditolak RLS');

select lives_ok(
  $$ reset role; set role postgres; set search_path = public, extensions;
     set local role authenticated;
     set local request.jwt.claim.sub = 'a18ce000-0000-4000-a000-000000000001';
     delete from public.transaction_receipts
     where id = 'cd180000-0000-4000-a000-000000000005'; $$,
  'receipts: alice bisa menghapus lampirannya (batal pra-save)');

select lives_ok(
  $$ reset role; set role postgres; set search_path = public, extensions; $$,
  'kembali ke postgres');

select is(
  (select count(*)::int from public.transaction_receipts
    where id = 'cd180000-0000-4000-a000-000000000005'),
  0,
  'receipts: baris yang dihapus benar hilang');

-- ---------------------------------------------------------------------------
-- purge_expired_receipts
-- ---------------------------------------------------------------------------

select cmp_ok(
  (select public.purge_expired_receipts()),
  '>=', 1,
  'purge: menghapus >= 1 baris kedaluwarsa');

select ok(
  not exists (select 1 from public.transaction_receipts
              where id = 'cd180000-0000-4000-a000-000000000002'),
  'purge: yatim 31 hari hilang');

select ok(
  exists (select 1 from public.transaction_receipts
          where id = 'cd180000-0000-4000-a000-000000000003'),
  'purge: lampiran tertaut yang segar bertahan');

select ok(
  exists (select 1 from public.transaction_receipts
          where id = 'cd180000-0000-4000-a000-000000000001'),
  'purge: yatim segar bertahan (menunggu ditautkan)');

-- ---------------------------------------------------------------------------
-- Cascade: hapus transaksi → lampiran ikut
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ delete from public.transactions
     where id = 'ce180000-0000-4000-a000-000000000001' $$,
  'cascade: hapus transaksi terhubung');

select is(
  (select count(*)::int from public.transaction_receipts
    where transaction_id = 'ce180000-0000-4000-a000-000000000001'),
  0,
  'cascade: lampiran ikut terhapus (purge transaksi tak macet)');

-- ---------------------------------------------------------------------------
-- Anon tanpa hak
-- ---------------------------------------------------------------------------

select ok(
  not has_table_privilege('anon', 'public.transaction_receipts', 'select'),
  'receipts: anon tidak punya hak select');

select ok(
  not has_table_privilege('anon', 'public.transaction_receipts', 'insert'),
  'receipts: anon tidak punya hak insert');

select ok(
  not has_function_privilege('anon', 'public.purge_expired_receipts()', 'execute'),
  'purge: anon tidak bisa memanggil');

select * from finish();
rollback;
