-- V2 (#31) — pgTAP: transfer satu baris (ADR-0004).
--
-- Seam yang diuji adalah perilaku eksternal yang dijanjikan AC V2:
--   * check bentuk: transfer ↔ category null ↔ counterparty not null,
--     income/expense kebalikannya; sumber ≠ tujuan; future occurred_at ditolak;
--     counterparty wallet orang lain ditolak (FK komposit);
--   * v_wallet_balances: sumber −amount, tujuan +amount, gabungan tidak berubah
--     (soft-deleted dikecualikan), transaction_count menghitung kedua sisi;
--   * v_transactions_feed: satu baris dengan nama wallet tujuan, category null,
--     baris income/expense tidak rusak oleh LEFT JOIN;
--   * analytics/budget/Spent mengabaikan transfer;
--   * reassign memindahkan KEDUA kolom; collapse sumber=tujuan ditolak atomic;
--   * RLS silang-user + hak akses (termasuk re-grant setelah DROP+CREATE view).

set role postgres;
set search_path = public, extensions;

begin;
select plan(42);

-- ---------------------------------------------------------------------------
-- Data uji: alice 3 wallet, bob 2 wallet (transfer butuh dua sisi).
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('c1000000-0000-4000-a000-000000000001', 'tfr-alice@test.com'),
  ('c1000000-0000-4000-a000-000000000002', 'tfr-bob@test.com');

insert into public.wallets (id, user_id, name, type, opening_balance) values
  ('c2000000-0000-4000-a000-000000000001', 'c1000000-0000-4000-a000-000000000001', 'Sumber', 'bank', 1000000),
  ('c2000000-0000-4000-a000-000000000002', 'c1000000-0000-4000-a000-000000000001', 'Tujuan', 'cash', 100000),
  ('c2000000-0000-4000-a000-000000000003', 'c1000000-0000-4000-a000-000000000001', 'Ketiga', 'ewallet', 0),
  ('c2000000-0000-4000-a000-000000000004', 'c1000000-0000-4000-a000-000000000002', 'Bob Satu', 'bank', 5000000),
  ('c2000000-0000-4000-a000-000000000005', 'c1000000-0000-4000-a000-000000000002', 'Bob Dua', 'cash', 0);

insert into public.categories (id, user_id, name, icon, kind, is_system) values
  ('c3000000-0000-4000-a000-000000000001', null, 'Makan TFR', 'restaurant', 'expense', true),
  ('c3000000-0000-4000-a000-000000000002', null, 'Gaji TFR', 'payments', 'income', true);

-- alice: transfer Sumber→Tujuan 250rb (hidup) + 999rb (soft-deleted),
--        transfer Ketiga→Tujuan 10rb (untuk collapse arah kedua),
--        income 500rb + expense 50rb di Sumber.
-- bob: transfer Bob Satu→Bob Dua 100rb.
insert into public.transactions
  (id, user_id, wallet_id, counterparty_wallet_id, category_id, type, amount, occurred_at, idempotency_key, deleted_at) values
  ('c4000000-0000-4000-a000-000000000001', 'c1000000-0000-4000-a000-000000000001',
   'c2000000-0000-4000-a000-000000000001', 'c2000000-0000-4000-a000-000000000002', null,
   'transfer', 250000, '2026-09-10T12:00:00+07:00', 'c5000000-0000-4000-a000-000000000001', null),
  ('c4000000-0000-4000-a000-000000000002', 'c1000000-0000-4000-a000-000000000001',
   'c2000000-0000-4000-a000-000000000001', 'c2000000-0000-4000-a000-000000000002', null,
   'transfer', 999000, '2026-09-11T12:00:00+07:00', 'c5000000-0000-4000-a000-000000000002',
   '2026-09-12T12:00:00+07:00'),
  ('c4000000-0000-4000-a000-000000000006', 'c1000000-0000-4000-a000-000000000001',
   'c2000000-0000-4000-a000-000000000003', 'c2000000-0000-4000-a000-000000000002', null,
   'transfer', 10000, '2026-09-13T12:00:00+07:00', 'c5000000-0000-4000-a000-000000000006', null);

insert into public.transactions
  (id, user_id, wallet_id, category_id, type, amount, occurred_at, idempotency_key) values
  ('c4000000-0000-4000-a000-000000000003', 'c1000000-0000-4000-a000-000000000001',
   'c2000000-0000-4000-a000-000000000001', 'c3000000-0000-4000-a000-000000000002',
   'income', 500000, '2026-09-01T09:00:00+07:00', 'c5000000-0000-4000-a000-000000000003'),
  ('c4000000-0000-4000-a000-000000000004', 'c1000000-0000-4000-a000-000000000001',
   'c2000000-0000-4000-a000-000000000001', 'c3000000-0000-4000-a000-000000000001',
   'expense', 50000, '2026-09-10T08:00:00+07:00', 'c5000000-0000-4000-a000-000000000004'),
  ('c4000000-0000-4000-a000-000000000005', 'c1000000-0000-4000-a000-000000000002',
   'c2000000-0000-4000-a000-000000000004', 'c3000000-0000-4000-a000-000000000001',
   'expense', 100000, '2026-09-11T08:00:00+07:00', 'c5000000-0000-4000-a000-000000000005');

insert into public.transactions
  (id, user_id, wallet_id, counterparty_wallet_id, category_id, type, amount, occurred_at, idempotency_key) values
  ('c4000000-0000-4000-a000-000000000007', 'c1000000-0000-4000-a000-000000000002',
   'c2000000-0000-4000-a000-000000000004', 'c2000000-0000-4000-a000-000000000005', null,
   'transfer', 100000, '2026-09-12T08:00:00+07:00', 'c5000000-0000-4000-a000-000000000007');

-- ---------------------------------------------------------------------------
-- Check bentuk transfer (sebagai postgres, tanpa RLS)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.transactions
       (user_id, wallet_id, counterparty_wallet_id, category_id, type, amount, occurred_at, idempotency_key)
     values ('c1000000-0000-4000-a000-000000000001',
             'c2000000-0000-4000-a000-000000000001', 'c2000000-0000-4000-a000-000000000002',
             'c3000000-0000-4000-a000-000000000001',
             'transfer', 1000, '2026-09-14T12:00:00+07:00',
             'c5000000-0000-4000-a000-000000000011') $$,
  '23514', null,
  'transfer: category terisi ditolak (check transfer_shape)');

