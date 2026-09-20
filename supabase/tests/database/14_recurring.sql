-- V3 (#32) — pgTAP: recurring catch-up (ADR-0005).
--
-- Seam yang diuji adalah perilaku eksternal yang dijanjikan AC V3:
--   * bentuk rule: kind income|expense (bukan transfer); due 1–28 atau
--     last-of-month; starts_on/ends_on hari-1; ends ≥ starts; wallet aktif
--     milik sendiri; occurrence income|expense + occurred_on terisi.
--   * batas 20 rule aktif (paused tidak dihitung; edit saat plafon tetap boleh).
--   * catch-up: lahir di due date (tz Profile, tengah malam WIB), skip bulan
--     starts yang due-nya sudah lewat via jendela starts_on, dua bulan tutup =
--     dua occurrence, plafon 12/rule/panggilan, unique termasuk soft-delete,
--     paused tidak lahir, hapus rule SET NULL, arsip wallet auto-jeda.
--   * occurrence masuk Spent dan bisa menembus Alert (v_budget_status).
--   * RLS silang-user + hak akses (anon dicabut, authenticated select+execute).
--
-- Semua jendela di-fixture dengan ends_on eksplisit (atau starts masa depan)
-- sehingga hitungan assertion tidak bergantung pada tanggal jalan test.
-- Semua tanggal fixture masa lalu: trigger future-date V2 menolak insert
-- occurred_at masa depan (pola gotcha V2).

set role postgres;
set search_path = public, extensions;

begin;
select plan(43);

-- ---------------------------------------------------------------------------
-- Data uji: alice 3 wallet (satu terarsip), bob 1 wallet.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('d1000000-0000-4000-a000-000000000001', 'rcr-alice@test.com'),
  ('d1000000-0000-4000-a000-000000000002', 'rcr-bob@test.com');

insert into public.wallets (id, user_id, name, type, opening_balance) values
  ('d2000000-0000-4000-a000-000000000001', 'd1000000-0000-4000-a000-000000000001', 'Dompet A', 'bank', 1000000),
  ('d2000000-0000-4000-a000-000000000002', 'd1000000-0000-4000-a000-000000000001', 'Dompet B', 'cash', 500000),
  ('d2000000-0000-4000-a000-000000000003', 'd1000000-0000-4000-a000-000000000001', 'Dompet Arsip', 'ewallet', 0),
  ('d2000000-0000-4000-a000-000000000004', 'd1000000-0000-4000-a000-000000000002', 'Bob Dompet', 'bank', 0);

update public.wallets
   set archived_at = '2026-08-01T00:00:00+07:00'
 where id = 'd2000000-0000-4000-a000-000000000003';

insert into public.categories (id, user_id, name, icon, kind, is_system) values
  ('d3000000-0000-4000-a000-000000000001', null, 'Makan RCR', 'restaurant', 'expense', true),
  ('d3000000-0000-4000-a000-000000000002', null, 'Gaji RCR', 'payments', 'income', true);

update public.profiles set timezone = 'Asia/Jakarta'
 where id in ('d1000000-0000-4000-a000-000000000001', 'd1000000-0000-4000-a000-000000000002');

-- R1 expense due 5 Jan–Apr 2026 (4) · R2 income due-last Jan–Mar (3) ·
-- R3 starts masa depan (0) · R4 paused (0) · R5 due 3 2023–2024 (24, uji plafon) ·
-- R6 expense due 15 Jan–Feb (2) · R7 due 7 Jan (1, uji hapus) ·
-- R8 due 9 Feb (1, uji soft-delete) · R9 wallet B due 11 Jan (1, uji arsip) ·
-- RB bob due 5 Jan (1).
insert into public.recurring_rules
  (id, user_id, kind, amount, wallet_id, category_id, due_day, due_last, starts_on, ends_on, status) values
  ('d6000000-0000-4000-a000-000000000001', 'd1000000-0000-4000-a000-000000000001',
   'expense', 50000, 'd2000000-0000-4000-a000-000000000001', 'd3000000-0000-4000-a000-000000000001',
   5, false, '2026-01-01', '2026-05-01', 'active'),
  ('d6000000-0000-4000-a000-000000000002', 'd1000000-0000-4000-a000-000000000001',
   'income', 100000, 'd2000000-0000-4000-a000-000000000001', 'd3000000-0000-4000-a000-000000000002',
   null, true, '2026-01-01', '2026-04-01', 'active'),
  ('d6000000-0000-4000-a000-000000000003', 'd1000000-0000-4000-a000-000000000001',
   'expense', 10000, 'd2000000-0000-4000-a000-000000000001', 'd3000000-0000-4000-a000-000000000001',
   10, false, '2026-10-01', null, 'active'),
  ('d6000000-0000-4000-a000-000000000004', 'd1000000-0000-4000-a000-000000000001',
   'expense', 10000, 'd2000000-0000-4000-a000-000000000001', 'd3000000-0000-4000-a000-000000000001',
   5, false, '2026-01-01', '2026-03-01', 'paused'),
  ('d6000000-0000-4000-a000-000000000005', 'd1000000-0000-4000-a000-000000000001',
   'expense', 7000, 'd2000000-0000-4000-a000-000000000001', 'd3000000-0000-4000-a000-000000000001',
   3, false, '2023-01-01', '2025-01-01', 'active'),
  ('d6000000-0000-4000-a000-000000000006', 'd1000000-0000-4000-a000-000000000001',
   'expense', 20000, 'd2000000-0000-4000-a000-000000000001', 'd3000000-0000-4000-a000-000000000001',
   15, false, '2026-01-01', '2026-03-01', 'active'),
  ('d6000000-0000-4000-a000-000000000007', 'd1000000-0000-4000-a000-000000000001',
   'expense', 30000, 'd2000000-0000-4000-a000-000000000001', 'd3000000-0000-4000-a000-000000000001',
   7, false, '2026-01-01', '2026-02-01', 'active'),
  ('d6000000-0000-4000-a000-000000000008', 'd1000000-0000-4000-a000-000000000001',
   'expense', 40000, 'd2000000-0000-4000-a000-000000000001', 'd3000000-0000-4000-a000-000000000001',
   9, false, '2026-02-01', '2026-03-01', 'active'),
  ('d6000000-0000-4000-a000-000000000009', 'd1000000-0000-4000-a000-000000000001',
   'expense', 25000, 'd2000000-0000-4000-a000-000000000002', 'd3000000-0000-4000-a000-000000000001',
   11, false, '2026-01-01', '2026-02-01', 'active'),
  ('d6000000-0000-4000-a000-000000000010', 'd1000000-0000-4000-a000-000000000002',
   'expense', 9000, 'd2000000-0000-4000-a000-000000000004', 'd3000000-0000-4000-a000-000000000001',
   5, false, '2026-01-01', '2026-02-01', 'active');

-- ---------------------------------------------------------------------------
-- Bentuk rule + occurrence (sebagai postgres, tanpa RLS)
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ insert into public.recurring_rules
       (user_id, kind, amount, wallet_id, category_id, due_day, starts_on)
     values ('d1000000-0000-4000-a000-000000000001', 'transfer', 1000,
             'd2000000-0000-4000-a000-000000000001', 'd3000000-0000-4000-a000-000000000001',
             5, '2026-01-01') $$,
  '23514', null,
  'rule: kind transfer ditolak (bukan income|expense)');

