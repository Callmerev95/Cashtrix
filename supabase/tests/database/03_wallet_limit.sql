-- T2 — pgTAP: maksimum 10 wallet per user ditegakkan di level DB,
-- dan hanya menghitung wallet milik user yang bersangkutan.

-- Helper (schema `tests`, extension pgTAP) dibuat oleh 00_setup.sql yang
-- dijalankan pgTAP lebih dulu secara alfabetis; DDL-nya persisten.
set role postgres;
set search_path = public, extensions;

begin;
select plan(4);

insert into auth.users (id, email)
select ('7f000000-0000-4000-a000-' || lpad(g::text, 12, '0'))::uuid, 'user' || g || '@test.com'
from generate_series(1, 2) as g;

-- 10 wallet per user terisi sebagai superuser; yang ke-11 akan diuji lewat trigger.
insert into public.wallets (user_id, name, type)
select ('7f000000-0000-4000-a000-' || lpad(1::text, 12, '0'))::uuid, 'Wallet ' || g, 'cash'
from generate_series(1, 10) as g;

insert into public.wallets (user_id, name, type)
select ('7f000000-0000-4000-a000-' || lpad(2::text, 12, '0'))::uuid, 'Wallet ' || g, 'cash'
from generate_series(1, 10) as g;

select is(
  (select count(*)::int from public.wallets
   where user_id = ('7f000000-0000-4000-a000-' || lpad(1::text, 12, '0'))::uuid),
  10,
  'wallets: 10 wallet user-1 tersimpan');

select throws_ok(
  $$ insert into public.wallets (user_id, name, type)
     values ('7f000000-0000-4000-a000-000000000001', 'Wallet 11', 'cash') $$,
  '23514',
  null,
  'wallets: wallet ke-11 untuk user sama ditolak');

select is(
  (select count(*)::int from public.wallets
   where user_id = ('7f000000-0000-4000-a000-' || lpad(2::text, 12, '0'))::uuid),
  10,
  'wallets: limit user-1 tidak mengganggu user-2 (limit per user)');

select is(
  (select count(*)::int from public.wallets
   where user_id = ('7f000000-0000-4000-a000-' || lpad(1::text, 12, '0'))::uuid),
  10,
  'wallets: wallet ke-11 tidak meninggalkan baris');

select * from finish();
rollback;
