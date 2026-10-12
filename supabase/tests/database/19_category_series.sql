-- P2b-spark — pgTAP: `v_category_series` (deret expense per kategori).
-- Cache-buster: endpoint query meng-cache string identik (run 3).
--
-- Cermin konvensi `10_analytics.sql`: fixture masa lalu (bukan now()),
-- alice WIB + bob UTC, scoping per-user lewat role `authenticated`
-- (security invoker), anon ditolak. Tiap file rollback sendiri, jadi UUID
-- fixture boleh mengulang pola file lain (prefix cc/cd/ce/cf di sini).

set role postgres;
set search_path = public, extensions;

begin;
select plan(12);

insert into auth.users (id, email) values
  ('7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 't19-alice@test.com'),
  ('8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', 't19-bob@test.com');

insert into public.wallets (id, user_id, name, type, opening_balance) values
  ('cc000000-0000-4000-c000-000000000001', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 'BCA', 'bank', 0),
  ('cc000000-0000-4000-c000-000000000002', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 'Cash', 'cash', 0),
  ('cc000000-0000-4000-c000-000000000003', '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', 'Bob Bank', 'bank', 0);

insert into public.categories (id, user_id, name, icon, kind, is_system) values
  ('cd000000-0000-4000-d000-000000000001', null, 'Makan S19', 'restaurant', 'expense', true),
  ('cd000000-0000-4000-d000-000000000002', null, 'Transport S19', 'directions-car', 'expense', true),
  ('cd000000-0000-4000-d000-000000000003', null, 'Gaji S19', 'payments', 'income', true);

-- Semua fixture masa lalu (trigger V2 menolak occurred_at masa depan).
insert into public.transactions
  (id, user_id, wallet_id, category_id, type, amount, occurred_at, idempotency_key, deleted_at) values
  ('ce000000-0000-4000-e000-000000000001', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'cc000000-0000-4000-c000-000000000001', 'cd000000-0000-4000-d000-000000000001',
   'expense', 250000, '2026-09-05T12:00:00+07:00', 'cf000000-0000-4000-f000-000000000001', null),
  ('ce000000-0000-4000-e000-000000000002', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'cc000000-0000-4000-c000-000000000002', 'cd000000-0000-4000-d000-000000000001',
   'expense', 150000, '2026-09-06T12:00:00+07:00', 'cf000000-0000-4000-f000-000000000002', null),
  ('ce000000-0000-4000-e000-000000000003', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'cc000000-0000-4000-c000-000000000001', 'cd000000-0000-4000-d000-000000000002',
   'expense', 100000, '2026-09-07T08:00:00+07:00', 'cf000000-0000-4000-f000-000000000003', null),
  ('ce000000-0000-4000-e000-000000000004', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'cc000000-0000-4000-c000-000000000001', 'cd000000-0000-4000-d000-000000000003',
   'income', 5000000, '2026-09-01T09:00:00+07:00', 'cf000000-0000-4000-f000-000000000004', null),
  ('ce000000-0000-4000-e000-000000000005', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'cc000000-0000-4000-c000-000000000001', 'cd000000-0000-4000-d000-000000000001',
   'expense', 999000, '2026-09-09T12:00:00+07:00', 'cf000000-0000-4000-f000-000000000005', now()),
  ('ce000000-0000-4000-e000-000000000006', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'cc000000-0000-4000-c000-000000000001', 'cd000000-0000-4000-d000-000000000001',
   'expense', 700000, '2025-10-01T00:30:00+07:00', 'cf000000-0000-4000-f000-000000000006', null),
  ('ce000000-0000-4000-e000-000000000007', '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
   'cc000000-0000-4000-c000-000000000003', 'cd000000-0000-4000-d000-000000000001',
   'expense', 1000000, '2026-09-15T12:00:00+00:00', 'cf000000-0000-4000-f000-000000000007', null);

-- ---------------------------------------------------------------------------
-- Deret harian per kategori (alice, Asia/Jakarta).
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

select is(
  (select count(*)::int from public.v_category_series(
    '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z', 'Asia/Jakarta', null, true)
   where category_id = 'cd000000-0000-4000-d000-000000000001'),
  2,
  'v_category_series: Makan harian Sep -> 2 baris (bucket kosong 7,8 Sep dihilangkan, bukan dinolkan)');

select is(
  (select total_expense from public.v_category_series(
    '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z', 'Asia/Jakarta', null, true)
   where category_id = 'cd000000-0000-4000-d000-000000000001' and bucket = '2026-09-05'),
  250000::numeric,
  'v_category_series: bucket 5 Sep Makan = 250k');

select is(
  (select count(*)::int from public.v_category_series(
    '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z', 'Asia/Jakarta', null, true)
   where category_id = 'cd000000-0000-4000-d000-000000000003'),
  0,
  'v_category_series: kategori income (Gaji) tidak pernah masuk deret expense');

select is(
  (select coalesce(sum(total_expense), 0) from public.v_category_series(
    '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z', 'Asia/Jakarta', null, true)
   where category_id = 'cd000000-0000-4000-d000-000000000001'),
  400000::numeric,
  'v_category_series: Makan Sep = 250k+150k (soft-deleted 999k diabaikan)');

select is(
  (select count(*)::int from public.v_category_series(
    '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z', 'Asia/Jakarta',
    'cc000000-0000-4000-c000-000000000001', true)
   where category_id = 'cd000000-0000-4000-d000-000000000001'),
  1,
  'v_category_series: filter BCA -> Makan tinggal bucket 5 Sep');

select is(
  (select total_expense from public.v_category_series(
    '2025-09-30T17:00:00Z', '2025-10-31T16:00:00Z', 'Asia/Jakarta', null, false)
   where category_id = 'cd000000-0000-4000-d000-000000000001'),
  700000::numeric,
  'v_category_series: 1 Okt 00:30 WIB masuk bucket Okt, bukan Sep (boundary tz)');

-- ---------------------------------------------------------------------------
-- Isolasi per-user (bob) + hak anon.
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';

select is(
  (select count(*)::int from public.v_category_series(
    '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z', 'UTC', null, true)),
  1,
  'v_category_series: bob hanya melihat 1 baris miliknya');

select is(
  (select total_expense from public.v_category_series(
    '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z', 'UTC', null, true)),
  1000000::numeric,
  'v_category_series: baris bob = 1.000.000 (agregat alice tidak bocor)');

reset role;
set role postgres;
set search_path = public, extensions;

select ok(
  has_function_privilege('authenticated', 'public.v_category_series(timestamptz, timestamptz, text, uuid, boolean)', 'execute'),
  'v_category_series: authenticated punya hak execute');

select ok(
  not has_function_privilege('anon', 'public.v_category_series(timestamptz, timestamptz, text, uuid, boolean)', 'execute'),
  'v_category_series: anon ditolak');

-- Hosted DB menampung data riil: agregat sebagai postgres (RLS bypass)
-- WAJIB ter-scope ke set fixture (pelajaran V6) — hitungan global ikut
-- bergerak. Output fungsi per kategori lintas user: Makan S19 menampung
-- alice 400k + bob 1M dalam SATU baris 1,4M.
select is(
  (select count(distinct s.category_id)::int
   from public.v_category_series(
     '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z', 'Asia/Jakarta', null, false) s
   where s.category_id in (
     'cd000000-0000-4000-d000-000000000001',
     'cd000000-0000-4000-d000-000000000002',
     'cd000000-0000-4000-d000-000000000003')),
  2,
  'v_category_series: postgres melihat 2 kategori fixture berdata di Sep (Makan, Transport; Gaji income tak pernah ada)');

select cmp_ok(
  (select total_expense
   from public.v_category_series(
     '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z', 'Asia/Jakarta', null, false)
   where category_id = 'cd000000-0000-4000-d000-000000000001'),
  '>=',
  1400000::numeric,
  'v_category_series: baris Makan menampung alice 400k + bob 1M (>=, data riil tak bisa mengurangi)');

select * from finish();
rollback;