select throws_ok(
  $$ insert into public.recurring_rules
       (user_id, kind, amount, wallet_id, category_id, due_day, starts_on)
     values ('d1000000-0000-4000-a000-000000000001', 'expense', 1000,
             'd2000000-0000-4000-a000-000000000001', 'd3000000-0000-4000-a000-000000000001',
             29, '2026-01-01') $$,
  '23514', null,
  'rule: due_day 29 ditolak (1–28 atau last-of-month)');

select throws_ok(
  $$ insert into public.recurring_rules
       (user_id, kind, amount, wallet_id, category_id, starts_on)
     values ('d1000000-0000-4000-a000-000000000001', 'expense', 1000,
             'd2000000-0000-4000-a000-000000000001', 'd3000000-0000-4000-a000-000000000001',
             '2026-01-01') $$,
  '23514', null,
  'rule: due null tanpa due_last ditolak');

select throws_ok(
  $$ insert into public.recurring_rules
       (user_id, kind, amount, wallet_id, category_id, due_day, due_last, starts_on)
     values ('d1000000-0000-4000-a000-000000000001', 'expense', 1000,
             'd2000000-0000-4000-a000-000000000001', 'd3000000-0000-4000-a000-000000000001',
             5, true, '2026-01-01') $$,
  '23514', null,
  'rule: due_day terisi + due_last ditolak (pilih salah satu)');

select throws_ok(
  $$ insert into public.recurring_rules
       (user_id, kind, amount, wallet_id, category_id, due_day, starts_on)
     values ('d1000000-0000-4000-a000-000000000001', 'expense', 1000,
             'd2000000-0000-4000-a000-000000000001', 'd3000000-0000-4000-a000-000000000001',
             5, '2026-01-15') $$,
  '23514', null,
  'rule: starts_on bukan hari-1 ditolak');

