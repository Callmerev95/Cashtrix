-- T5 (#6) — pgTAP: riwayat transaksi (view feed), soft-delete/restore, purge
-- retensi 30 hari, dan idempotency `unique(user_id, idempotency_key)`.
--
-- Seam yang diuji adalah perilaku eksternal yang dijanjikan AC #6:
--   * riwayat hanya berisi transaksi hidup, ter-scope ke pemanggil (RLS);
--   * hapus = soft-delete, pulih dalam 30 hari, hard-delete setelahnya;
--   * idempotency key yang sama untuk user yang sama tidak bisa dobel;
--     user lain boleh memakai key yang sama.

set role postgres;
set search_path = public, extensions;

begin;
select plan(28);

-- ---------------------------------------------------------------------------
-- Data uji: alice punya kategori sistem sendiri + 2 wallet, bob 1 wallet.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 't5-alice@test.com'),
  ('6b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', 't5-bob@test.com');

insert into public.wallets (id, user_id, name, type, opening_balance) values
  ('aa000000-0000-4000-a000-000000000001', '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 'BCA', 'bank', 1000000),
  ('aa000000-0000-4000-a000-000000000002', '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 'Cash', 'cash', 0),
  ('aa000000-0000-4000-a000-000000000003', '6b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', 'Bob Bank', 'bank', 0);

insert into public.categories (id, user_id, name, icon, kind, is_system) values
  ('ab000000-0000-4000-a000-000000000001', null, 'Makan T5', 'restaurant', 'expense', true),
  ('ab000000-0000-4000-a000-000000000002', null, 'Gaji T5', 'payments', 'income', true);

-- alice: 2 hidup + 1 soft-deleted (baru) + 1 soft-deleted lama (lewat retensi)
--        + 1 dengan idempotency key yang akan diuji
insert into public.transactions
  (id, user_id, wallet_id, category_id, type, amount, occurred_at, idempotency_key, note, deleted_at) values
  ('ac000000-0000-4000-a000-000000000001', '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'aa000000-0000-4000-a000-000000000001', 'ab000000-0000-4000-a000-000000000001',
   'expense', 50000, '2026-09-10T12:00:00+07:00', 'ad000000-0000-4000-a000-000000000001', 'Kopi', null),
  ('ac000000-0000-4000-a000-000000000002', '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'aa000000-0000-4000-a000-000000000001', 'ab000000-0000-4000-a000-000000000002',
   'income', 7000000, '2026-09-01T09:00:00+07:00', 'ad000000-0000-4000-a000-000000000002', null, null),
  ('ac000000-0000-4000-a000-000000000003', '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'aa000000-0000-4000-a000-000000000002', 'ab000000-0000-4000-a000-000000000001',
   'expense', 20000, '2026-09-05T08:00:00+07:00', 'ad000000-0000-4000-a000-000000000003',
   null, now() - interval '2 days'),
  ('ac000000-0000-4000-a000-000000000004', '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'aa000000-0000-4000-a000-000000000002', 'ab000000-0000-4000-a000-000000000001',
   'expense', 90000, '2026-08-01T08:00:00+07:00', 'ad000000-0000-4000-a000-000000000004',
   null, now() - interval '40 days'),
  ('ac000000-0000-4000-a000-000000000005', '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'aa000000-0000-4000-a000-000000000001', 'ab000000-0000-4000-a000-000000000001',
   'expense', 33000, '2026-09-12T12:00:00+07:00', 'ad000000-0000-4000-a000-000000000005', null, null),
  ('ac000000-0000-4000-a000-000000000006', '6b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
   'aa000000-0000-4000-a000-000000000003', 'ab000000-0000-4000-a000-000000000001',
   'expense', 111000, '2026-09-11T12:00:00+07:00', 'ad000000-0000-4000-a000-000000000006', null, null);

-- ---------------------------------------------------------------------------
-- v_transactions_feed: bentuk + filter hidup (sebagai postgres, tanpa RLS)
-- ---------------------------------------------------------------------------

select is(
  (select count(*)::int from public.v_transactions_feed
    where user_id = '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'),
  3,
  'v_transactions_feed: hanya transaksi hidup alice (soft-deleted dikecualikan)');

select is(
  (select transaction_count from public.v_wallet_balances
    where wallet_id = 'aa000000-0000-4000-a000-000000000001'),
  3::bigint,
  'v_wallet_balances: saldo T4 tetap konsisten (3 hidup di BCA)');

select is(
  (select category_name from public.v_transactions_feed
    where id = 'ac000000-0000-4000-a000-000000000001'),
  'Makan T5',
  'v_transactions_feed: nama kategori ikut ter-render (bukan id)');

select is(
  (select category_icon from public.v_transactions_feed
    where id = 'ac000000-0000-4000-a000-000000000002'),
  'payments',
  'v_transactions_feed: ikon kategori untuk grid/row ikut tersedia');

select is(
  (select wallet_name from public.v_transactions_feed
    where id = 'ac000000-0000-4000-a000-000000000001'),
  'BCA',
  'v_transactions_feed: nama wallet ikut ter-render');

select is(
  (select type from public.v_transactions_feed
    where id = 'ac000000-0000-4000-a000-000000000002'),
  'income',
  'v_transactions_feed: tipe transaksi diekspos apa adanya (arah dari type)');

-- Urutan halaman: occurred_at desc, id desc (tie-break) — mendukung pagination
-- keyset/offset yang stabil.
select is(
  (select array_agg(id order by occurred_at desc, id desc)
     from public.v_transactions_feed
    where user_id = '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'),
  array[
    'ac000000-0000-4000-a000-000000000005'::uuid,
    'ac000000-0000-4000-a000-000000000001'::uuid,
    'ac000000-0000-4000-a000-000000000002'::uuid
  ],
  'v_transactions_feed: urutan occurred_at desc stabil untuk pagination');

-- ---------------------------------------------------------------------------
-- Isolasi antar-user lewat RLS (inti security_invoker)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

select is(
  (select count(*)::int from public.v_transactions_feed),
  3,
  'v_transactions_feed(alice): hanya melihat 3 transaksi hidupnya');

select is_empty(
  $$ select 1 from public.v_transactions_feed
      where id = 'ac000000-0000-4000-a000-000000000006' $$,
  'v_transactions_feed(alice): transaksi bob tidak terlihat');

select is(
  (select count(*)::int from public.v_transactions_feed
    where user_id = '6b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e'),
  0,
  'v_transactions_feed(alice): filter user_id bob juga tidak bocor');

-- ---------------------------------------------------------------------------
-- soft_delete_transaction / restore_transaction (sebagai alice)
-- ---------------------------------------------------------------------------

select is(
  public.soft_delete_transaction('ac000000-0000-4000-a000-000000000001'),
  1,
  'soft_delete: transaksi hidup alice terhapus (1 baris)');

select is(
  (select count(*)::int from public.v_transactions_feed
    where id = 'ac000000-0000-4000-a000-000000000001'),
  0,
  'soft_delete: transaksi hilang dari riwayat');

select is(
  (select deleted_at is not null from public.transactions
    where id = 'ac000000-0000-4000-a000-000000000001'),
  true,
  'soft_delete: baris tetap ada dengan deleted_at terisi (bukan hard delete)');

select is(
  public.soft_delete_transaction('ac000000-0000-4000-a000-000000000001'),
  0,
  'soft_delete: idempoten — hapus ulang tidak mengubah apa pun');

select is(
  public.soft_delete_transaction('ac000000-0000-4000-a000-000000000006'),
  0,
  'soft_delete: transaksi milik user lain tidak bisa dihapus');

select is(
  public.restore_transaction('ac000000-0000-4000-a000-000000000001'),
  1,
  'restore: transaksi kembali dalam jendela retensi');

select is(
  (select count(*)::int from public.v_transactions_feed
    where id = 'ac000000-0000-4000-a000-000000000001'),
  1,
  'restore: transaksi muncul lagi di riwayat');

select is(
  public.restore_transaction('ac000000-0000-4000-a000-000000000001'),
  0,
  'restore: transaksi hidup tidak terpengaruh (idempoten)');

-- ---------------------------------------------------------------------------
-- Idempotency key (constraint T2) — permukaan yang dijanjikan AC #6
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.transactions
       (user_id, wallet_id, category_id, type, amount, occurred_at, idempotency_key)
     values ('5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
             'aa000000-0000-4000-a000-000000000001',
             'ab000000-0000-4000-a000-000000000001',
             'expense', 1000, '2026-09-12T12:00:00+07:00',
             'ad000000-0000-4000-a000-000000000001') $$,
  '23505',
  'duplicate key value violates unique constraint "transactions_user_id_idempotency_key_key"',
  'idempotency: key yang sama untuk user yang sama ditolak (23505)');

-- User lain boleh memakai key yang sama — kuncinya per-user, bukan global.
-- Dilakukan sebagai bob sendiri (RLS akan menolak kalau alice yang menulis).
set local request.jwt.claim.sub = '6b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';

select lives_ok(
  $$ insert into public.transactions
       (user_id, wallet_id, category_id, type, amount, occurred_at, idempotency_key)
     values ('6b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
             'aa000000-0000-4000-a000-000000000003',
             'ab000000-0000-4000-a000-000000000001',
             'expense', 1000, '2026-09-12T12:00:00+07:00',
             'ad000000-0000-4000-a000-000000000001') $$,
  'idempotency: user lain boleh memakai key yang sama (unique per-user)');

-- ---------------------------------------------------------------------------
-- Retensi 30 hari — purge_deleted_transactions
-- ---------------------------------------------------------------------------

reset role;
set role postgres;
set search_path = public, extensions;

-- Dihitung ter-scope ke alice fixture: DB bersama (hosted) menampung
-- soft-delete milik user riil, jadi count global akan goyah oleh data yang
-- bukan milik test ini. Tepat-dua hanya bermakna di dalam scope fixture.
select is(
  (select count(*)::int from public.transactions
    where user_id = '5a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' and deleted_at is not null),
  2,
  'purge: 2 transaksi soft-deleted alice sebelum purge (1 baru, 1 lewat retensi)');

-- Nilai balik purge bersifat global (sebagai postgres ia membersihkan semua
-- user — sama seperti job cron harian), jadi assertion-nya >= 1. Ketepatan
-- "hanya yang lewat retensi" dibuktikan dua test setelahnya per baris.
select cmp_ok(
  public.purge_deleted_transactions(),
  '>=',
  1,
  'purge: minimal 1 baris lewat retensi ter-hard-delete');

select is(
  (select count(*)::int from public.transactions
    where id = 'ac000000-0000-4000-a000-000000000004'),
  0,
  'purge: baris lewat retensi benar-benar hilang');

select is(
  (select count(*)::int from public.transactions
    where id = 'ac000000-0000-4000-a000-000000000003'),
  1,
  'purge: baris dalam jendela retensi tetap ada (bisa dipulihkan)');

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------

select ok(
  not has_table_privilege('anon', 'public.v_transactions_feed', 'select'),
  'v_transactions_feed: anon tidak punya hak select');

select ok(
  has_table_privilege('authenticated', 'public.v_transactions_feed', 'select'),
  'v_transactions_feed: authenticated punya hak select');

select ok(
  not has_function_privilege('anon', 'public.soft_delete_transaction(uuid)', 'execute'),
  'soft_delete: anon tidak punya hak execute');

select ok(
  has_function_privilege('authenticated', 'public.soft_delete_transaction(uuid)', 'execute'),
  'soft_delete: authenticated punya hak execute');

select * from finish();
rollback;
