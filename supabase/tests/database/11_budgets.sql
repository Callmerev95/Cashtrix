-- T7 (#8) — pgTAP: budget + alert dedup ("Budget Architecture").
--
-- Seam yang diuji adalah perilaku eksternal yang dijanjikan AC #8:
--   * budget hanya untuk kategori expense (guard 23514);
--   * satu budget per kategori per bulan (unique, 23505);
--   * `v_budget_status` = spent × percent × state ok/warning/exceeded pada
--     boundary 79.9/80/99.9/100;
--   * spent dihitung di timezone user (boundary 1 Okt 00:30 WIB yang masih
--     30 Sep di UTC — masuk bulan Oktober, bukan September);
--   * soft-deleted & type income tidak ikut spent (PRD §6.1 R4);
--   * bulan baru otomatis kosong tanpa cron (budget Okt tanpa transaksi Sep);
--   * dedup alert per-user: threshold sama dua kali = 1 baris, turun-naik
--     tidak double-fire, threshold beda independen, user lain tidak diblokir
--     (PRD §6.1 R1);
--   * RLS isolation (security invoker → sebagai authenticated hanya milik
--     sendiri) + anon ditolak.

set role postgres;
set search_path = public, extensions;

begin;
select plan(37);

-- ---------------------------------------------------------------------------
-- Data uji: alice (Asia/Jakarta) dan bob (UTC).
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('a11ce000-0000-4000-a000-000000000001', 't7-alice@test.com'),
  ('b0b00000-0000-4000-a000-000000000002', 't7-bob@test.com');

update public.profiles set timezone = 'UTC'
  where id = 'b0b00000-0000-4000-a000-000000000002';

insert into public.wallets (id, user_id, name, type, opening_balance) values
  ('ca000000-0000-4000-a000-000000000001', 'a11ce000-0000-4000-a000-000000000001', 'Cash', 'cash', 0),
  ('ca000000-0000-4000-a000-000000000002', 'b0b00000-0000-4000-a000-000000000002', 'Bob Bank', 'bank', 0);

insert into public.categories (id, user_id, name, icon, kind, is_system) values
  ('cb000000-0000-4000-a000-000000000001', null, 'Makan T7', 'restaurant', 'expense', true),
  ('cb000000-0000-4000-a000-000000000002', null, 'Transport T7', 'directions_car', 'expense', true),
  ('cb000000-0000-4000-a000-000000000003', null, 'Belanja T7', 'shopping_bag', 'expense', true),
  ('cb000000-0000-4000-a000-000000000004', null, 'Hiburan T7', 'movie', 'expense', true),
  ('cb000000-0000-4000-a000-000000000005', null, 'Gaji T7', 'payments', 'income', true);

insert into public.budgets (id, user_id, category_id, month, amount_limit) values
  ('bd000000-0000-4000-a000-000000000001', 'a11ce000-0000-4000-a000-000000000001',
   'cb000000-0000-4000-a000-000000000001', '2026-09-01', 1000000),
  ('bd000000-0000-4000-a000-000000000002', 'a11ce000-0000-4000-a000-000000000001',
   'cb000000-0000-4000-a000-000000000002', '2026-09-01', 1000000),
  ('bd000000-0000-4000-a000-000000000003', 'a11ce000-0000-4000-a000-000000000001',
   'cb000000-0000-4000-a000-000000000003', '2026-09-01', 1000000),
  ('bd000000-0000-4000-a000-000000000004', 'a11ce000-0000-4000-a000-000000000001',
   'cb000000-0000-4000-a000-000000000004', '2026-09-01', 500000),
  ('bd000000-0000-4000-a000-000000000005', 'a11ce000-0000-4000-a000-000000000001',
   'cb000000-0000-4000-a000-000000000001', '2026-10-01', 1000000),
  ('bd000000-0000-4000-a000-000000000006', 'b0b00000-0000-4000-a000-000000000002',
   'cb000000-0000-4000-a000-000000000001', '2026-09-01', 200000);

insert into public.transactions
  (id, user_id, wallet_id, category_id, type, amount, occurred_at, idempotency_key, deleted_at) values
  ('bc000000-0000-4000-a000-000000000001', 'a11ce000-0000-4000-a000-000000000001',
   'ca000000-0000-4000-a000-000000000001', 'cb000000-0000-4000-a000-000000000001',
   'expense', 799000, '2026-09-05T12:00:00+07:00', 'be000000-0000-4000-a000-000000000001', null),
  ('bc000000-0000-4000-a000-000000000002', 'a11ce000-0000-4000-a000-000000000001',
   'ca000000-0000-4000-a000-000000000001', 'cb000000-0000-4000-a000-000000000001',
   'income', 5000000, '2026-09-06T12:00:00+07:00', 'be000000-0000-4000-a000-000000000002', null),
  ('bc000000-0000-4000-a000-000000000003', 'a11ce000-0000-4000-a000-000000000001',
   'ca000000-0000-4000-a000-000000000001', 'cb000000-0000-4000-a000-000000000001',
   'expense', 700000, '2026-10-01T00:30:00+07:00', 'be000000-0000-4000-a000-000000000003', null),
  ('bc000000-0000-4000-a000-000000000004', 'a11ce000-0000-4000-a000-000000000001',
   'ca000000-0000-4000-a000-000000000001', 'cb000000-0000-4000-a000-000000000002',
   'expense', 800000, '2026-09-07T12:00:00+07:00', 'be000000-0000-4000-a000-000000000004', null),
  ('bc000000-0000-4000-a000-000000000005', 'a11ce000-0000-4000-a000-000000000001',
   'ca000000-0000-4000-a000-000000000001', 'cb000000-0000-4000-a000-000000000002',
   'expense', 500000, '2026-09-08T12:00:00+07:00', 'be000000-0000-4000-a000-000000000005', now()),
  ('bc000000-0000-4000-a000-000000000006', 'a11ce000-0000-4000-a000-000000000001',
   'ca000000-0000-4000-a000-000000000001', 'cb000000-0000-4000-a000-000000000003',
   'expense', 999000, '2026-09-09T12:00:00+07:00', 'be000000-0000-4000-a000-000000000006', null),
  ('bc000000-0000-4000-a000-000000000007', 'a11ce000-0000-4000-a000-000000000001',
   'ca000000-0000-4000-a000-000000000001', 'cb000000-0000-4000-a000-000000000004',
   'expense', 600000, '2026-09-10T12:00:00+07:00', 'be000000-0000-4000-a000-000000000007', null),
  ('bc000000-0000-4000-a000-000000000008', 'b0b00000-0000-4000-a000-000000000002',
   'ca000000-0000-4000-a000-000000000002', 'cb000000-0000-4000-a000-000000000001',
   'expense', 200000, '2026-09-15T12:00:00+00:00', 'be000000-0000-4000-a000-000000000008', null);

-- ---------------------------------------------------------------------------
-- Guard: budget hanya untuk kategori expense
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.budgets (user_id, category_id, month, amount_limit) values
     ('a11ce000-0000-4000-a000-000000000001', 'cb000000-0000-4000-a000-000000000005',
      '2026-09-01', 100000) $$,
  '23514',
  null,
  'budgets: kategori income ditolak (guard expense-only)');