select throws_ok(
  $$ insert into public.transactions
       (user_id, wallet_id, type, amount, occurred_at, idempotency_key)
     values ('c1000000-0000-4000-a000-000000000001',
             'c2000000-0000-4000-a000-000000000001',
             'transfer', 1000, '2026-09-14T12:00:00+07:00',
             'c5000000-0000-4000-a000-000000000012') $$,
  '23514', null,
  'transfer: counterparty null ditolak (check transfer_shape)');

select throws_ok(
  $$ insert into public.transactions
       (user_id, wallet_id, counterparty_wallet_id, category_id, type, amount, occurred_at, idempotency_key)
     values ('c1000000-0000-4000-a000-000000000001',
             'c2000000-0000-4000-a000-000000000001', 'c2000000-0000-4000-a000-000000000002',
             'c3000000-0000-4000-a000-000000000002',
             'income', 1000, '2026-09-14T12:00:00+07:00',
             'c5000000-0000-4000-a000-000000000013') $$,
  '23514', null,
  'income: counterparty terisi ditolak (check transfer_shape)');

select throws_ok(
  $$ insert into public.transactions
       (user_id, wallet_id, type, amount, occurred_at, idempotency_key)
     values ('c1000000-0000-4000-a000-000000000001',
             'c2000000-0000-4000-a000-000000000001',
             'income', 1000, '2026-09-14T12:00:00+07:00',
             'c5000000-0000-4000-a000-000000000014') $$,
  '23514', null,
  'income: category null ditolak (check transfer_shape)');

