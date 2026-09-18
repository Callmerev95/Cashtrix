-- T4 (#5) — pgTAP: `v_wallet_balances` benar secara aritmetika DAN tidak
-- membocorkan saldo wallet user lain.
--
-- Kuncinya `security_invoker = true` pada view. Tanpa itu view dibaca sebagai
-- owner (postgres) sehingga RLS ter-bypass — suite ini akan gagal di blok
-- "isolasi antar-user" dan menangkap regresi itu.

set role postgres;
set search_path = public, extensions;

begin;
select plan(15);

-- ---------------------------------------------------------------------------
-- Data uji: alice punya 2 wallet (satu dengan campuran income/expense/soft-deleted),
-- bob punya 1 wallet dengan saldo besar — harus tak terlihat oleh alice.
-- Tanggal ditulis eksplisit (bukan now()) supaya aritmetika tidak bergantung
-- pada bulan berjalan.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('2f4c4b34-06bc-4d5e-9c2b-2c2c3a4b5c6d', 't4-alice@test.com'),
  ('7a8b9c0d-1e2f-4a5b-8c9d-0e1f2a3b4c5d', 't4-bob@test.com');

insert into public.wallets (id, user_id, name, type, opening_balance) values
  ('8a000000-0000-4000-a000-000000000001', '2f4c4b34-06bc-4d5e-9c2b-2c2c3a4b5c6d', 'BCA',  'bank', 1000000),
  ('8a000000-0000-4000-a000-000000000002', '2f4c4b34-06bc-4d5e-9c2b-2c2c3a4b5c6d', 'Cash', 'cash', 50000),
  ('8a000000-0000-4000-a000-000000000003', '7a8b9c0d-1e2f-4a5b-8c9d-0e1f2a3b4c5d', 'Bob Bank', 'bank', 9000000);

insert into public.categories (id, user_id, name, icon, kind, is_system) values
  ('8b000000-0000-4000-a000-000000000001', null, 'Gaji T4', 'payments', 'income', true),
  ('8b000000-0000-4000-a000-000000000002', null, 'Makan T4', 'restaurant', 'expense', true);

-- alice/Bca: opening 1.000.000 + income 500.000 - expense 250.000 = 1.250.000
-- alice/Cash: opening 50.000 + 0 - 20.000 = 30.000
-- satu expense soft-deleted tidak boleh dihitung
insert into public.transactions
  (id, user_id, wallet_id, category_id, type, amount, occurred_at, idempotency_key, deleted_at) values
  ('8c000000-0000-4000-a000-000000000001', '2f4c4b34-06bc-4d5e-9c2b-2c2c3a4b5c6d',
   '8a000000-0000-4000-a000-000000000001', '8b000000-0000-4000-a000-000000000001',
   'income', 500000, '2026-08-10T10:00:00+07:00', '8d000000-0000-4000-a000-000000000001', null),
  ('8c000000-0000-4000-a000-000000000002', '2f4c4b34-06bc-4d5e-9c2b-2c2c3a4b5c6d',
   '8a000000-0000-4000-a000-000000000001', '8b000000-0000-4000-a000-000000000002',
   'expense', 250000, '2026-08-11T12:00:00+07:00', '8d000000-0000-4000-a000-000000000002', null),
  ('8c000000-0000-4000-a000-000000000003', '2f4c4b34-06bc-4d5e-9c2b-2c2c3a4b5c6d',
   '8a000000-0000-4000-a000-000000000001', '8b000000-0000-4000-a000-000000000002',
   'expense', 999000, '2026-08-12T12:00:00+07:00', '8d000000-0000-4000-a000-000000000003',
   '2026-08-13T12:00:00+07:00'),
  ('8c000000-0000-4000-a000-000000000004', '2f4c4b34-06bc-4d5e-9c2b-2c2c3a4b5c6d',
   '8a000000-0000-4000-a000-000000000002', '8b000000-0000-4000-a000-000000000002',
   'expense', 20000, '2026-08-14T09:00:00+07:00', '8d000000-0000-4000-a000-000000000004', null),
  ('8c000000-0000-4000-a000-000000000005', '7a8b9c0d-1e2f-4a5b-8c9d-0e1f2a3b4c5d',
   '8a000000-0000-4000-a000-000000000003', '8b000000-0000-4000-a000-000000000002',
   'expense', 1000000, '2026-08-15T09:00:00+07:00', '8d000000-0000-4000-a000-000000000005', null);

-- ---------------------------------------------------------------------------
-- Aritmetika saldo (sebagai postgres, tanpa RLS)
-- ---------------------------------------------------------------------------

select is(
  (select balance from public.v_wallet_balances where wallet_id = '8a000000-0000-4000-a000-000000000001'),
  1250000.00::numeric,
  'v_wallet_balances: opening + income − expense (expense soft-deleted dikecualikan)');

select is(
  (select balance from public.v_wallet_balances where wallet_id = '8a000000-0000-4000-a000-000000000002'),
  30000.00::numeric,
  'v_wallet_balances: wallet kedua ikut terhitung terpisah');

select is(
  (select transaction_count from public.v_wallet_balances where wallet_id = '8a000000-0000-4000-a000-000000000001'),
  2::bigint,
  'v_wallet_balances: transaction_count hanya menghitung transaksi hidup');

select is(
  (select balance from public.v_wallet_balances where wallet_id = '8a000000-0000-4000-a000-000000000003'),
  8000000.00::numeric,
  'v_wallet_balances: bob = 9.000.000 − 1.000.000');

-- wallet tanpa transaksi tetap muncul dengan saldo = opening_balance
insert into public.wallets (id, user_id, name, type, opening_balance) values
  ('8a000000-0000-4000-a000-000000000004', '2f4c4b34-06bc-4d5e-9c2b-2c2c3a4b5c6d', 'Kosong', 'ewallet', 0);

select is(
  (select balance from public.v_wallet_balances where wallet_id = '8a000000-0000-4000-a000-000000000004'),
  0.00::numeric,
  'v_wallet_balances: wallet tanpa transaksi tetap muncul (left join) dengan saldo opening');

-- SUM view = saldo gabungan Dashboard
select is(
  (select sum(balance) from public.v_wallet_balances
    where user_id = '2f4c4b34-06bc-4d5e-9c2b-2c2c3a4b5c6d'),
  1280000.00::numeric,
  'v_wallet_balances: Σ saldo semua wallet = saldo gabungan');

-- ---------------------------------------------------------------------------
-- Isolasi antar-user: inti `security_invoker`
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '2f4c4b34-06bc-4d5e-9c2b-2c2c3a4b5c6d';

select is(
  (select count(*)::int from public.v_wallet_balances),
  3,
  'v_wallet_balances(alice): hanya melihat 3 wallet miliknya');

select is_empty(
  $$ select 1 from public.v_wallet_balances
      where wallet_id = '8a000000-0000-4000-a000-000000000003' $$,
  'v_wallet_balances(alice): wallet bob tidak terlihat');

select is(
  (select count(*)::int from public.v_wallet_balances
    where user_id = '7a8b9c0d-1e2f-4a5b-8c9d-0e1f2a3b4c5d'),
  0,
  'v_wallet_balances(alice): filter user_id bob juga tidak bocor');

select is(
  (select sum(balance) from public.v_wallet_balances),
  1280000.00::numeric,
  'v_wallet_balances(alice): total gabungan tidak tercemar wallet bob');

-- ---------------------------------------------------------------------------
-- Saldo ikut berubah setelah transaksi baru (bukti tidak ada nilai tersimpan)
-- ---------------------------------------------------------------------------

insert into public.transactions
  (id, user_id, wallet_id, category_id, type, amount, occurred_at, idempotency_key) values
  ('8c000000-0000-4000-a000-000000000006', '2f4c4b34-06bc-4d5e-9c2b-2c2c3a4b5c6d',
   '8a000000-0000-4000-a000-000000000002', '8b000000-0000-4000-a000-000000000002',
   'expense', 30000, '2026-08-16T09:00:00+07:00', '8d000000-0000-4000-a000-000000000006');

select is(
  (select balance from public.v_wallet_balances where wallet_id = '8a000000-0000-4000-a000-000000000002'),
  0.00::numeric,
  'v_wallet_balances(alice): saldo langsung mencerminkan transaksi baru (bukan kolom tersimpan)');

-- ---------------------------------------------------------------------------
-- anon tidak punya akses sama sekali (view + tabel)
-- ---------------------------------------------------------------------------

reset role;
set role postgres;
set search_path = public, extensions;

select ok(
  not has_table_privilege('anon', 'public.v_wallet_balances', 'select'),
  'v_wallet_balances: anon tidak punya hak select');

select ok(
  has_table_privilege('authenticated', 'public.v_wallet_balances', 'select'),
  'v_wallet_balances: authenticated punya hak select');

-- Satu jalur setara: sebagai authenticated, view dan tabel dasar harus
-- memberi angka yang sama (view bukan jalan pintas melampaui RLS).
set local role authenticated;
set local request.jwt.claim.sub = '7a8b9c0d-1e2f-4a5b-8c9d-0e1f2a3b4c5d';

select is(
  (select count(*)::int from public.v_wallet_balances),
  1,
  'v_wallet_balances(bob): hanya melihat 1 wallet miliknya');

select is(
  (select balance from public.v_wallet_balances),
  8000000.00::numeric,
  'v_wallet_balances(bob): saldo wallet-nya sendiri tetap benar');

select * from finish();
rollback;
