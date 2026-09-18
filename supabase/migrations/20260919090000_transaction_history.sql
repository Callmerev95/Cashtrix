-- T5 (#6) — Transaksi: riwayat ter-paginasi, soft-delete dengan retensi 30 hari.
--
-- Tabel `transactions` sudah ada sejak T2. Migrasi ini menambahkan:
--   1. `v_transactions_feed` — satu baris transaksi hidup + nama/ikon kategori
--      dan nama wallet, dipakai riwayat Dashboard (join tidak boleh dilakukan
--      client-side tanpa membocorkan RLS ke query terpisah).
--   2. `soft_delete_transaction(id)` / `restore_transaction(id)` — jalur
--      eksplisit untuk hapus/pulihkan, dengan cek kepemilikan.
--   3. `purge_deleted_transactions()` — hard-delete transaksi yang sudah lewat
--      retensi 30 hari (dijadwalkan via pg_cron, lihat blok di bawah).
--
-- Catatan idempotency: `unique(user_id, idempotency_key)` sudah ada di T2 dan
-- menjadi penjamin AC "retry tidak menduplikasi" — tidak perlu DDL baru.

-- ---------------------------------------------------------------------------
-- v_transactions_feed — riwayat siap-render (kategori + wallet sudah di-join)
-- ---------------------------------------------------------------------------

-- `security_invoker` wajib (lihat R3/pelajaran T4): tanpa itu view dibaca
-- sebagai owner dan RLS tabel dasar ter-bypass. Kedua tabel yang di-join
-- (`categories`, `wallets`) punya RLS sendiri, jadi join tetap aman selama
-- view memakai hak pemanggil.
--
-- `deleted_at is null` di-encode di view, bukan di query klien: riwayat tidak
-- pernah boleh menampilkan transaksi terhapus, dan filter ini sekaligus
-- menjaga halaman tetap 20 baris penuh.
create or replace view public.v_transactions_feed
with (security_invoker = true)
as
select
  t.id,
  t.user_id,
  t.wallet_id,
  t.category_id,
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
  c.kind as category_kind
from public.transactions t
join public.wallets w
  on w.id = t.wallet_id
 and w.user_id = t.user_id
join public.categories c
  on c.id = t.category_id
where t.deleted_at is null;

comment on view public.v_transactions_feed is
  'Riwayat transaksi hidup + nama/ikon kategori + nama wallet. security_invoker: RLS pemanggil berlaku.';

-- Supabase memberi default privileges ke anon, jadi view baru harus dicabut
-- dulu sebelum di-grant ke authenticated (pelajaran T4 / pgTAP 07 test 12-13).
revoke all on public.v_transactions_feed from anon, public;
grant select on public.v_transactions_feed to authenticated;

-- Pagination riwayat: `order by occurred_at desc, id desc` (tie-break stabil).
-- Index dari T2 `(user_id, occurred_at desc)` sudah melayani ini; tambahkan
-- `id` sebagai kolom terakhir tidak diperlukan untuk 10k baris.

-- ---------------------------------------------------------------------------
-- soft_delete_transaction / restore_transaction
-- ---------------------------------------------------------------------------

-- Dijalankan sebagai `authenticated` (bukan security definer) supaya RLS
-- `transactions_update_own` tetap penjaga. `search_path` dikunci kosong dan
-- semua nama di-kualifikasi eksplisit.
--
-- Mengembalikan jumlah baris yang berubah (0 = tidak ada/bukan milik pemanggil)
-- supaya klien bisa membedakan "sudah terhapus" dari "bukan milik saya" tanpa
-- memerlukan pesan error khusus.
create or replace function public.soft_delete_transaction(transaction_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  affected integer;
begin
  if transaction_id is null then
    raise exception 'id transaksi wajib diisi' using errcode = '22023';
  end if;

  update public.transactions
     set deleted_at = now()
   where id = transaction_id
     and user_id = (select auth.uid())
     and deleted_at is null;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

comment on function public.soft_delete_transaction(uuid) is
  'Soft-delete satu transaksi milik pemanggil (retensi 30 hari). Return jumlah baris yang berubah.';

-- Pemulihan dalam jendela 30 hari. Hanya transaksi yang sudah di-soft-delete
-- yang dipulihkan; transaksi hidup tidak tersentuh (idempoten).
create or replace function public.restore_transaction(transaction_id uuid)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  affected integer;
begin
  if transaction_id is null then
    raise exception 'id transaksi wajib diisi' using errcode = '22023';
  end if;

  update public.transactions
     set deleted_at = null
   where id = transaction_id
     and user_id = (select auth.uid())
     and deleted_at is not null;

  get diagnostics affected = row_count;
  return affected;
end;
$$;

comment on function public.restore_transaction(uuid) is
  'Pulihkan transaksi soft-deleted milik pemanggil (jendela retensi 30 hari). Return jumlah baris yang berubah.';

revoke all on function public.soft_delete_transaction(uuid) from public, anon;
revoke all on function public.restore_transaction(uuid) from public, anon;
grant execute on function public.soft_delete_transaction(uuid) to authenticated;
grant execute on function public.restore_transaction(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- purge_deleted_transactions — hard-delete lewat retensi 30 hari
-- ---------------------------------------------------------------------------

-- Dipanggil cron harian. `deleted_at < now() - interval '30 days'` (bukan
-- `>=`) supaya transaksi tepat 30 hari lalu sudah boleh dibersihkan.
--
-- Bukan security definer dan tanpa cek `auth.uid()`: fungsi ini dijalankan
-- jadwal pg_cron sebagai `postgres` (superuser), jadi RLS ter-bypass dan SEMUA
-- user dibersihkan dalam satu jalan. Dipanggil `authenticated` ia hanya
-- membersihkan baris miliknya sendiri (RLS), yang tetap benar.
create or replace function public.purge_deleted_transactions()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.transactions
   where deleted_at is not null
     and deleted_at < now() - interval '30 days';

  get diagnostics removed = row_count;
  return removed;
end;
$$;

comment on function public.purge_deleted_transactions() is
  'Hard-delete transaksi yang sudah soft-deleted lebih dari 30 hari. Dipanggil cron harian.';

-- Fungsi ini tidak untuk klien: RLS membuatnya hanya menyentuh baris sendiri,
-- tetapi tetap ada di permukaan API publik. Cabut dari anon/public, biarkan
-- authenticated memanggilnya (idempoten, aman) agar `pg_cron` yang dijalankan
-- sebagai postgres tetap bisa.
revoke all on function public.purge_deleted_transactions() from public, anon;
grant execute on function public.purge_deleted_transactions() to authenticated;

-- ---------------------------------------------------------------------------
-- Retensi otomatis (opsional, hanya bila pg_cron tersedia)
-- ---------------------------------------------------------------------------

-- pg_cron membuat job persisten, dan itu hanya masuk akal di database tempat
-- ekstensinya benar-benar ada. Ia di-install di database `postgres` (lokasi
-- kanonik Supabase) lewat `create extension if not exists`, tetapi `pg_cron`
-- TIDAK tersedia di image Postgres polos — karena itu seluruh blok dibungkus
-- `do` dengan guard, bukan `create extension` telanjang.
do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron tidak tersedia — purge_deleted_transactions harus dijadwalkan manual';
    return;
  end if;

  create extension if not exists pg_cron;

  -- Nama job tetap + `cron.schedule` (upsert by jobname) → memanggil ulang
  -- migrasi tidak membuat job duplikat.
  perform cron.schedule(
    'cashtrix-purge-deleted-transactions',
    '0 3 * * *',
    $job$ select public.purge_deleted_transactions(); $job$
  );
end;
$$;
