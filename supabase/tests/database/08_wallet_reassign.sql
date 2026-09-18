-- T4 (#5) — pgTAP: `reassign_wallet_transactions(from, to)`.
--
-- Menguji perilaku eksternal yang dijanjikan AC #5: transaksi berpindah wallet
-- dalam satu operasi (atomic), termasuk yang soft-deleted, tanpa bisa
-- menyentuh wallet/transaksi user lain.

set role postgres;
set search_path = public, extensions;

begin;
select plan(15);

-- ---------------------------------------------------------------------------
-- Data uji: alice punya wallet asal (berisi 2 transaksi hidup + 1 soft-deleted)
-- dan wallet tujuan; bob punya wallet & transaksi sendiri sebagai kontrol.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('3a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 't4r-alice@test.com'),
  ('4b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', 't4r-bob@test.com');

insert into public.wallets (id, user_id, name, type, opening_balance) values
  ('9a000000-0000-4000-a000-000000000001', '3a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 'Asal', 'bank', 0),
  ('9a000000-0000-4000-a000-000000000002', '3a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 'Tujuan', 'cash', 0),
  ('9a000000-0000-4000-a000-000000000003', '3a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 'Kosong', 'ewallet', 0),
  ('9a000000-0000-4000-a000-000000000004', '4b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', 'Bob', 'bank', 0);

insert into public.categories (id, user_id, name, icon, kind, is_system) values
  ('9b000000-0000-4000-a000-000000000001', null, 'Makan T4R', 'restaurant', 'expense', true);

insert into public.transactions
  (id, user_id, wallet_id, category_id, type, amount, occurred_at, idempotency_key, deleted_at) values
  ('9c000000-0000-4000-a000-000000000001', '3a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   '9a000000-0000-4000-a000-000000000001', '9b000000-0000-4000-a000-000000000001',
   'expense', 100000, '2026-08-01T09:00:00+07:00', '9d000000-0000-4000-a000-000000000001', null),
  ('9c000000-0000-4000-a000-000000000002', '3a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   '9a000000-0000-4000-a000-000000000001', '9b000000-0000-4000-a000-000000000001',
   'expense', 250000, '2026-08-02T09:00:00+07:00', '9d000000-0000-4000-a000-000000000002', null),
  ('9c000000-0000-4000-a000-000000000003', '3a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   '9a000000-0000-4000-a000-000000000001', '9b000000-0000-4000-a000-000000000001',
   'expense', 400000, '2026-08-03T09:00:00+07:00', '9d000000-0000-4000-a000-000000000003',
   '2026-08-04T09:00:00+07:00'),
  ('9c000000-0000-4000-a000-000000000004', '4b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
   '9a000000-0000-4000-a000-000000000004', '9b000000-0000-4000-a000-000000000001',
   'expense', 990000, '2026-08-05T09:00:00+07:00', '9d000000-0000-4000-a000-000000000004', null);

-- ---------------------------------------------------------------------------
-- Happy path (sebagai alice, lewat RLS)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '3a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

select is(
  public.reassign_wallet_transactions(
    '9a000000-0000-4000-a000-000000000001', '9a000000-0000-4000-a000-000000000002'),
  3,
  'reassign: 3 baris terpindah (2 hidup + 1 soft-deleted)');

select is(
  (select count(*)::int from public.transactions
    where wallet_id = '9a000000-0000-4000-a000-000000000002'
      and user_id = '3a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d'),
  3,
  'reassign: semua transaksi kini menunjuk wallet tujuan');

select is(
  (select count(*)::int from public.transactions
    where wallet_id = '9a000000-0000-4000-a000-000000000001'),
  0,
  'reassign: wallet asal kosong');

select is(
  (select balance from public.v_wallet_balances
    where wallet_id = '9a000000-0000-4000-a000-000000000002'),
  (-350000.00)::numeric,
  'reassign: saldo wallet tujuan menyerap expense hidup (soft-deleted tidak dihitung)');

select is(
  (select transaction_count from public.v_wallet_balances
    where wallet_id = '9a000000-0000-4000-a000-000000000002'),
  2::bigint,
  'reassign: transaction_count menghitung 2 transaksi hidup (soft-deleted tidak)');

select ok(
  (select deleted_at is not null from public.transactions
    where id = '9c000000-0000-4000-a000-000000000003'),
  'reassign: transaksi soft-deleted tetap soft-deleted setelah pindah');

-- Baris milik bob tidak terlihat oleh alice lewat RLS, jadi kontrol silang-user
-- harus diperiksa sebagai postgres (RLS di-bypass) — bukan sebagai alice.
reset role;
set local role postgres;
set local search_path = public, extensions;

select is(
  (select count(*)::int from public.transactions
    where id = '9c000000-0000-4000-a000-000000000004'
      and wallet_id = '9a000000-0000-4000-a000-000000000004'),
  1,
  'reassign: transaksi bob tidak tersentuh');

-- Kembali sebagai alice untuk blok validasi argumen.
set local role authenticated;
set local request.jwt.claim.sub = '3a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

-- ---------------------------------------------------------------------------
-- Validasi argumen
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select public.reassign_wallet_transactions(
       '9a000000-0000-4000-a000-000000000002', '9a000000-0000-4000-a000-000000000002') $$,
  '22023',
  'wallet tujuan harus berbeda dari wallet asal',
  'reassign: wallet asal = tujuan ditolak (22023)');

select throws_ok(
  $$ select public.reassign_wallet_transactions(null, '9a000000-0000-4000-a000-000000000002') $$,
  '22023',
  'wallet asal dan tujuan wajib diisi',
  'reassign: argumen null ditolak (22023)');

select throws_ok(
  $$ select public.reassign_wallet_transactions(
       '00000000-0000-4000-a000-000000000000', '9a000000-0000-4000-a000-000000000002') $$,
  'P0002',
  'wallet asal tidak ditemukan',
  'reassign: wallet asal tidak ada / bukan milik user → P0002');

select throws_ok(
  $$ select public.reassign_wallet_transactions(
       '9a000000-0000-4000-a000-000000000001', '9a000000-0000-4000-a000-000000000004') $$,
  'P0002',
  'wallet tujuan tidak ditemukan',
  'reassign: wallet tujuan milik user lain → P0002 (RLS + cek kepemilikan)');

-- Kontrol silang-user lagi: baris bob hanya terlihat sebagai postgres.
reset role;
set local role postgres;
set local search_path = public, extensions;

select is(
  (select count(*)::int from public.transactions
    where id = '9c000000-0000-4000-a000-000000000004'
      and wallet_id = '9a000000-0000-4000-a000-000000000004'),
  1,
  'reassign: percobaan menyeberang user tidak mengubah data bob');

-- Kembali sebagai alice: sisa test memanggil RPC yang butuh identitas alice.
set local role authenticated;
set local request.jwt.claim.sub = '3a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

-- wallet tanpa transaksi: 0 baris terpindah, bukan error
select is(
  public.reassign_wallet_transactions(
    '9a000000-0000-4000-a000-000000000003', '9a000000-0000-4000-a000-000000000002'),
  0,
  'reassign: wallet asal tanpa transaksi → 0 baris, tetap sukses');

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------

reset role;
set role postgres;
set search_path = public, extensions;

select ok(
  not has_function_privilege('anon', 'public.reassign_wallet_transactions(uuid,uuid)', 'execute'),
  'reassign: anon tidak punya hak execute');

select ok(
  has_function_privilege('authenticated', 'public.reassign_wallet_transactions(uuid,uuid)', 'execute'),
  'reassign: authenticated punya hak execute');

select * from finish();
rollback;
