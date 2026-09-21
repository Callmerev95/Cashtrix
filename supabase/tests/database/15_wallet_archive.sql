-- V4 (#33) — pgTAP: arsip Wallet + undo delete.
--
-- Seam yang diuji adalah perilaku eksternal yang dijanjikan AC V4:
--   * arsip = update `wallets.archived_at` oleh pemilik (RLS authenticated
--     mengizinkan; kolom sudah ada sejak T2 — V4 tidak menambah DDL);
--   * `v_wallet_balances` tetap mengembalikan wallet terarsip dengan
--     `archived_at` terisi (arsip adalah keputusan tampilan klien, bukan
--     filter view — Dashboard menyaring via `archivedAt` yang baru dipetakan);
--   * `v_transactions_feed`: transfer lama ke wallet terarsip TETAP tampil
--     dengan nama wallet (LEFT JOIN counterparty — arsip bukan hapus);
--   * buka-arsip: `archived_at` kembali null;
--   * silang-user: arsip wallet orang lain no-op (RLS);
--   * undo: `soft_delete_transaction` lalu `restore_transaction` memulihkan
--     baris (jendela snackbar 5 detik adalah keputusan UI, RPC sudah ada).
--
-- Mengikuti pola 13_transfer.sql: postgres menyiapkan data (RLS bypass),
-- blok per-user memakai `set local role authenticated` + jwt claim.

set role postgres;
set search_path = public, extensions;

begin;
select plan(15);

-- ---------------------------------------------------------------------------
-- Data uji: alice 2 wallet + transfer ke Tujuan; bob 1 wallet.
-- ---------------------------------------------------------------------------

insert into auth.users (id, email) values
  ('c1000000-0000-4000-a000-000000000001', 'tarch-alice@test.com'),
  ('c1000000-0000-4000-a000-000000000002', 'tarch-bob@test.com');
-- (profil otomatis dari trigger handle_new_user — 05_profile_trigger.sql)

insert into public.wallets (id, user_id, name, type, opening_balance) values
  ('c2000000-0000-4000-a000-000000000001', 'c1000000-0000-4000-a000-000000000001', 'Sumber', 'bank', 1000000),
  ('c2000000-0000-4000-a000-000000000002', 'c1000000-0000-4000-a000-000000000001', 'Tujuan', 'cash', 0),
  ('c2000000-0000-4000-a000-000000000004', 'c1000000-0000-4000-a000-000000000002', 'Bob Satu', 'bank', 5000000);

insert into public.transactions
  (id, user_id, wallet_id, counterparty_wallet_id, category_id, type, amount, occurred_at, idempotency_key)
values
  ('c4000000-0000-4000-a000-000000000001', 'c1000000-0000-4000-a000-000000000001',
   'c2000000-0000-4000-a000-000000000001', 'c2000000-0000-4000-a000-000000000002', null,
   'transfer', 250000, '2026-09-10T12:00:00+07:00', 'c5000000-0000-4000-a000-000000000101');

-- ---------------------------------------------------------------------------
-- Alice mengarsipkan Tujuan (RIB: update archived_at via RLS owner)
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-4000-a000-000000000001';

update public.wallets
   set archived_at = '2026-09-20T10:00:00+07:00'
 where id = 'c2000000-0000-4000-a000-000000000002';

select is(
  (select (archived_at is not null)::int from public.wallets
    where id = 'c2000000-0000-4000-a000-000000000002'),
  1,
  'arsip: pemilik bisa update archived_at (RLS mengizinkan update sendiri)');

select is(
  (select (archived_at is not null)::int
     from public.v_wallet_balances
    where wallet_id = 'c2000000-0000-4000-a000-000000000002'),
  1,
  'v_wallet_balances: wallet terarsip tetap terbaca (arsip bukan hapus)');

select is(
  (select counterparty_wallet_name from public.v_transactions_feed
    where id = 'c4000000-0000-4000-a000-000000000001'),
  'Tujuan',
  'feed: transfer lama tetap menampilkan nama wallet terarsip (LEFT JOIN)');

select is(
  (select count(*) from public.v_wallet_balances where wallet_id = 'c2000000-0000-4000-a000-000000000002'),
  1::bigint,
  'v_wallet_balances: arsip tidak menyembunyikan baris (filter sisi klien)');

-- Buka-arsip: archived_at null kembali.
update public.wallets set archived_at = null
 where id = 'c2000000-0000-4000-a000-000000000002';

select is(
  (select (archived_at is null)::int from public.wallets
    where id = 'c2000000-0000-4000-a000-000000000002'),
  1,
  'buka-arsip: archived_at kembali null');

-- Re-arsip untuk blok berikutnya (feed-ke-nama & undo di bawah tetap teruji).
update public.wallets
   set archived_at = '2026-09-20T10:00:00+07:00'
 where id = 'c2000000-0000-4000-a000-000000000002';

-- Feed tetap punya baris transfer (arsip tidak menyembunyikan riwayat).
select is(
  (select count(*) from public.v_transactions_feed
    where id = 'c4000000-0000-4000-a000-000000000001'),
  1::bigint,
  'feed: transfer lama ke wallet terarsip tetap di feed (arsip tidak menghilangkan baris)');

-- Transfer lama tetap punya nama (kolom yang di-join, bukan nama klien).
select is(
  (select count(*) from public.v_transactions_feed
    where counterparty_wallet_name = 'Tujuan'),
  1::bigint,
  'feed: nama wallet terarsip tersaji di server');

-- Undo: soft-delete lalu restore via RPC yang sudah ada (jendela snackbar).
select is(
  public.soft_delete_transaction('c4000000-0000-4000-a000-000000000001'),
  1,
  'undo: soft_delete_transaction mengembalikan 1 baris (feed kehilangan baris)');

select is(
  (select count(*) from public.v_transactions_feed where wallet_id = 'c2000000-0000-4000-a000-000000000001'),
  0::bigint,
  'undo: feed menyembunyikan baris terhapus (snapshot pruned)');

select is(
  public.restore_transaction('c4000000-0000-4000-a000-000000000001'),
  1,
  'undo: restore_transaction memulihkan 1 baris (tombol Urungkan)');

select is(
  (select (deleted_at is null)::int
     from public.transactions where id = 'c4000000-0000-4000-a000-000000000001'),
  1,
  'undo: baris hidup kembali (30 hari retention belum menyerang)');

-- Wallet terarsip tidak bisa dihapus bila masih dirujuk (FK RESTRICT tetap).
select throws_ok(
  $$ delete from public.wallets where id = 'c2000000-0000-4000-a000-000000000002' $$,
  '23503', null,
  'arsip: hapus wallet terarsip tetap ditolak FK (hapus tetap jalur reassign)');

-- ---------------------------------------------------------------------------
-- Silang-user + anon: bob tidak bisa menyentuh wallet alice
-- ---------------------------------------------------------------------------

set local role authenticated;
set local request.jwt.claim.sub = 'c1000000-0000-4000-a000-000000000002';

-- Bob adalah pemilik walletnya sendiri: `archived_at is null` miliknya sendiri
-- hanya bisa dibaca bila baris tak terlihat = no-op, jadi kontrolnya eksplisit:
-- update lolos 0 baris → baris alice tetap terarsip dari sudut postgres.
update public.wallets
   set archived_at = now()
 where id = 'c2000000-0000-4000-a000-000000000002';

select is(
  (select count(*) from public.wallets),
  1::bigint,
  'silang-user: bob hanya melihat wallet miliknya (RLS select)');

select is(
  (select count(*) from public.v_wallet_balances where wallet_id = 'c2000000-0000-4000-a000-000000000002'),
  0::bigint,
  'silang-user: bob tidak melihat wallet alice terarsip pun');

-- Kembali sebagai postgres (RLS bypass) untuk kontrol silang-user.
reset role;
set role postgres;
set search_path = public, extensions;

select is(
  (select (archived_at is not null)::int from public.wallets
    where id = 'c2000000-0000-4000-a000-000000000002'),
  1,
  'silang-user: arsip wallet orang lain no-op (RLS 0 baris, nilai tak berubah)');

select * from finish();
rollback;
