-- T6 (#7) — pgTAP: analytics ("Financial Intelligence").
--
-- Seam yang diuji adalah perilaku eksternal yang dijanjikan AC #7:
--   * rentang/bulan dihitung di timezone user, bukan UTC (boundary 1 Okt
--     00:30 WIB yang masih September di UTC);
--   * agregat expense/income/net memakai `type`, bukan menjumlah `amount`
--     mentah (PRD 6.1 R4);
--   * donut breakdown = expense per kategori + share;
--   * bar series harian vs bulanan;
--   * delta % vs periode sebelumnya yang sama panjang, null (bukan
--     Infinity/NaN) saat periode sebelumnya kosong;
--   * soft-deleted & transaksi user lain tidak ikut terhitung (security
--     invoker -> RLS berlaku);
--   * anon tidak punya hak.

set role postgres;
set search_path = public, extensions;

begin;
select plan(43);

-- ---------------------------------------------------------------------------
-- Data uji: alice (Asia/Jakarta) dan bob (UTC).
-- Rentang uji tetap (bukan now()) supaya hasil deterministik.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 't6-alice@test.com'),
  ('8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', 't6-bob@test.com');

-- alice: WIB (default). bob: UTC, membuktikan tz profil yang menentukan.
update public.profiles set timezone = 'UTC'
  where id = '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';

insert into public.wallets (id, user_id, name, type, opening_balance) values
  ('ba000000-0000-4000-a000-000000000001', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 'BCA', 'bank', 0),
  ('ba000000-0000-4000-a000-000000000002', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 'Cash', 'cash', 0),
  ('ba000000-0000-4000-a000-000000000003', '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', 'Bob Bank', 'bank', 0);

insert into public.categories (id, user_id, name, icon, kind, is_system) values
  ('bb000000-0000-4000-a000-000000000001', null, 'Makan T6', 'restaurant', 'expense', true),
  ('bb000000-0000-4000-a000-000000000002', null, 'Transport T6', 'directions-car', 'expense', true),
  ('bb000000-0000-4000-a000-000000000003', null, 'Gaji T6', 'payments', 'income', true);

-- Rentang uji: [2026-09-01 00:00 WIB, 2026-10-01 00:00 WIB)
--            = [2026-08-31 17:00 UTC, 2026-09-30 17:00 UTC)
-- Periode sebelumnya: [2026-08-01 00:00 WIB, 2026-09-01 00:00 WIB)
insert into public.transactions
  (id, user_id, wallet_id, category_id, type, amount, occurred_at, idempotency_key, deleted_at) values
  ('bc000000-0000-4000-a000-000000000001', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'ba000000-0000-4000-a000-000000000001', 'bb000000-0000-4000-a000-000000000001',
   'expense', 250000, '2026-09-05T12:00:00+07:00', 'bd000000-0000-4000-a000-000000000001', null),
  ('bc000000-0000-4000-a000-000000000002', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'ba000000-0000-4000-a000-000000000002', 'bb000000-0000-4000-a000-000000000001',
   'expense', 150000, '2026-09-06T12:00:00+07:00', 'bd000000-0000-4000-a000-000000000002', null),
  ('bc000000-0000-4000-a000-000000000003', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'ba000000-0000-4000-a000-000000000001', 'bb000000-0000-4000-a000-000000000002',
   'expense', 100000, '2026-09-07T08:00:00+07:00', 'bd000000-0000-4000-a000-000000000003', null),
  ('bc000000-0000-4000-a000-000000000004', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'ba000000-0000-4000-a000-000000000001', 'bb000000-0000-4000-a000-000000000003',
   'income', 5000000, '2026-09-01T09:00:00+07:00', 'bd000000-0000-4000-a000-000000000004', null),
  ('bc000000-0000-4000-a000-000000000005', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'ba000000-0000-4000-a000-000000000001', 'bb000000-0000-4000-a000-000000000001',
   'expense', 120000, '2026-08-10T12:00:00+07:00', 'bd000000-0000-4000-a000-000000000005', null),
  ('bc000000-0000-4000-a000-000000000006', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'ba000000-0000-4000-a000-000000000001', 'bb000000-0000-4000-a000-000000000001',
   'expense', 80000, '2026-08-20T12:00:00+07:00', 'bd000000-0000-4000-a000-000000000006', null),
  ('bc000000-0000-4000-a000-000000000007', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'ba000000-0000-4000-a000-000000000001', 'bb000000-0000-4000-a000-000000000001',
   'expense', 700000, '2026-10-01T00:30:00+07:00', 'bd000000-0000-4000-a000-000000000007', null),
  ('bc000000-0000-4000-a000-000000000008', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'ba000000-0000-4000-a000-000000000001', 'bb000000-0000-4000-a000-000000000001',
   'expense', 999000, '2026-09-09T12:00:00+07:00', 'bd000000-0000-4000-a000-000000000008', now()),
  ('bc000000-0000-4000-a000-000000000009', '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
   'ba000000-0000-4000-a000-000000000003', 'bb000000-0000-4000-a000-000000000001',
   'expense', 1000000, '2026-09-15T12:00:00+00:00', 'bd000000-0000-4000-a000-000000000009', null);