select throws_ok(
  $$ insert into public.recurring_rules
       (user_id, kind, amount, wallet_id, category_id, due_day, starts_on, ends_on)
     values ('d1000000-0000-4000-a000-000000000001', 'expense', 1000,
             'd2000000-0000-4000-a000-000000000001', 'd3000000-0000-4000-a000-000000000001',
             5, '2026-01-01', '2026-06-15') $$,
  '23514', null,
  'rule: ends_on bukan hari-1 ditolak');

select throws_ok(
  $$ insert into public.recurring_rules
       (user_id, kind, amount, wallet_id, category_id, due_day, starts_on, ends_on)
     values ('d1000000-0000-4000-a000-000000000001', 'expense', 1000,
             'd2000000-0000-4000-a000-000000000001', 'd3000000-0000-4000-a000-000000000001',
             5, '2026-06-01', '2026-01-01') $$,
  '23514', null,
  'rule: ends_on sebelum starts_on ditolak');

select throws_ok(
  $$ insert into public.recurring_rules
       (user_id, kind, amount, wallet_id, category_id, due_day, starts_on)
     values ('d1000000-0000-4000-a000-000000000001', 'expense', 1000,
             'd2000000-0000-4000-a000-000000000003', 'd3000000-0000-4000-a000-000000000001',
             5, '2026-01-01') $$,
  '23514', null,
  'rule: wallet yang diarsip ditolak (pilih wallet aktif)');

select throws_ok(
  $$ insert into public.recurring_rules
       (user_id, kind, amount, wallet_id, category_id, due_day, starts_on)
     values ('d1000000-0000-4000-a000-000000000001', 'expense', 1000,
             'd2000000-0000-4000-a000-000000000004', 'd3000000-0000-4000-a000-000000000001',
             5, '2026-01-01') $$,
  '23503', null,
  'rule: wallet milik user lain ditolak (FK komposit)');

select throws_ok(
  $$ insert into public.transactions
       (user_id, wallet_id, counterparty_wallet_id, type, amount, occurred_at, idempotency_key,
        recurring_rule_id, occurred_on)
     values ('d1000000-0000-4000-a000-000000000001',
             'd2000000-0000-4000-a000-000000000001', 'd2000000-0000-4000-a000-000000000002',
             'transfer', 1000, '2026-09-14T12:00:00+07:00', 'd7000000-0000-4000-a000-000000000011',
             'd6000000-0000-4000-a000-000000000006', '2026-01-15') $$,
  '23514', null,
  'occurrence: transfer ber-rule ditolak (recurring bukan transfer)');

select throws_ok(
  $$ insert into public.transactions
       (user_id, wallet_id, category_id, type, amount, occurred_at, idempotency_key, recurring_rule_id)
     values ('d1000000-0000-4000-a000-000000000001',
             'd2000000-0000-4000-a000-000000000001', 'd3000000-0000-4000-a000-000000000001',
             'income', 1000, '2026-09-14T12:00:00+07:00', 'd7000000-0000-4000-a000-000000000012',
             'd6000000-0000-4000-a000-000000000006') $$,
  '23514', null,
  'occurrence: rule terisi tanpa occurred_on ditolak');

select throws_ok(
  $$ insert into public.transactions
       (user_id, wallet_id, category_id, type, amount, occurred_at, idempotency_key,
        recurring_rule_id, occurred_on)
     values ('d1000000-0000-4000-a000-000000000001',
             'd2000000-0000-4000-a000-000000000001', 'd3000000-0000-4000-a000-000000000001',
             'expense', 1000, '2026-09-14T12:00:00+07:00', 'd7000000-0000-4000-a000-000000000013',
             'd6000000-0000-4000-a000-000000000010', '2026-01-05') $$,
  '23503', null,
  'occurrence: rule milik user lain ditolak (FK komposit)');

-- ---------------------------------------------------------------------------
-- Batas 20 rule aktif (alice sudah punya 8 aktif + 1 paused)
-- ---------------------------------------------------------------------------

insert into public.recurring_rules (user_id, kind, amount, wallet_id, category_id, due_day, starts_on)
select 'd1000000-0000-4000-a000-000000000001', 'expense', 1000,
       'd2000000-0000-4000-a000-000000000001', 'd3000000-0000-4000-a000-000000000001',
       6, '2026-11-01'
  from generate_series(1, 12);

