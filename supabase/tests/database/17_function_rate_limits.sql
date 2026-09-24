-- D5 (#54) — pgTAP: abuse guard `function_rate_limits` + `check_function_rate_limit`.
--
-- Seam yang diuji:
--   * tabel ada, RLS on tanpa akses anon/authenticated, PK 3 kolom;
--   * fixed window: 3x allowed (count 1,2,3) lalu denied (count 4) +
--     retry_after 1..60 — tiap SELECT memanggil RPC sekali, jadi urutan
--     assertion = urutan hitungan (tidak ada pemanggilan ganda);
--   * isolasi per key dan per function;
--   * window baru setelah window_start kedaluwarsa;
--   * argumen invalid → 22023;
--   * EXECUTE hanya service_role (Edge Functions); user langsung ditolak.

set role postgres;
set search_path = public, extensions;

begin;
select plan(20);

-- ---------------------------------------------------------------------------
-- Bentuk tabel
-- ---------------------------------------------------------------------------

select has_table('public', 'function_rate_limits', 'rate: tabel ada');

select ok(
  (select relrowsecurity from pg_class
    where oid = 'public.function_rate_limits'::regclass),
  'rate: RLS aktif');

select ok(
  (select count(*)::int = 3 from information_schema.key_column_usage
    where table_schema = 'public'
      and table_name = 'function_rate_limits'
      and constraint_name = 'function_rate_limits_pkey'),
  'rate: PK 3 kolom (function, key, window)');

select ok(
  not has_table_privilege('anon', 'public.function_rate_limits', 'select'),
  'rate: anon tanpa select');

select ok(
  not has_table_privilege('authenticated', 'public.function_rate_limits', 'select'),
  'rate: authenticated tanpa select langsung');

-- ---------------------------------------------------------------------------
-- Fixed window: limit 3 → 3 allowed, ke-4 denied
-- ---------------------------------------------------------------------------

select results_eq(
  $$ select allowed, count from public.check_function_rate_limit('d5-f1', 'd5-k1', 3, 60) $$,
  $$ values (true, 1) $$,
  'rate: panggilan 1 allowed');

select results_eq(
  $$ select allowed, count from public.check_function_rate_limit('d5-f1', 'd5-k1', 3, 60) $$,
  $$ values (true, 2) $$,
  'rate: panggilan 2 allowed');

select results_eq(
  $$ select allowed, count from public.check_function_rate_limit('d5-f1', 'd5-k1', 3, 60) $$,
  $$ values (true, 3) $$,
  'rate: panggilan 3 allowed (tepat di limit)');

select results_eq(
  $$ select allowed, count from public.check_function_rate_limit('d5-f1', 'd5-k1', 3, 60) $$,
  $$ values (false, 4) $$,
  'rate: panggilan 4 denied, count jalan terus');

select ok(
  (select retry_after_seconds between 1 and 60
    from public.check_function_rate_limit('d5-f1', 'd5-k1', 3, 60)),
  'rate: retry_after 1..60 detik');

-- ---------------------------------------------------------------------------
-- Isolasi per key dan per function
-- ---------------------------------------------------------------------------

select results_eq(
  $$ select allowed, count from public.check_function_rate_limit('d5-f1', 'd5-k2', 3, 60) $$,
  $$ values (true, 1) $$,
  'rate: key lain tidak terpengaruh');

select results_eq(
  $$ select allowed, count from public.check_function_rate_limit('d5-f2', 'd5-k1', 3, 60) $$,
  $$ values (true, 1) $$,
  'rate: function lain tidak terpengaruh');

-- ---------------------------------------------------------------------------
-- Window baru setelah kedaluwarsa
-- ---------------------------------------------------------------------------

select lives_ok(
  $$ update public.function_rate_limits set window_start = window_start - interval '5 minutes'
      where function_name = 'd5-f1' and bucket_key = 'd5-k1' $$,
  'rate: window digeser ke masa lalu untuk simulasi kedaluwarsa');

select results_eq(
  $$ select allowed, count from public.check_function_rate_limit('d5-f1', 'd5-k1', 3, 60) $$,
  $$ values (true, 1) $$,
  'rate: window baru mulai dari 1 lagi');

-- ---------------------------------------------------------------------------
-- Argumen invalid → 22023
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ select * from public.check_function_rate_limit(null, 'd5-k1', 3, 60) $$,
  '22023',
  'rate: function null ditolak');

select throws_ok(
  $$ select * from public.check_function_rate_limit('d5-f1', '', 3, 60) $$,
  '22023',
  'rate: key kosong ditolak');

select throws_ok(
  $$ select * from public.check_function_rate_limit('d5-f1', 'd5-k1', 0, 60) $$,
  '22023',
  'rate: limit 0 ditolak');

-- ---------------------------------------------------------------------------
-- Hak EXECUTE: hanya service_role
-- ---------------------------------------------------------------------------

select ok(
  not has_function_privilege('anon', 'public.check_function_rate_limit(text,text,integer,integer)', 'execute'),
  'rate: anon tanpa execute (panggilan langsung ditolak)');

select ok(
  not has_function_privilege('authenticated', 'public.check_function_rate_limit(text,text,integer,integer)', 'execute'),
  'rate: authenticated tanpa execute (hanya via Edge Function)');

select ok(
  has_function_privilege('service_role', 'public.check_function_rate_limit(text,text,integer,integer)', 'execute'),
  'rate: service_role bisa execute (jalur Edge Function)');

-- ---------------------------------------------------------------------------
-- Cleanup
-- ---------------------------------------------------------------------------

delete from public.function_rate_limits where function_name like 'd5-%';

select * from finish();
rollback;
