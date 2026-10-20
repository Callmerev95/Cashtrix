-- L4b — pgTAP: `analytics_wallet_compare` (bandingkan 2–4 dompet).
--
-- Cermin konvensi `10_analytics.sql`/`19_category_series.sql`: fixture masa
-- lalu (bukan now()), alice WIB + bob UTC, scoping per-user lewat role
-- `authenticated` (security invoker), anon ditolak via has_function_privilege.
-- Tiap file rollback sendiri; UUID fixture memakai prefix da/db/dc/dd.
--
-- Skenario angka (alice, Sep 2026 WIB):
--   BCA      expense 350k (250k + 100k), income 5jt;  prev: 200k / 4jt
--   Cash     expense 150k,                 income 0;    prev: 0    / 500k
--   Tabungan tanpa transaksi (baris nol tetap ada)
--   Arsip    expense 50k, diarsipkan -> TIDAK jadi baris, tapi ikut
--            denominator share (= total KPI 550k)
--   soft-deleted 999k diabaikan sepenuhnya

set role postgres;
set search_path = public, extensions;

begin;
select plan(28);

insert into auth.users (id, email) values
  ('7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 't20-alice@test.com'),
  ('8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', 't20-bob@test.com');

insert into public.wallets (id, user_id, name, type, opening_balance, archived_at) values
  ('da000000-0000-4000-a000-000000000001', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 'BCA', 'bank', 0, null),
  ('da000000-0000-4000-a000-000000000002', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 'Cash', 'cash', 0, null),
  ('da000000-0000-4000-a000-000000000003', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 'Tabungan', 'bank', 0, null),
  ('da000000-0000-4000-a000-000000000004', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d', 'Arsip', 'bank', 0, now()),
  ('da000000-0000-4000-a000-000000000005', '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e', 'Bob Bank', 'bank', 0, null);

insert into public.categories (id, user_id, name, icon, kind, is_system) values
  ('db000000-0000-4000-b000-000000000001', null, 'Makan S20', 'restaurant', 'expense', true),
  ('db000000-0000-4000-b000-000000000002', null, 'Gaji S20', 'payments', 'income', true);

-- Semua fixture masa lalu (trigger V2 menolak occurred_at masa depan).
insert into public.transactions
  (id, user_id, wallet_id, category_id, type, amount, occurred_at, idempotency_key, deleted_at) values
  ('dc000000-0000-4000-c000-000000000001', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'da000000-0000-4000-a000-000000000001', 'db000000-0000-4000-b000-000000000001',
   'expense', 250000, '2026-09-05T12:00:00+07:00', 'dd000000-0000-4000-d000-000000000001', null),
  ('dc000000-0000-4000-c000-000000000002', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'da000000-0000-4000-a000-000000000001', 'db000000-0000-4000-b000-000000000001',
   'expense', 100000, '2026-09-07T08:00:00+07:00', 'dd000000-0000-4000-d000-000000000002', null),
  ('dc000000-0000-4000-c000-000000000003', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'da000000-0000-4000-a000-000000000001', 'db000000-0000-4000-b000-000000000002',
   'income', 5000000, '2026-09-01T09:00:00+07:00', 'dd000000-0000-4000-d000-000000000003', null),
  ('dc000000-0000-4000-c000-000000000004', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'da000000-0000-4000-a000-000000000002', 'db000000-0000-4000-b000-000000000001',
   'expense', 150000, '2026-09-06T12:00:00+07:00', 'dd000000-0000-4000-d000-000000000004', null),
  ('dc000000-0000-4000-c000-000000000005', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'da000000-0000-4000-a000-000000000004', 'db000000-0000-4000-b000-000000000001',
   'expense', 50000, '2026-09-08T12:00:00+07:00', 'dd000000-0000-4000-d000-000000000005', null),
  ('dc000000-0000-4000-c000-000000000006', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'da000000-0000-4000-a000-000000000001', 'db000000-0000-4000-b000-000000000001',
   'expense', 999000, '2026-09-09T12:00:00+07:00', 'dd000000-0000-4000-d000-000000000006', now()),
  ('dc000000-0000-4000-c000-000000000007', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'da000000-0000-4000-a000-000000000001', 'db000000-0000-4000-b000-000000000001',
   'expense', 200000, '2026-08-10T12:00:00+07:00', 'dd000000-0000-4000-d000-000000000007', null),
  ('dc000000-0000-4000-c000-000000000008', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'da000000-0000-4000-a000-000000000001', 'db000000-0000-4000-b000-000000000002',
   'income', 4000000, '2026-08-11T09:00:00+07:00', 'dd000000-0000-4000-d000-000000000008', null),
  ('dc000000-0000-4000-c000-000000000009', '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
   'da000000-0000-4000-a000-000000000002', 'db000000-0000-4000-b000-000000000002',
   'income', 500000, '2026-08-12T12:00:00+07:00', 'dd000000-0000-4000-d000-000000000009', null),
  ('dc000000-0000-4000-c000-000000000010', '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e',
   'da000000-0000-4000-a000-000000000005', 'db000000-0000-4000-b000-000000000001',
   'expense', 1000000, '2026-09-15T12:00:00+00:00', 'dd000000-0000-4000-d000-000000000010', null);

-- ---------------------------------------------------------------------------
-- Payload alice (Asia/Jakarta), jendela Sep 2026 + prev Agu 2026.
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

create temp table cmp as
  select public.analytics_wallet_compare(
    '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z',
    '2026-07-31T17:00:00Z', '2026-08-31T17:00:00Z',
    'Asia/Jakarta', true
  ) as payload;

create temp table cmp_monthly as
  select public.analytics_wallet_compare(
    '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z',
    '2026-07-31T17:00:00Z', '2026-08-31T17:00:00Z',
    'Asia/Jakarta', false
  ) as payload;

create temp table cmp_rows as
  select w->>'wallet_id' as wallet_id, w
  from cmp, jsonb_array_elements(cmp.payload->'wallets') w;

select is(
  jsonb_array_length((select payload from cmp)->'wallets'),
  3,
  'analytics_wallet_compare: hanya dompet aktif (Arsip tidak jadi baris)');

select is(
  ((select payload from cmp)->'totals'->>'expense')::numeric,
  550000::numeric,
  'analytics_wallet_compare: denominator share memuat dompet terarsip (350k+150k+50k)');

select is(
  ((select payload from cmp)->'totals'->>'income')::numeric,
  5000000::numeric,
  'analytics_wallet_compare: total income = 5jt (tanpa baris arsip)');

select is(
  (select (w->'totals'->>'expense')::numeric from cmp_rows
   where wallet_id = 'da000000-0000-4000-a000-000000000001'),
  350000::numeric,
  'analytics_wallet_compare: BCA expense = 250k+100k (soft-deleted 999k diabaikan)');

select is(
  (select (w->'totals'->>'income')::numeric from cmp_rows
   where wallet_id = 'da000000-0000-4000-a000-000000000001'),
  5000000::numeric,
  'analytics_wallet_compare: BCA income = 5jt');

select is(
  (select (w->'totals'->>'expense')::numeric from cmp_rows
   where wallet_id = 'da000000-0000-4000-a000-000000000002'),
  150000::numeric,
  'analytics_wallet_compare: Cash expense = 150k');

select is(
  (select (w->'totals'->>'expense')::numeric from cmp_rows
   where wallet_id = 'da000000-0000-4000-a000-000000000003'),
  0::numeric,
  'analytics_wallet_compare: dompet tanpa transaksi tetap muncul sebagai baris nol');

select is(
  (select (w->'previous'->>'expense')::numeric from cmp_rows
   where wallet_id = 'da000000-0000-4000-a000-000000000001'),
  200000::numeric,
  'analytics_wallet_compare: previous BCA = 200k (jendela prev)');

select is(
  (select (w->'delta'->>'expense')::numeric from cmp_rows
   where wallet_id = 'da000000-0000-4000-a000-000000000001'),
  75::numeric,
  'analytics_wallet_compare: delta expense BCA = +75%');

select is(
  (select w->'delta'->>'expense' from cmp_rows
   where wallet_id = 'da000000-0000-4000-a000-000000000002'),
  null::text,
  'analytics_wallet_compare: delta expense Cash = null (prev nol, bukan Infinity)');

select is(
  (select (w->'delta'->>'income')::numeric from cmp_rows
   where wallet_id = 'da000000-0000-4000-a000-000000000001'),
  25::numeric,
  'analytics_wallet_compare: delta income BCA = +25%');

select is(
  (select (w->'delta'->>'income')::numeric from cmp_rows
   where wallet_id = 'da000000-0000-4000-a000-000000000002'),
  (-100)::numeric,
  'analytics_wallet_compare: delta income Cash = -100% (turun ke nol)');

select is(
  (select round((w->'share'->>'expense')::numeric, 4) from cmp_rows
   where wallet_id = 'da000000-0000-4000-a000-000000000001'),
  0.6364::numeric,
  'analytics_wallet_compare: share expense BCA = 350k/550k');

select is(
  (select round((w->'share'->>'expense')::numeric, 4) from cmp_rows
   where wallet_id = 'da000000-0000-4000-a000-000000000002'),
  0.2727::numeric,
  'analytics_wallet_compare: share expense Cash = 150k/550k');

select is(
  (select (w->'share'->>'income')::numeric from cmp_rows
   where wallet_id = 'da000000-0000-4000-a000-000000000001'),
  1::numeric,
  'analytics_wallet_compare: share income BCA = 1 (satu-satunya pemasukan)');

select is(
  (select (w->'share'->>'expense')::numeric from cmp_rows
   where wallet_id = 'da000000-0000-4000-a000-000000000003'),
  0::numeric,
  'analytics_wallet_compare: share dompet nol = 0 (bukan null)');

select is(
  (select payload->'wallets'->0->>'wallet_id' from cmp),
  'da000000-0000-4000-a000-000000000001',
  'analytics_wallet_compare: urutan default expense desc -> BCA pertama');

select is(
  (select payload->'wallets'->1->>'wallet_id' from cmp),
  'da000000-0000-4000-a000-000000000002',
  'analytics_wallet_compare: urutan kedua = Cash');

select is(
  (select count(*)::int from jsonb_array_elements((select payload from cmp)->'wallets') w
   where w->>'wallet_id' = 'da000000-0000-4000-a000-000000000004'),
  0,
  'analytics_wallet_compare: dompet diarsipkan tidak pernah jadi baris');

select is(
  jsonb_array_length(
    (select w->'series' from cmp_rows
     where wallet_id = 'da000000-0000-4000-a000-000000000001')),
  3,
  'analytics_wallet_compare: series BCA harian = 3 bucket berdata (1 Sep income, 5/7 Sep expense)');

select is(
  (select (s->>'total_expense')::numeric
   from cmp_rows, jsonb_array_elements(cmp_rows.w->'series') s
   where wallet_id = 'da000000-0000-4000-a000-000000000001'
     and s->>'bucket' = '2026-09-05'),
  250000::numeric,
  'analytics_wallet_compare: bucket 5 Sep BCA = 250k');

select is(
  (select (s->>'total_income')::numeric
   from cmp_rows, jsonb_array_elements(cmp_rows.w->'series') s
   where wallet_id = 'da000000-0000-4000-a000-000000000001'
     and s->>'bucket' = '2026-09-01'),
  5000000::numeric,
  'analytics_wallet_compare: bucket 1 Sep BCA membawa income 5jt');

select is(
  (select (s->>'total_income')::numeric
   from cmp_rows, jsonb_array_elements(cmp_rows.w->'series') s
   where wallet_id = 'da000000-0000-4000-a000-000000000002'),
  0::numeric,
  'analytics_wallet_compare: deret Cash tidak mencampur income (0 di bucket expense-nya)');

select is(
  (select s->>'bucket'
   from cmp_monthly, jsonb_array_elements(cmp_monthly.payload->'wallets') w,
        jsonb_array_elements(w->'series') s
   where w->>'wallet_id' = 'da000000-0000-4000-a000-000000000001'),
  '2026-09-01',
  'analytics_wallet_compare: mode bulanan -> satu bucket 2026-09-01');

-- ---------------------------------------------------------------------------
-- Isolasi per-user (bob) + hak fungsi.
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = '8b2c3d4e-5f6a-4b7c-8d9e-0f1a2b3c4d5e';

create temp table cmp_bob as
  select public.analytics_wallet_compare(
    '2026-08-31T17:00:00Z', '2026-09-30T17:00:00Z',
    '2026-07-31T17:00:00Z', '2026-08-31T17:00:00Z',
    'UTC', true
  ) as payload;

select is(
  jsonb_array_length((select payload from cmp_bob)->'wallets'),
  1,
  'analytics_wallet_compare: bob hanya melihat dompetnya sendiri');

select is(
  ((select payload from cmp_bob)->'totals'->>'expense')::numeric,
  1000000::numeric,
  'analytics_wallet_compare: agregat alice tidak bocor ke bob');

reset role;
set role postgres;
set search_path = public, extensions;

select ok(
  has_function_privilege('authenticated',
    'public.analytics_wallet_compare(timestamptz, timestamptz, timestamptz, timestamptz, text, boolean)',
    'execute'),
  'analytics_wallet_compare: authenticated punya hak execute');

select ok(
  not has_function_privilege('anon',
    'public.analytics_wallet_compare(timestamptz, timestamptz, timestamptz, timestamptz, text, boolean)',
    'execute'),
  'analytics_wallet_compare: anon ditolak');

select * from finish();
rollback;
