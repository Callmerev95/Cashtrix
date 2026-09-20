-- V2 (#31) — Transfer satu baris (ADR-0004).
--
-- Satu baris `transactions`: `type = 'transfer'`, `wallet_id` = sumber,
-- `counterparty_wallet_id` = tujuan, `amount` tetap positif, `category_id` NULL.
-- Saldo sumber turun, tujuan naik, gabungan diam. Analytics/Spent/Alert/donut
-- tetap mengabaikan `type = 'transfer'` (view T6/T7 sudah memfilter
-- `type in ('income','expense')` / `type = 'expense'` — tidak berubah di sini).
--
-- Yang ditambahkan:
--   1. `transactions.counterparty_wallet_id` nullable + FK komposit
--      `(counterparty_wallet_id, user_id) -> wallets(id, user_id)` ON DELETE
--      RESTRICT (tujuan harus milik user yang sama; wallet tujuan yang masih
--      dirujuk tidak bisa dihapus sebelum reassign — sama seperti sumber).
--   2. `category_id` menjadi nullable (transfer tidak punya kategori).
--   3. Check `transactions_transfer_shape`: transfer ↔ category NULL ↔
--      counterparty NOT NULL; income/expense ↔ kebalikannya.
--   4. Check `transactions_transfer_wallets_differ`: sumber ≠ tujuan.
--   5. Trigger `enforce_transaction_no_future`: `occurred_at` masa depan
--      ditolak (23514), toleransi 1 menit untuk skew jam.
--   6. `v_wallet_balances`: transfer mengurangi sumber dan menambah tujuan
--      (soft-deleted dikecualikan). Income/expense tidak berubah.
--   7. `v_transactions_feed`: join kategori menjadi LEFT (transfer tanpa
--      kategori) + kolom counterparty + nama wallet tujuan (LEFT JOIN, sehingga
--      transfer lama tetap menampilkan nama walau wallet tujuan diarsip).
--   8. `reassign_wallet_transactions`: memindahkan `wallet_id` DAN
--      `counterparty_wallet_id`. Bila suatu baris menjadi sumber = tujuan
--      (collapse), SELURUH reassign ditolak atomic (23514) — user memilih
--      wallet ketiga atau menghapus transfer dulu (ADR-0004).
--
-- Yang SENGAJA tidak dicampur: `recurring_rule_id` (itu V3).

-- ---------------------------------------------------------------------------
-- 1–2. Kolom counterparty + category nullable
-- ---------------------------------------------------------------------------

alter table public.transactions
  add column if not exists counterparty_wallet_id uuid;

alter table public.transactions
  alter column category_id drop not null;

-- FK komposit tujuan: tujuan harus wallet milik user yang sama. Nullable:
-- Postgres melewatkan cek FK bila salah satu sisi null (income/expense).
alter table public.transactions
  drop constraint if exists transactions_counterparty_wallet_fk;

alter table public.transactions
  add constraint transactions_counterparty_wallet_fk
  foreign key (counterparty_wallet_id, user_id)
  references public.wallets (id, user_id)
  on delete restrict;

create index if not exists transactions_counterparty_idx
  on public.transactions (counterparty_wallet_id);

-- ---------------------------------------------------------------------------
-- 3–4. Check bentuk transfer + sumber ≠ tujuan
-- ---------------------------------------------------------------------------

alter table public.transactions
  drop constraint if exists transactions_transfer_shape;

alter table public.transactions
  add constraint transactions_transfer_shape check (
    (type = 'transfer' and category_id is null and counterparty_wallet_id is not null)
    or
    (type in ('income', 'expense') and category_id is not null and counterparty_wallet_id is null)
  );

alter table public.transactions
  drop constraint if exists transactions_transfer_wallets_differ;

alter table public.transactions
  add constraint transactions_transfer_wallets_differ check (
    counterparty_wallet_id is null or wallet_id <> counterparty_wallet_id
  );

-- ---------------------------------------------------------------------------
-- 5. Future occurred_at ditolak (trigger — CHECK tidak boleh memakai now())
-- ---------------------------------------------------------------------------

create or replace function public.enforce_transaction_no_future()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.occurred_at > now() + interval '1 minute' then
    raise exception 'tanggal tidak boleh di masa depan' using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function public.enforce_transaction_no_future() is
  'Guard V2: INSERT/UPDATE transactions dengan occurred_at masa depan ditolak (23514). Toleransi 1 menit untuk skew jam.';

-- Fungsi trigger tidak perlu bisa dipanggil langsung (PostgREST me-expose
-- semua fungsi sebagai RPC). Trigger tetap jalan tanpa hak EXECUTE.
revoke all on function public.enforce_transaction_no_future() from public, anon, authenticated;

drop trigger if exists transactions_enforce_no_future on public.transactions;

create trigger transactions_enforce_no_future
  before insert or update of occurred_at on public.transactions
  for each row execute function public.enforce_transaction_no_future();

-- ---------------------------------------------------------------------------
-- 6. v_wallet_balances — transfer: sumber −amount, tujuan +amount
-- ---------------------------------------------------------------------------
--
-- Satu LEFT JOIN dengan kondisi OR (sumber atau tujuan menyentuh wallet ini).
-- Check `transactions_transfer_wallets_differ` menjamin satu baris tidak pernah
-- cocok di kedua sisi sekaligus, jadi tidak ada double-count.
-- `transaction_count` menghitung kedua sisi: transfer adalah transaksi yang
-- menyentuh kedua wallet (dan menjaga guard hapus wallet tetap menolak selama
-- masih ada transfer yang merujuknya).
--
-- DROP + CREATE (bukan CREATE OR REPLACE): daftar kolom view ini tetap, tetapi
-- pola DROP membuat migrasi tahan terhadap perubahan urutan kolom di masa
-- depan; hak akses dipasang ulang di bawah seperti pola T4/T5.

drop view if exists public.v_wallet_balances;

create view public.v_wallet_balances
with (security_invoker = true)
as
select
  w.id as wallet_id,
  w.user_id,
  w.name,
  w.type,
  w.opening_balance,
  w.archived_at,
  w.created_at,
  w.updated_at,
  w.opening_balance
    + coalesce(sum(case
        when t.type = 'income' and t.wallet_id = w.id then t.amount
        when t.type = 'transfer' and t.counterparty_wallet_id = w.id then t.amount
      end), 0)
    - coalesce(sum(case
        when t.type = 'expense' and t.wallet_id = w.id then t.amount
        when t.type = 'transfer' and t.wallet_id = w.id then t.amount
      end), 0)
    as balance,
  count(t.id) as transaction_count
from public.wallets w
left join public.transactions t
  on t.user_id = w.user_id
 and t.deleted_at is null
 and (t.wallet_id = w.id or t.counterparty_wallet_id = w.id)
group by w.id, w.user_id, w.name, w.type, w.opening_balance,
         w.archived_at, w.created_at, w.updated_at;

comment on view public.v_wallet_balances is
  'Saldo per wallet = opening + income − expense − transfer_keluar + transfer_masuk (soft-deleted dikecualikan). security_invoker: RLS pemanggil berlaku.';

revoke all on public.v_wallet_balances from anon, public;
grant select on public.v_wallet_balances to authenticated;

-- ---------------------------------------------------------------------------
-- 7. v_transactions_feed — satu baris transfer + nama wallet tujuan
-- ---------------------------------------------------------------------------
--
-- Join kategori menjadi LEFT JOIN (transfer `category_id` null). Join wallet
-- sumber tetap INNER (selalu ada); join wallet tujuan LEFT (transfer lama tetap
-- menampilkan nama walau wallet tujuan sudah diarsip — arsip bukan hapus).
--
-- DROP + CREATE (bukan CREATE OR REPLACE): kolom baru `counterparty_wallet_id`
-- disisipkan di tengah daftar, yang ditolak CREATE OR REPLACE (42P16). Hak
-- akses dipasang ulang di bawah seperti pola T4/T5.

drop view if exists public.v_transactions_feed;

create view public.v_transactions_feed
with (security_invoker = true)
as
select
  t.id,
  t.user_id,
  t.wallet_id,
  t.category_id,
  t.counterparty_wallet_id,
  t.type,
  t.amount,
  t.currency_code,
  t.occurred_at,
  t.note,
  t.idempotency_key,
  t.created_at,
  t.updated_at,
  w.name as wallet_name,
  w.type as wallet_type,
  c.name as category_name,
  c.icon as category_icon,
  c.kind as category_kind,
  dest.name as counterparty_wallet_name
from public.transactions t
join public.wallets w
  on w.id = t.wallet_id
 and w.user_id = t.user_id
left join public.categories c
  on c.id = t.category_id
left join public.wallets dest
  on dest.id = t.counterparty_wallet_id
 and dest.user_id = t.user_id
where t.deleted_at is null;

comment on view public.v_transactions_feed is
  'Riwayat transaksi hidup + nama/ikon kategori + nama wallet sumber/tujuan. Transfer: category null, counterparty terisi. security_invoker: RLS pemanggil berlaku.';

revoke all on public.v_transactions_feed from anon, public;
grant select on public.v_transactions_feed to authenticated;

-- ---------------------------------------------------------------------------
-- 8. reassign_wallet_transactions — pindahkan KEDUA kolom, collapse ditolak
-- ---------------------------------------------------------------------------
--
-- Selain `wallet_id`, `counterparty_wallet_id` yang menunjuk wallet asal ikut
-- pindah (transfer yang "masuk" ke wallet asal). Bila hasil akhirnya suatu
-- baris menjadi sumber = tujuan, seluruh reassign ditolak atomic (23514) —
-- user memilih wallet ketiga atau menghapus transfer dulu (ADR-0004). Tolak
-- SEBELUM update sehingga tidak ada baris yang berubah sebagian.

create or replace function public.reassign_wallet_transactions(
  from_wallet uuid,
  to_wallet uuid
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  moved integer;
begin
  if from_wallet is null or to_wallet is null then
    raise exception 'wallet asal dan tujuan wajib diisi' using errcode = '22023';
  end if;

  if from_wallet = to_wallet then
    raise exception 'wallet tujuan harus berbeda dari wallet asal'
      using errcode = '22023';
  end if;

  -- Cek kepemilikan eksplisit (RLS tetap lapisan kedua) agar pesan errornya
  -- bisa dibedakan dari constraint lain saat diuji lewat pgTAP.
  if not exists (
    select 1 from public.wallets
    where id = from_wallet and user_id = (select auth.uid())
  ) then
    raise exception 'wallet asal tidak ditemukan' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.wallets
    where id = to_wallet and user_id = (select auth.uid())
  ) then
    raise exception 'wallet tujuan tidak ditemukan' using errcode = 'P0002';
  end if;

  -- Collapse: transfer yang keluar dari asal menuju tujuan (atau masuk dari
  -- tujuan ke asal — simetris setelah arah mana pun) akan menjadi sumber =
  -- tujuan bila dipindahkan. Income/expense (`counterparty` null) tidak pernah
  -- collapse.
  if exists (
    select 1 from public.transactions
    where user_id = (select auth.uid())
      and (
        (wallet_id = from_wallet and counterparty_wallet_id = to_wallet)
        or
        (wallet_id = to_wallet and counterparty_wallet_id = from_wallet)
      )
  ) then
    raise exception 'reassign membuat sumber = tujuan: pilih wallet lain atau hapus transfer dulu'
      using errcode = '23514';
  end if;

  update public.transactions
     set wallet_id = case when wallet_id = from_wallet then to_wallet else wallet_id end,
         counterparty_wallet_id = case when counterparty_wallet_id = from_wallet then to_wallet else counterparty_wallet_id end
   where (wallet_id = from_wallet or counterparty_wallet_id = from_wallet)
     and user_id = (select auth.uid());

  get diagnostics moved = row_count;
  return moved;
end;
$$;

comment on function public.reassign_wallet_transactions(uuid, uuid) is
  'Pindahkan semua transaksi (termasuk soft-deleted) dari satu wallet ke wallet lain milik user yang sama: wallet_id DAN counterparty_wallet_id. Collapse sumber=tujuan ditolak atomic (23514). Return jumlah baris terpindah.';

revoke all on function public.reassign_wallet_transactions(uuid, uuid) from public, anon;
grant execute on function public.reassign_wallet_transactions(uuid, uuid) to authenticated;