select throws_ok(
  $$ insert into public.transactions
       (user_id, wallet_id, counterparty_wallet_id, type, amount, occurred_at, idempotency_key)
     values ('c1000000-0000-4000-a000-000000000001',
             'c2000000-0000-4000-a000-000000000001', 'c2000000-0000-4000-a000-000000000001',
             'transfer', 1000, '2026-09-14T12:00:00+07:00',
             'c5000000-0000-4000-a000-000000000015') $$,
  '23514', null,
  'transfer: sumber = tujuan ditolak (check wallets_differ)');

select throws_ok(
  $$ insert into public.transactions
       (user_id, wallet_id, category_id, type, amount, occurred_at, idempotency_key)
     values ('c1000000-0000-4000-a000-000000000001',
             'c2000000-0000-4000-a000-000000000001', 'c3000000-0000-4000-a000-000000000001',
             'expense', 1000, now() + interval '2 days',
             'c5000000-0000-4000-a000-000000000016') $$,
  '23514', 'tanggal tidak boleh di masa depan',
  'transaksi: occurred_at masa depan ditolak trigger (23514)');

select throws_ok(
  $$ insert into public.transactions
       (user_id, wallet_id, counterparty_wallet_id, type, amount, occurred_at, idempotency_key)
     values ('c1000000-0000-4000-a000-000000000001',
             'c2000000-0000-4000-a000-000000000001', 'c2000000-0000-4000-a000-000000000004',
             'transfer', 1000, '2026-09-14T12:00:00+07:00',
             'c5000000-0000-4000-a000-000000000017') $$,
  '23503', null,
  'transfer: counterparty wallet orang lain ditolak (FK komposit)');

-- ---------------------------------------------------------------------------
-- v_wallet_balances: sumber −amount, tujuan +amount, gabungan diam
-- ---------------------------------------------------------------------------
-- Sumber = 1.000.000 + 500.000 − 50.000 − 250.000 = 1.200.000
-- Tujuan = 100.000 + 250.000 + 10.000 = 360.000
-- Ketiga = 0 − 10.000 = −10.000
-- Gabungan = 1.550.000 = opening + income − expense (transfer net nol)

select is(
  (select balance from public.v_wallet_balances where wallet_id = 'c2000000-0000-4000-a000-000000000001'),
  1200000.00::numeric,
  'v_wallet_balances: sumber berkurang sebesar transfer');

select is(
  (select balance from public.v_wallet_balances where wallet_id = 'c2000000-0000-4000-a000-000000000002'),
  360000.00::numeric,
  'v_wallet_balances: tujuan bertambah sebesar transfer');

select is(
  (select balance from public.v_wallet_balances where wallet_id = 'c2000000-0000-4000-a000-000000000003'),
  (-10000.00)::numeric,
  'v_wallet_balances: wallet ketiga ikut sebagai sumber transfer kecil');

select is(
  (select sum(balance) from public.v_wallet_balances
    where user_id = 'c1000000-0000-4000-a000-000000000001'),
  1550000.00::numeric,
  'v_wallet_balances: saldo gabungan tidak berubah oleh transfer');

select is(
  (select transaction_count from public.v_wallet_balances where wallet_id = 'c2000000-0000-4000-a000-000000000001'),
  3::bigint,
  'v_wallet_balances: count sumber = 3 hidup (soft-deleted dikecualikan)');

select is(
  (select transaction_count from public.v_wallet_balances where wallet_id = 'c2000000-0000-4000-a000-000000000002'),
  2::bigint,
  'v_wallet_balances: count tujuan = 2 (transfer masuk ikut dihitung)');

select is(
  (select transaction_count from public.v_wallet_balances where wallet_id = 'c2000000-0000-4000-a000-000000000003'),
  1::bigint,
  'v_wallet_balances: count wallet ketiga = 1');

-- ---------------------------------------------------------------------------
-- v_transactions_feed: satu baris transfer
-- ---------------------------------------------------------------------------