select throws_ok(
  $$ insert into public.recurring_rules
       (user_id, kind, amount, wallet_id, category_id, due_day, starts_on)
     values ('d1000000-0000-4000-a000-000000000001', 'expense', 1000,
             'd2000000-0000-4000-a000-000000000001', 'd3000000-0000-4000-a000-000000000001',
             6, '2026-11-01') $$,
  '23514', null,
  'limit: rule aktif ke-21 ditolak (maks 20)');

insert into public.recurring_rules
  (user_id, kind, amount, wallet_id, category_id, due_day, starts_on, status) values
  ('d1000000-0000-4000-a000-000000000001', 'expense', 1000,
   'd2000000-0000-4000-a000-000000000001', 'd3000000-0000-4000-a000-000000000001',
   6, '2026-11-01', 'paused');

select is(
  (select count(*)::int from public.recurring_rules
    where user_id = 'd1000000-0000-4000-a000-000000000001' and status = 'paused'),
  2,
  'limit: rule paused ke-21 lolos (jeda tidak makan kuota)');

select throws_ok(
  $$ update public.recurring_rules set status = 'active'
      where user_id = 'd1000000-0000-4000-a000-000000000001'
        and status = 'paused'
        and id <> 'd6000000-0000-4000-a000-000000000004' $$,
  '23514', null,
  'limit: mengaktifkan rule ke-21 ditolak');

select lives_ok(
  $$ update public.recurring_rules set amount = 21000
      where id = 'd6000000-0000-4000-a000-000000000006' $$,
  'limit: edit rule aktif saat plafon penuh tetap boleh');

-- ---------------------------------------------------------------------------
-- Catch-up sebagai alice (RLS men-scope ke rule-nya)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'd1000000-0000-4000-a000-000000000001';

-- R1 4 + R2 3 + R5 12 (plafon) + R6 2 + R7 1 + R8 1 + R9 1 = 24.
select is(
  public.run_recurring_catchup(),
  24,
  'catch-up pertama: 24 occurrence (R5 terpotong plafon 12)');

select is(
  public.run_recurring_catchup(),
  12,
  'catch-up kedua: sisa 12 R5 lahir di sesi berikutnya');

select is(
  public.run_recurring_catchup(),
  0,
  'catch-up ketiga: tidak ada yang tersisa (idempotent)');

select is(
  (select count(*)::int from public.transactions
    where recurring_rule_id = 'd6000000-0000-4000-a000-000000000005'),
  24,
  'plafon: R5 genap 24 occurrence (12 + 12, dua sesi)');

select is(
  (select count(*)::int from public.transactions
    where recurring_rule_id = 'd6000000-0000-4000-a000-000000000001'
      and (occurred_at at time zone 'Asia/Jakarta')::date <> occurred_on),
  0,
  'occurred_at = tengah malam tanggal jatuh tempo di tz Profile');

select is(
  (select count(*)::int from public.transactions
    where recurring_rule_id = 'd6000000-0000-4000-a000-000000000002'
      and occurred_on = '2026-02-28'),
  1,
  'due-last: Februari 2026 jatuh tanggal 28 (tidak bolong)');

select is(
  (select count(*)::int from public.transactions
    where recurring_rule_id = 'd6000000-0000-4000-a000-000000000003'),
  0,
  'starts masa depan: tidak ada occurrence sebelum starts_on');

select is(
  (select count(*)::int from public.transactions
    where recurring_rule_id = 'd6000000-0000-4000-a000-000000000004'),
  0,
  'jeda: rule paused tidak melahirkan occurrence');

select is(
  (select count(*)::int from public.transactions
    where recurring_rule_id = 'd6000000-0000-4000-a000-000000000006'),
  2,
  'ends_on: R6 hanya Jan15 + Feb15 (Mar15 di luar jendela)');

-- Hapus sengaja lalu catch-up lagi: tidak boleh kembar (unique + soft-delete).
update public.transactions set deleted_at = now()
 where recurring_rule_id = 'd6000000-0000-4000-a000-000000000008';

select is(
  public.run_recurring_catchup(),
  0,
  'soft-delete: catch-up tidak menulis ganda atas occurrence yang dihapus');

select is(
  (select count(*)::int from public.transactions
    where recurring_rule_id = 'd6000000-0000-4000-a000-000000000008'),
  1,
  'soft-delete: baris terhapus tetap dihitung cover (1 baris, tidak kembar)');

-- Hapus rule: riwayat tetap sebagai transaksi biasa (SET NULL).
delete from public.recurring_rules
 where id = 'd6000000-0000-4000-a000-000000000007';

select is(
  (select count(*)::int from public.transactions
    where recurring_rule_id is null
      and occurred_on = '2026-01-07'
      and user_id = 'd1000000-0000-4000-a000-000000000001'),
  1,
  'hapus rule: occurrence tetap, recurring_rule_id menjadi null');