select throws_ok(
  $$ update public.budgets set category_id = 'cb000000-0000-4000-a000-000000000005'
     where id = 'bd000000-0000-4000-a000-000000000001' $$,
  '23514',
  null,
  'budgets: update ke kategori income ditolak');

select throws_ok(
  $$ insert into public.budgets (user_id, category_id, month, amount_limit) values
     ('a11ce000-0000-4000-a000-000000000001', 'cb000000-0000-4000-a000-000000000001',
      '2026-09-01', 500000) $$,
  '23505',
  null,
  'budgets: unique(user_id, category_id, month) ditegakkan');

-- ---------------------------------------------------------------------------
-- v_budget_status — spent × percent × state (boundary 79.9/80/99.9/100)
-- ---------------------------------------------------------------------------

select is(
  (select spent from public.v_budget_status
    where budget_id = 'bd000000-0000-4000-a000-000000000001'),
  799000::numeric,
  'v_budget_status: Makan Sep spent 799rb (income 5jt + Okt 00:30 tidak ikut)');

select is(
  (select state from public.v_budget_status
    where budget_id = 'bd000000-0000-4000-a000-000000000001'),
  'ok',
  'v_budget_status: 79,9% = ok');

select is(
  (select percent from public.v_budget_status
    where budget_id = 'bd000000-0000-4000-a000-000000000001'),
  79.9::numeric,
  'v_budget_status: percent Makan = 79,9');

select is(
  (select spent from public.v_budget_status
    where budget_id = 'bd000000-0000-4000-a000-000000000002'),
  800000::numeric,
  'v_budget_status: Transport Sep spent 800rb (soft-deleted 500rb diabaikan)');