-- ---------------------------------------------------------------------------
-- current_month(tz) — WIB vs UTC
-- ---------------------------------------------------------------------------

select ok(
  public.current_month('Asia/Jakarta') >= public.current_month('UTC'),
  'current_month: bulan WIB >= bulan UTC (WIB = UTC+7)');

select is(
  public.current_month('Asia/Jakarta'),
  date_trunc('month', (now() at time zone 'Asia/Jakarta'))::date,
  'current_month: sama dengan date_trunc bulan di tz yang diminta');

select is(
  extract(day from public.current_month('Asia/Jakarta'))::int,
  1,
  'current_month: selalu hari-1 bulan');

-- ---------------------------------------------------------------------------
-- v_monthly_summary — agregasi per bulan (tz user) + arah uang
-- ---------------------------------------------------------------------------

select is(
  (select total_expense from public.v_monthly_summary
    where user_id = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' and month = '2026-09-01'),
  500000::numeric,
  'v_monthly_summary: expense Sep = 250k+150k+100k (soft-deleted 999k diabaikan)');

select is(
  (select total_income from public.v_monthly_summary
    where user_id = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' and month = '2026-09-01'),
  5000000::numeric,
  'v_monthly_summary: income Sep = 5.000.000 (pakai type, bukan jumlah amount mentah)');

select is(
  (select net from public.v_monthly_summary
    where user_id = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' and month = '2026-09-01'),
  4500000::numeric,
  'v_monthly_summary: net Sep = income - expense = 4.500.000');

select is(
  (select total_expense from public.v_monthly_summary
    where user_id = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' and month = '2026-08-01'),
  200000::numeric,
  'v_monthly_summary: expense Agu = 120k+80k');

select is(
  (select total_expense from public.v_monthly_summary
    where user_id = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d' and month = '2026-10-01'),
  700000::numeric,
  'v_monthly_summary: 1 Okt 00:30 WIB masuk bulan Okt, bukan Sep (boundary tz)');

select is(
  (select count(*)::int from public.v_monthly_summary
    where user_id = '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e'),
  1,
  'v_monthly_summary: bob punya baris sendiri (tidak bercampur dengan alice)');

-- ---------------------------------------------------------------------------
-- v_category_breakdown / v_analytics_series / analytics_overview
--
-- Fungsi-fungsi ini adalah `security invoker` dan MENGANDALKAN RLS untuk
-- scoping per-user (sama seperti v_wallet_balances / v_transactions_feed).
-- Karena pgTAP berjalan sebagai postgres (RLS di-bypass), blok ini harus
-- berpindah ke role `authenticated` sebagai alice — di situlah janji AC
-- ("hanya transaksi milik pemanggil") benar-benar diuji. Kalau RLS tiba-tiba
-- dilewati (mis. fungsi jadi security definer), blok ini akan menangkapnya.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

select is(
  (select total_expense from public.v_category_breakdown(
     '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z')
    where category_id = 'bb000000-0000-4000-a000-000000000001'),
  400000::numeric,
  'v_category_breakdown: Makan Sep = 400.000 (2 tx)');

select is(
  (select total_expense from public.v_category_breakdown(
     '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z')
    where category_id = 'bb000000-0000-4000-a000-000000000002'),
  100000::numeric,
  'v_category_breakdown: Transport Sep = 100.000');

select is(
  (select transaction_count from public.v_category_breakdown(
     '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z')
    where category_id = 'bb000000-0000-4000-a000-000000000001'),
  2::bigint,
  'v_category_breakdown: Makan Sep = 2 transaksi');

select is(
  (select share from public.v_category_breakdown(
     '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z')
    where category_id = 'bb000000-0000-4000-a000-000000000001'),
  0.8::numeric,
  'v_category_breakdown: share Makan = 400k/500k = 0,8');

select is(
  (select round(sum(b.share), 6) from public.v_category_breakdown(
     '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z') as b),
  1::numeric,
  'v_category_breakdown: jumlah share = 1');

select is(
  (select count(*)::int from public.v_category_breakdown(
     '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z')
    where category_id = 'bb000000-0000-4000-a000-000000000003'),
  0,
  'v_category_breakdown: kategori income tidak muncul di donut expense');

select is(
  (select total_expense from public.v_category_breakdown(
     '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z', 'Asia/Jakarta',
     'ba000000-0000-4000-a000-000000000001')
    where category_id = 'bb000000-0000-4000-a000-000000000001'),
  250000::numeric,
  'v_category_breakdown: filter wallet BCA -> Makan 250k');

select is(
  (select coalesce(sum(b.total_expense), 0) from public.v_category_breakdown(
     '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z', 'Asia/Jakarta',
     'ba000000-0000-4000-a000-000000000001') as b),
  350000::numeric,
  'v_category_breakdown: filter wallet BCA -> total 350k');

select is(
  (select count(*)::int from public.v_category_breakdown(
     '2020-01-01T00:00:00Z', '2020-02-01T00:00:00Z')),
  0,
  'v_category_breakdown: rentang kosong -> 0 baris');

-- ---------------------------------------------------------------------------
-- v_analytics_series — bucket harian vs bulanan
-- ---------------------------------------------------------------------------

-- Harian: Sep (WIB) punya 4 hari berbeda (1 income + 5,6,7 expense).
select is(
  (select count(*)::int from public.v_analytics_series(
     '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z', 'Asia/Jakarta', null, true)),
  4,
  'v_analytics_series: harian Sep -> 4 bucket (1 income, 5,6,7 expense)');

select is(
  (select total_expense from public.v_analytics_series(
     '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z', 'Asia/Jakarta', null, true)
    where bucket = '2026-09-05'),
  250000::numeric,
  'v_analytics_series: bucket 5 Sep = 250k');

-- 1 Okt 00:30 WIB (17:30 UTC 30 Sep) TIDAK boleh muncul di bucket 30 Sep;
-- ia milik bucket 1 Okt (di luar rentang uji ini).
select is(
  (select count(*)::int from public.v_analytics_series(
     '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z', 'Asia/Jakarta', null, true)
    where bucket = '2026-09-30'),
  0,
  'v_analytics_series: transaksi 1 Okt 00:30 WIB tidak jatuh di bucket 30 Sep (tz)');

select is(
  (select total_expense from public.v_analytics_series(
     '2026-08-01T00:00:00Z', '2026-10-01T00:00:00Z', 'Asia/Jakarta', null, false)
    where bucket = '2026-09-01'),
  500000::numeric,
  'v_analytics_series: bulanan Sep = 500k (expense)');

select is(
  (select total_income from public.v_analytics_series(
     '2026-08-01T00:00:00Z', '2026-10-01T00:00:00Z', 'Asia/Jakarta', null, false)
    where bucket = '2026-09-01'),
  5000000::numeric,
  'v_analytics_series: bulanan Sep = 5.000.000 (income)');

select is(
  (select net from public.v_analytics_series(
     '2026-08-01T00:00:00Z', '2026-10-01T00:00:00Z', 'Asia/Jakarta', null, false)
    where bucket = '2026-09-01'),
  4500000::numeric,
  'v_analytics_series: bulanan Sep net = 4.500.000');

-- ---------------------------------------------------------------------------
-- analytics_overview — totals + delta + breakdown + series (satu payload)
-- ---------------------------------------------------------------------------

-- Rentang Sep, periode sebelumnya Agu.
select is(
  (public.analytics_overview(
     '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z',
     '2026-07-31T17:00:00Z', '2026-08-31T17:00:00Z',
     'Asia/Jakarta', null, true)
   #>> '{totals,expense}')::numeric,
  500000::numeric,
  'analytics_overview: totals.expense Sep = 500k');

select is(
  (public.analytics_overview(
     '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z',
     '2026-07-31T17:00:00Z', '2026-08-31T17:00:00Z',
     'Asia/Jakarta', null, true)
   #>> '{totals,income}')::numeric,
  5000000::numeric,
  'analytics_overview: totals.income Sep = 5.000.000');

select is(
  (public.analytics_overview(
     '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z',
     '2026-07-31T17:00:00Z', '2026-08-31T17:00:00Z',
     'Asia/Jakarta', null, true)
   #>> '{totals,net}')::numeric,
  4500000::numeric,
  'analytics_overview: totals.net Sep = 4.500.000');

-- delta expense = (500k - 200k) / 200k * 100 = 150
select is(
  round((public.analytics_overview(
     '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z',
     '2026-07-31T17:00:00Z', '2026-08-31T17:00:00Z',
     'Asia/Jakarta', null, true)
   #>> '{delta,expense}')::numeric, 6),
  150::numeric,
  'analytics_overview: delta expense = +150% (500k vs 200k)');

select is(
  (public.analytics_overview(
     '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z',
     '2026-07-31T17:00:00Z', '2026-08-31T17:00:00Z',
     'Asia/Jakarta', null, true)
   #>> '{delta,income}'),
  null::text,
  'analytics_overview: delta income null saat periode sebelumnya 0 (bukan Infinity)');

select is(
  jsonb_array_length(public.analytics_overview(
     '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z',
     '2026-07-31T17:00:00Z', '2026-08-31T17:00:00Z',
     'Asia/Jakarta', null, true) #> '{breakdown}'),
  2,
  'analytics_overview: breakdown Sep = 2 kategori (Makan, Transport)');

select is(
  jsonb_array_length(public.analytics_overview(
     '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z',
     '2026-07-31T17:00:00Z', '2026-08-31T17:00:00Z',
     'Asia/Jakarta', null, true) #> '{series}'),
  4,
  'analytics_overview: series harian Sep = 4 bucket');

-- Rentang kosong: totals 0, delta null, breakdown & series kosong (bukan NaN).
select is(
  (public.analytics_overview(
     '2020-01-01T00:00:00Z', '2020-02-01T00:00:00Z',
     '2019-12-01T00:00:00Z', '2020-01-01T00:00:00Z',
     'Asia/Jakarta', null, true)
   #>> '{totals,expense}')::numeric,
  0::numeric,
  'analytics_overview: rentang kosong -> totals.expense 0 (bukan NaN/Infinity)');

select is(
  (public.analytics_overview(
     '2020-01-01T00:00:00Z', '2020-02-01T00:00:00Z',
     '2019-12-01T00:00:00Z', '2020-01-01T00:00:00Z',
     'Asia/Jakarta', null, true)
   #>> '{delta,expense}'),
  null::text,
  'analytics_overview: rentang kosong -> delta null');

select is(
  jsonb_array_length(public.analytics_overview(
     '2020-01-01T00:00:00Z', '2020-02-01T00:00:00Z',
     '2019-12-01T00:00:00Z', '2020-01-01T00:00:00Z',
     'Asia/Jakarta', null, true) #> '{breakdown}'),
  0,
  'analytics_overview: rentang kosong -> breakdown [] (bukan error)');

-- ---------------------------------------------------------------------------
-- RLS: sebagai authenticated, agregat hanya melihat baris milik pemanggil
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';

-- bob (UTC) hanya melihat expense-nya sendiri (1.000.000), bukan alice.
select is(
  (public.analytics_overview(
     '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z',
     '2026-07-31T17:00:00Z', '2026-08-31T17:00:00Z',
     'UTC', null, true)
   #>> '{totals,expense}')::numeric,
  1000000::numeric,
  'analytics_overview: sebagai bob, expense hanya milik bob (RLS via security invoker)');

select is(
  (select count(*)::int from public.v_category_breakdown(
     '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z')),
  1,
  'v_category_breakdown: sebagai bob -> 1 kategori (miliknya), bukan kategori alice');

select is(
  (select count(*)::int from public.v_monthly_summary),
  1,
  'v_monthly_summary: sebagai bob -> 1 baris (miliknya)');

-- ---------------------------------------------------------------------------
-- Hak akses
-- ---------------------------------------------------------------------------

reset role;
set role postgres;
set search_path = public, extensions;

select ok(
  has_function_privilege('authenticated', 'public.current_month(text)', 'execute'),
  'current_month: authenticated punya hak execute');

select ok(
  not has_function_privilege('anon', 'public.current_month(text)', 'execute'),
  'current_month: anon tidak punya hak execute');

select ok(
  has_function_privilege('authenticated',
    'public.analytics_overview(timestamptz, timestamptz, timestamptz, timestamptz, text, uuid, boolean)',
    'execute'),
  'analytics_overview: authenticated punya hak execute');

select ok(
  not has_function_privilege('anon',
    'public.analytics_overview(timestamptz, timestamptz, timestamptz, timestamptz, text, uuid, boolean)',
    'execute'),
  'analytics_overview: anon tidak punya hak execute');

select ok(
  not has_table_privilege('anon', 'public.v_monthly_summary', 'select'),
  'v_monthly_summary: anon tidak punya hak select');

select ok(
  has_table_privilege('authenticated', 'public.v_monthly_summary', 'select'),
  'v_monthly_summary: authenticated punya hak select');

select * from finish();
rollback;