-- Edit rule tidak menulis ulang yang sudah lahir: R1 diedit SETELAH
-- occurrence-nya lahir (4 × 50000), catch-up tidak menulis apa pun,
-- dan jumlah tidak berubah.
update public.recurring_rules set amount = 60000
 where id = 'd6000000-0000-4000-a000-000000000001';

select is(
  public.run_recurring_catchup(),
  0,
  'edit rule: tidak ada occurrence baru setelah edit');

select is(
  (select sum(amount) from public.transactions
    where recurring_rule_id = 'd6000000-0000-4000-a000-000000000001'),
  200000.00::numeric,
  'edit rule: occurrence lahir tidak berubah (4 × 50000)');

-- Arsip wallet B: rule R9 otomatis jeda.
update public.wallets set archived_at = now()
 where id = 'd2000000-0000-4000-a000-000000000002';

select is(
  (select status from public.recurring_rules
    where id = 'd6000000-0000-4000-a000-000000000009'),
  'paused',
  'arsip wallet: rule aktif di wallet itu otomatis jeda');

select is(
  (select count(*)::int from public.recurring_rules r
    join public.wallets w on w.id = r.wallet_id
   where r.user_id = 'd1000000-0000-4000-a000-000000000001'
     and r.status = 'paused'
     and w.archived_at is not null),
  1,
  'banner: 1 rule jeda karena wallet terarsip (sumber banner Profile)');

-- Occurrence masuk Spent dan menembus Alert: Feb 2026 Makan = R1 50rb + R6
-- 21rb (R6 diedit 20rb → 21rb SEBELUM lahir, jadi lahir 21rb; R8 Feb
-- ter-soft-delete, dikecualikan) = 71rb > limit 40rb.
insert into public.budgets (user_id, category_id, month, amount_limit) values
  ('d1000000-0000-4000-a000-000000000001', 'd3000000-0000-4000-a000-000000000001', '2026-02-01', 40000);

select is(
  (select spent from public.v_budget_status
    where user_id = 'd1000000-0000-4000-a000-000000000001' and month = '2026-02-01'),
  71000.00::numeric,
  'spent: occurrence Februari masuk Spent (50rb + 21rb)');

select is(
  (select state from public.v_budget_status
    where user_id = 'd1000000-0000-4000-a000-000000000001' and month = '2026-02-01'),
  'exceeded',
  'alert: Spent occurrence menembus ambang exceeded_100');

-- ---------------------------------------------------------------------------
-- Isolasi silang-user sebagai bob
-- ---------------------------------------------------------------------------

set local request.jwt.claim.sub = 'd1000000-0000-4000-a000-000000000002';

select is(
  (select count(*)::int from public.recurring_rules),
  1,
  'RLS: bob hanya melihat 1 rule miliknya');

select is(
  public.run_recurring_catchup(),
  1,
  'catch-up bob: hanya 1 occurrence miliknya (Jan5)');

-- Kembali sebagai alice: barisnya tak terlihat dari scope bob (RLS).
set local request.jwt.claim.sub = 'd1000000-0000-4000-a000-000000000001';

select is(
  (select count(*)::int from public.transactions
    where recurring_rule_id = 'd6000000-0000-4000-a000-000000000001'),
  4,
  'isolasi: occurrence alice tidak tersentuh catch-up bob');

-- ---------------------------------------------------------------------------
-- Hak akses (revoke anon, grant authenticated)
-- ---------------------------------------------------------------------------

reset role;
set role postgres;
set search_path = public, extensions;

select ok(
  not has_table_privilege('anon', 'public.recurring_rules', 'select'),
  'recurring_rules: anon tidak punya hak select');

select ok(
  has_table_privilege('authenticated', 'public.recurring_rules', 'select'),
  'recurring_rules: authenticated punya hak select');

select ok(
  not has_function_privilege('anon', 'public.run_recurring_catchup()', 'execute'),
  'catch-up: anon tidak punya hak execute');

select ok(
  has_function_privilege('authenticated', 'public.run_recurring_catchup()', 'execute'),
  'catch-up: authenticated punya hak execute');

select ok(
  not has_function_privilege('authenticated', 'public.enforce_recurring_rule_limit()', 'execute'),
  'limit guard: authenticated tidak punya hak execute langsung');

select ok(
  not has_function_privilege('authenticated', 'public.auto_pause_rules_on_wallet_archive()', 'execute'),
  'auto-pause guard: authenticated tidak punya hak execute langsung');

select * from finish();
rollback;