select is(
  (select counterparty_wallet_name from public.v_transactions_feed
    where id = 'c4000000-0000-4000-a000-000000000001'),
  'Tujuan',
  'v_transactions_feed: nama wallet tujuan ikut ter-render');

select is(
  (select category_name from public.v_transactions_feed
    where id = 'c4000000-0000-4000-a000-000000000001'),
  null::text,
  'v_transactions_feed: category transfer null (satu baris tanpa kategori)');

select is(
  (select category_name from public.v_transactions_feed
    where id = 'c4000000-0000-4000-a000-000000000003'),
  'Gaji TFR',
  'v_transactions_feed: baris income tidak rusak oleh LEFT JOIN kategori');

select is(
  (select count(*)::int from public.v_transactions_feed
    where user_id = 'c1000000-0000-4000-a000-000000000001'),
  4,
  'v_transactions_feed: 4 baris hidup alice (transfer soft-deleted dikecualikan)');

-- ---------------------------------------------------------------------------
-- Analytics / Spent / Alert mengabaikan transfer
-- ---------------------------------------------------------------------------

select is(
  (select total_expense from public.v_monthly_summary
    where user_id = 'c1000000-0000-4000-a000-000000000001' and month = '2026-09-01'),
  50000.00::numeric,
  'v_monthly_summary: transfer tidak masuk total_expense');

select is(
  (select total_income from public.v_monthly_summary
    where user_id = 'c1000000-0000-4000-a000-000000000001' and month = '2026-09-01'),
  500000.00::numeric,
  'v_monthly_summary: income tetap benar di samping transfer');

-- NOTE: `v_category_breakdown` tidak punya filter user (RLS yang men-scope),
-- jadi sebagai postgres ia melihat SEMUA user di database bersama. Assertion
-- agregatnya ada di blok alice di bawah (ter-scope RLS).

insert into public.budgets (user_id, category_id, month, amount_limit) values
  ('c1000000-0000-4000-a000-000000000001', 'c3000000-0000-4000-a000-000000000001', '2026-09-01', 1000000);

select is(
  (select spent from public.v_budget_status
    where user_id = 'c1000000-0000-4000-a000-000000000001'),
  50000.00::numeric,
  'v_budget_status: Spent tidak bergerak oleh transfer');

-- ---------------------------------------------------------------------------
-- RLS silang-user + reassign collapse (sebagai alice)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-4000-a000-000000000001';

-- Breakdown ter-scope RLS ke alice: 50rb Makan; transfer 250rb + 10rb
-- tidak boleh muncul (dan tidak ada baris tanpa kategori yang bocor).
select is(
  (select sum(total_expense) from public.v_category_breakdown(
    '2026-09-01T00:00:00+07:00', '2026-10-01T00:00:00+07:00', 'Asia/Jakarta', null)),
  50000.00::numeric,
  'v_category_breakdown(alice): Σ expense tanpa transfer');

select is(
  (select count(*)::int from public.v_category_breakdown(
    '2026-09-01T00:00:00+07:00', '2026-10-01T00:00:00+07:00', 'Asia/Jakarta', null)
   where category_name is null),
  0,
  'v_category_breakdown(alice): tidak ada baris tanpa kategori (transfer dikecualikan)');

select is(
  (select count(*)::int from public.v_transactions_feed),
  4,
  'v_transactions_feed(alice): hanya 4 baris hidupnya (transfer bob tak terlihat)');

select is_empty(
  $$ select 1 from public.v_transactions_feed
      where id = 'c4000000-0000-4000-a000-000000000007' $$,
  'v_transactions_feed(alice): transfer bob tidak terlihat');

select throws_ok(
  $$ select public.reassign_wallet_transactions(
       'c2000000-0000-4000-a000-000000000001', 'c2000000-0000-4000-a000-000000000002') $$,
  '23514', 'reassign membuat sumber = tujuan: pilih wallet lain atau hapus transfer dulu',
  'reassign: Sumber→Tujuan yang punya transfer langsung ditolak (collapse)');