select is(
  (select state from public.v_budget_status
    where budget_id = 'bd000000-0000-4000-a000-000000000002'),
  'warning',
  'v_budget_status: 80% = warning');

select is(
  (select state from public.v_budget_status
    where budget_id = 'bd000000-0000-4000-a000-000000000003'),
  'warning',
  'v_budget_status: 99,9% = warning');

select is(
  (select percent from public.v_budget_status
    where budget_id = 'bd000000-0000-4000-a000-000000000003'),
  99.9::numeric,
  'v_budget_status: percent Belanja = 99,9');

select is(
  (select state from public.v_budget_status
    where budget_id = 'bd000000-0000-4000-a000-000000000004'),
  'exceeded',
  'v_budget_status: 120% = exceeded');

select is(
  (select percent from public.v_budget_status
    where budget_id = 'bd000000-0000-4000-a000-000000000004'),
  120::numeric,
  'v_budget_status: percent Hiburan = 120');

-- Transaksi 1 Okt 00:30 WIB (+07) = 30 Sep 17:30 UTC: masuk bulan Oktober
-- untuk user WIB, bukan September.
select is(
  (select spent from public.v_budget_status
    where budget_id = 'bd000000-0000-4000-a000-000000000005'),
  700000::numeric,
  'v_budget_status: boundary WIB — tx 1 Okt 00:30 WIB masuk budget Okt');

select is(
  (select state from public.v_budget_status
    where budget_id = 'bd000000-0000-4000-a000-000000000005'),
  'ok',
  'v_budget_status: Okt 70% = ok (bulan baru terisi dari tx-nya sendiri)');

-- ---------------------------------------------------------------------------
-- RLS isolation — sebagai authenticated (security invoker)
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ set local role authenticated;
     set local request.jwt.claim.sub = 'a11ce000-0000-4000-a000-000000000001'; $$,
  'as alice: role switch');

select is(
  (select count(*)::int from public.v_budget_status),
  5,
  'v_budget_status: alice melihat 5 budget miliknya');

select is(
  (select count(*)::int from public.v_budget_status
    where user_id = 'b0b00000-0000-4000-a000-000000000002'),
  0,
  'v_budget_status: alice tidak melihat budget bob');

select lives_ok(
  $$ set local role authenticated;
     set local request.jwt.claim.sub = 'b0b00000-0000-4000-a000-000000000002'; $$,
  'as bob: role switch');

select is(
  (select state from public.v_budget_status
    where budget_id = 'bd000000-0000-4000-a000-000000000006'),
  'exceeded',
  'v_budget_status: bob 200rb/200rb = exceeded (mandiri dari alice)');

select lives_ok(
  $$ reset role; set role postgres; set search_path = public, extensions; $$,
  'kembali ke postgres');

-- ---------------------------------------------------------------------------
-- Dedup alert per-user (PRD §6.1 R1)
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ insert into public.budget_alerts (user_id, category_id, month, threshold) values
     ('a11ce000-0000-4000-a000-000000000001', 'cb000000-0000-4000-a000-000000000001',
      '2026-09-01', 'warning_80') $$,
  'budget_alerts: fire pertama warning_80 tersimpan');

select lives_ok(
  $$ insert into public.budget_alerts (user_id, category_id, month, threshold) values
     ('a11ce000-0000-4000-a000-000000000001', 'cb000000-0000-4000-a000-000000000001',
      '2026-09-01', 'warning_80')
     on conflict do nothing $$,
  'budget_alerts: fire kedua threshold sama = no-op (dedup)');

select is(
  (select count(*)::int from public.budget_alerts
    where user_id = 'a11ce000-0000-4000-a000-000000000001'
      and category_id = 'cb000000-0000-4000-a000-000000000001'
      and month = '2026-09-01' and threshold = 'warning_80'),
  1,
  'budget_alerts: tetap 1 baris setelah double-fire');

-- Turun lalu naik lagi: alert yang sudah fired tidak dihapus dan tidak ganda.
select lives_ok(
  $$ insert into public.budget_alerts (user_id, category_id, month, threshold) values
     ('a11ce000-0000-4000-a000-000000000001', 'cb000000-0000-4000-a000-000000000001',
      '2026-09-01', 'warning_80')
     on conflict do nothing $$,
  'budget_alerts: re-fire setelah turun-naik tetap no-op');

select is(
  (select count(*)::int from public.budget_alerts
    where user_id = 'a11ce000-0000-4000-a000-000000000001'
      and category_id = 'cb000000-0000-4000-a000-000000000001'
      and month = '2026-09-01' and threshold = 'warning_80'),
  1,
  'budget_alerts: tetap 1 baris setelah re-fire');

