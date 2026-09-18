-- T4 (#5) — Wallets: saldo gabungan dari view + reassign bulk.
--
-- Dua bagian:
--   1. `v_wallet_balances` — satu-satunya sumber saldo wallet. Tidak pernah ada
--      kolom saldo mutable (PRD §4.1 / B2), jadi saldo tidak bisa drift.
--   2. `reassign_wallet_transactions(from, to)` — mengubah wallet_id seluruh
--      transaksi (termasuk yang soft-deleted, agar restore 30 hari tetap utuh)
--      dalam satu transaksi DB, menggantikan bulk update dari client (AC #5).
--
-- View agregasi lain (`v_monthly_summary`, `v_category_breakdown`,
-- `v_budget_status`) tetap milik T6/T7 sesuai `specs/tickets.md`.

-- ---------------------------------------------------------------------------
-- v_wallet_balances — opening_balance + Σ income − Σ expense
-- ---------------------------------------------------------------------------

-- `security_invoker` wajib: tanpa itu view membaca sebagai owner (postgres) dan
-- menembus RLS, sehingga user bisa melihat saldo wallet user lain. Semua
-- agregat difilter eksplisit ke `auth.uid()` (view punya `user_id` sendiri,
-- jadi view tetap aman dipakai langsung).
--
-- `type = 'transfer'` di-exclude untuk kebersihan data masa depan: enum-nya
-- reserved v1.1 dan T5 belum dapat menulis tipe itu (hanya income|expense).
create or replace view public.v_wallet_balances
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
    + coalesce(sum(case when t.type = 'income' then t.amount end), 0)
    - coalesce(sum(case when t.type = 'expense' then t.amount end), 0)
    as balance,
  count(t.id) as transaction_count
from public.wallets w
left join public.transactions t
  on t.wallet_id = w.id
 and t.user_id = w.user_id
 and t.type in ('income', 'expense')
 and t.deleted_at is null
group by w.id, w.user_id, w.name, w.type, w.opening_balance,
         w.archived_at, w.created_at, w.updated_at;

comment on view public.v_wallet_balances is
  'Saldo per wallet = opening_balance + Σ income − Σ expense (soft-deleted dikecualikan). security_invoker: RLS pemanggil berlaku.';

-- `revoke ... from anon` wajib: Supabase memberi default privileges ke anon,
-- sehingga view baru otomatis terbaca tanpa login (RLS tidak dijalankan untuk
-- role anon yang tidak punya policy). Ini menutup jalur itu.
revoke all on public.v_wallet_balances from anon, public;
grant select on public.v_wallet_balances to authenticated;

-- ---------------------------------------------------------------------------
-- reassign_wallet_transactions — pindahkan semua transaksi antar wallet user
-- ---------------------------------------------------------------------------

-- Dijalankan sebagai `authenticated` (bukan security definer): RLS wallet &
-- transactions yang sudah ada tetap menjadi penjaga. `from`/`to` wajib milik
-- pemanggil, jika tidak RLS membuat keduanya tak terlihat → error P0002.
--
-- Soft-deleted ikut dipindah supaya pemulihan 30 hari tidak mengembalikan
-- transaksi ke wallet yang sudah dihapus (FK RESTRICT akan menolaknya).
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

  update public.transactions
     set wallet_id = to_wallet
   where wallet_id = from_wallet
     and user_id = (select auth.uid());

  get diagnostics moved = row_count;
  return moved;
end;
$$;

comment on function public.reassign_wallet_transactions(uuid, uuid) is
  'Pindahkan semua transaksi (termasuk soft-deleted) dari satu wallet ke wallet lain milik user yang sama. Return jumlah baris terpindah.';

revoke all on function public.reassign_wallet_transactions(uuid, uuid) from public, anon;
grant execute on function public.reassign_wallet_transactions(uuid, uuid) to authenticated;