select is(
  (select (wallet_id = 'c2000000-0000-4000-a000-000000000001'
           and counterparty_wallet_id = 'c2000000-0000-4000-a000-000000000002')::int
   from public.transactions where id = 'c4000000-0000-4000-a000-000000000001'),
  1,
  'reassign: penolakan collapse atomic — baris transfer tidak berubah');

select throws_ok(
  $$ select public.reassign_wallet_transactions(
       'c2000000-0000-4000-a000-000000000002', 'c2000000-0000-4000-a000-000000000003') $$,
  '23514', 'reassign membuat sumber = tujuan: pilih wallet lain atau hapus transfer dulu',
  'reassign: arah sebaliknya (tujuan→ketiga) ikut collapse via Ketiga→Tujuan');

select is(
  public.reassign_wallet_transactions(
    'c2000000-0000-4000-a000-000000000003', 'c2000000-0000-4000-a000-000000000001'),
  1,
  'reassign: Ketiga→Sumber memindahkan 1 baris (counterparty Tujuan ikut? tidak — Tujuan bukan asal)');

select is(
  (select (wallet_id = 'c2000000-0000-4000-a000-000000000001'
           and counterparty_wallet_id = 'c2000000-0000-4000-a000-000000000002')::int
   from public.transactions where id = 'c4000000-0000-4000-a000-000000000006'),
  1,
  'reassign: transfer Ketiga→Tujuan kini Sumber→Tujuan (wallet_id pindah, counterparty tetap)');

select is(
  (select balance from public.v_wallet_balances where wallet_id = 'c2000000-0000-4000-a000-000000000001'),
  1190000.00::numeric,
  'v_wallet_balances: Sumber turun 10rb setelah menyerap transfer kecil');

select is(
  public.reassign_wallet_transactions(
    'c2000000-0000-4000-a000-000000000002', 'c2000000-0000-4000-a000-000000000003'),
  3,
  'reassign: Tujuan→Ketiga memindahkan 3 counterparty (2 transfer hidup/soft-deleted + 1 kecil)');

select is(
  (select balance from public.v_wallet_balances where wallet_id = 'c2000000-0000-4000-a000-000000000002'),
  100000.00::numeric,
  'v_wallet_balances: Tujuan kembali ke opening setelah counterparty pindah');

select is(
  (select balance from public.v_wallet_balances where wallet_id = 'c2000000-0000-4000-a000-000000000003'),
  260000.00::numeric,
  'v_wallet_balances: Ketiga menerima 250rb + 10rb transfer masuk');

select is(
  (select sum(balance) from public.v_wallet_balances),
  1550000.00::numeric,
  'v_wallet_balances(alice): gabungan tetap setelah dua reassign');

-- ---------------------------------------------------------------------------
-- Hak akses (DROP+CREATE view me-reset grant — migrasi memasangnya ulang)
-- ---------------------------------------------------------------------------

reset role;
set role postgres;
set search_path = public, extensions;

select ok(
  not has_table_privilege('anon', 'public.v_transactions_feed', 'select'),
  'v_transactions_feed: anon tidak punya hak select');

select ok(
  has_table_privilege('authenticated', 'public.v_transactions_feed', 'select'),
  'v_transactions_feed: authenticated punya hak select');

select ok(
  has_table_privilege('authenticated', 'public.v_wallet_balances', 'select'),
  'v_wallet_balances: authenticated punya hak select');

select ok(
  not has_function_privilege('anon', 'public.reassign_wallet_transactions(uuid,uuid)', 'execute'),
  'reassign: anon tidak punya hak execute');

select ok(
  has_function_privilege('authenticated', 'public.reassign_wallet_transactions(uuid,uuid)', 'execute'),
  'reassign: authenticated punya hak execute');

select ok(
  not has_function_privilege('anon', 'public.enforce_transaction_no_future()', 'execute'),
  'no_future guard: anon tidak punya hak execute');

select ok(
  not has_function_privilege('authenticated', 'public.enforce_transaction_no_future()', 'execute'),
  'no_future guard: authenticated tidak punya hak execute langsung');

select * from finish();
rollback;