select lives_ok(
  $$ insert into public.budget_alerts (user_id, category_id, month, threshold) values
     ('a11ce000-0000-4000-a000-000000000001', 'cb000000-0000-4000-a000-000000000001',
      '2026-09-01', 'exceeded_100')
     on conflict do nothing $$,
  'budget_alerts: threshold beda (exceeded_100) fire mandiri');

select is(
  (select count(*)::int from public.budget_alerts
    where user_id = 'a11ce000-0000-4000-a000-000000000001'
      and category_id = 'cb000000-0000-4000-a000-000000000001'
      and month = '2026-09-01'),
  2,
  'budget_alerts: 2 baris untuk 2 threshold');

-- Kunci per-user: bob pada kategori/bulan/threshold sama tidak diblokir.
select lives_ok(
  $$ insert into public.budget_alerts (user_id, category_id, month, threshold) values
     ('b0b00000-0000-4000-a000-000000000002', 'cb000000-0000-4000-a000-000000000001',
      '2026-09-01', 'warning_80')
     on conflict do nothing $$,
  'budget_alerts: user lain pada kunci sama tetap tersimpan (dedup per-user)');

select is(
  (select count(*)::int from public.budget_alerts
    where user_id = 'b0b00000-0000-4000-a000-000000000002'),
  1,
  'budget_alerts: alert bob ada 1 baris');

-- Klien insert lewat RLS-nya sendiri (jalur yang dipakai app).
select lives_ok(
  $$ set local role authenticated;
     set local request.jwt.claim.sub = 'a11ce000-0000-4000-a000-000000000001'; $$,
  'as alice untuk insert via RLS');

select lives_ok(
  $$ insert into public.budget_alerts (user_id, category_id, month, threshold) values
     ('a11ce000-0000-4000-a000-000000000001', 'cb000000-0000-4000-a000-000000000002',
      '2026-09-01', 'warning_80') $$,
  'budget_alerts: alice bisa insert alert miliknya via RLS');

select lives_ok(
  $$ reset role; set role postgres; set search_path = public, extensions; $$,
  'kembali ke postgres (2)');

-- ---------------------------------------------------------------------------
-- Privileges: view hanya untuk authenticated
-- ---------------------------------------------------------------------------

select ok(
  has_table_privilege('authenticated', 'public.v_budget_status', 'select'),
  'v_budget_status: authenticated punya hak select');

select ok(
  not has_table_privilege('anon', 'public.v_budget_status', 'select'),
  'v_budget_status: anon tidak punya hak select');

select is(
  (select relkind = 'v' from pg_catalog.pg_class
    where oid = 'public.v_budget_status'::regclass),
  true,
  'v_budget_status: relasi bertipe view');

-- Fungsi trigger tidak di-expose sebagai RPC (trigger tetap jalan tanpa hak
-- EXECUTE; yang dicabut hanya pemanggilan langsung via PostgREST).
select ok(
  not has_function_privilege('anon', 'public.enforce_budget_expense_only()', 'execute'),
  'guard: anon tidak bisa memanggil fungsi trigger langsung');

select ok(
  not has_function_privilege('authenticated', 'public.enforce_budget_expense_only()', 'execute'),
  'guard: authenticated tidak bisa memanggil fungsi trigger langsung');

-- ---------------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------------

delete from public.budget_alerts
  where user_id in ('a11ce000-0000-4000-a000-000000000001',
                    'b0b00000-0000-4000-a000-000000000002');
delete from public.transactions
  where user_id in ('a11ce000-0000-4000-a000-000000000001',
                    'b0b00000-0000-4000-a000-000000000002');
delete from public.budgets
  where user_id in ('a11ce000-0000-4000-a000-000000000001',
                    'b0b00000-0000-4000-a000-000000000002');
delete from public.wallets
  where user_id in ('a11ce000-0000-4000-a000-000000000001',
                    'b0b00000-0000-4000-a000-000000000002');
delete from public.categories
  where id in ('cb000000-0000-4000-a000-000000000001',
               'cb000000-0000-4000-a000-000000000002',
               'cb000000-0000-4000-a000-000000000003',
               'cb000000-0000-4000-a000-000000000004',
               'cb000000-0000-4000-a000-000000000005');
delete from auth.users
  where id in ('a11ce000-0000-4000-a000-000000000001',
               'b0b00000-0000-4000-a000-000000000002');

select * from finish();
rollback;
