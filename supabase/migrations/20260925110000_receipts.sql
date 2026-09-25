-- S2 (#56) — Foto lampiran struk: bucket privat + tabel + retensi 30 hari.
--
-- Lampiran = foto struk milik user, diambil dari form Add via `expo-image-picker`
-- (nol modul native baru, OTA aman). Alur Opsi A: foto di-upload segera saat
-- diambil (baris `transaction_id NULL` = state legal pra-save), lalu ditautkan
-- ke transaksi saat save sukses (UPDATE transaction_id). Thumbnail yang dihapus
-- sebelum save menghapus baris + objek via Storage API.
--
--   1. Bucket `receipts` — privat, path `{userId}/{uuid}.jpg`, 2MB PNG/JPG
--      (pola bucket `avatars` T2, terpisah agar bukti tidak tercampur avatar).
--   2. Tabel `transaction_receipts` — `transaction_id` nullable (foto pra-save
--      legal); FK komposit `(transaction_id, user_id)` pola transfer V2
--      (ON DELETE CASCADE: purge transaksi T5 tidak boleh macet karena
--      lampiran; lihat catatan retensi di bawah); RLS 4 policy
--      `to authenticated` deny-by-default + revoke anon.
--   3. `purge_expired_receipts()` — hard-delete baris lewat retensi 30 hari
--      dari `created_at` (sejajar retensi soft-delete T5), cron harian.
--
-- Batas peran yang disengaja (hasil verifikasi hosted 2026-09-25):
-- `storage.protect_delete()` menolak DELETE langsung di `storage.objects`
-- (42501) karena hapus baris via SQL meng-yatimkan file backend — penghapusan
-- OBJEK yang benar hanya lewat Storage API. Maka fungsi purge menghapus BARIS;
-- penghapusan objek dikerjakan klien: sweep foreground (daftar kedaluwarsa
-- milik sendiri → `remove()` via API → hapus baris, best-effort, tak pernah
-- menghalangi app open) untuk expiry, dan `remove()` langsung untuk hapus
-- thumbnail pra-save. Cron adalah jaring pengaman baris; objek milik user
-- dorman yang luput dari sweep adalah path uuid tak-tertebak (residu yang
-- diterima, bisa dibersihkan manual via service_role).

-- ---------------------------------------------------------------------------
-- Bucket receipts — privat, 2MB, PNG/JPG
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 2097152, array['image/png', 'image/jpeg'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy receipts_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy receipts_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy receipts_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy receipts_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'receipts' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- ---------------------------------------------------------------------------
-- Tabel transaction_receipts
-- ---------------------------------------------------------------------------

-- Target FK komposit: cermin `unique (id, user_id)` di `wallets` (T2) dan
-- `recurring_rules` (V3). Aman di data riil: `id` PK sehingga pasangan ini
-- trivially unique; hanya membuka pintu untuk FK komposit ke transaksi.
alter table public.transactions
  add constraint transactions_id_user_id_key unique (id, user_id);

create table public.transaction_receipts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Nullable: foto boleh lahir sebelum transaksinya (Opsi A). NULL = yatim
  -- pra-save yang menunggu ditautkan saat save, atau menunggu purge.
  transaction_id uuid,
  storage_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- FK komposit pola V2: receipt hanya boleh menunjuk transaksi milik user
  -- yang sama (taut silang-user ditolak 23503). CASCADE agar purge
  -- transaksi T5 tidak macet; dalam praktik baris receipt kedaluwarsa
  -- (30 hari dari created_at) sebelum transaksi mana pun bisa di-purge
  -- (30 hari dari deleted_at), jadi cascade hampir tak pernah menemukan baris.
  foreign key (transaction_id, user_id)
    references public.transactions (id, user_id) on delete cascade
);

-- Sweep kedaluwarsa milik sendiri: (user_id, created_at).
create index transaction_receipts_user_created_idx
  on public.transaction_receipts (user_id, created_at);
-- Lookup lampiran satu transaksi (thumbnail di form edit).
create index transaction_receipts_transaction_idx
  on public.transaction_receipts (transaction_id)
  where transaction_id is not null;

create trigger transaction_receipts_set_updated_at before update on public.transaction_receipts
  for each row execute function public.set_updated_at();

alter table public.transaction_receipts enable row level security;

create policy transaction_receipts_select_own on public.transaction_receipts
  for select to authenticated using (user_id = (select auth.uid()));
create policy transaction_receipts_insert_own on public.transaction_receipts
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy transaction_receipts_update_own on public.transaction_receipts
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy transaction_receipts_delete_own on public.transaction_receipts
  for delete to authenticated using (user_id = (select auth.uid()));

-- Tabel baru lahir setelah revoke T2, jadi perlu grant/revoke sendiri
-- (pola `recurring_rules` V3).
grant select, insert, update, delete on public.transaction_receipts to authenticated;
revoke all on public.transaction_receipts from anon;

-- ---------------------------------------------------------------------------
-- purge_expired_receipts — hard-delete baris lewat retensi 30 hari
-- ---------------------------------------------------------------------------

-- `created_at < now() - interval '30 days'`: baris tepat 30 hari sudah boleh
-- dibersihkan. Mencakup yatim pra-save (`transaction_id` NULL) — batal form /
-- crash tidak meninggalkan residu baris. Bukan security definer dan tanpa cek
-- `auth.uid()`: cron sebagai `postgres` membersihkan semua user; dipanggil
-- `authenticated` RLS membatasi ke baris sendiri (tcx. sweep klien memakai
-- DELETE langsung; RPC ini jaring pengaman + probe verifikasi).
create or replace function public.purge_expired_receipts()
returns integer
language plpgsql
set search_path = ''
as $$
declare
  removed integer;
begin
  delete from public.transaction_receipts
   where created_at < now() - interval '30 days';

  get diagnostics removed = row_count;
  return removed;
end;
$$;

comment on function public.purge_expired_receipts() is
  'Hard-delete baris lampiran struk lebih dari 30 hari (termasuk yatim pra-save). Objek Storage dihapus klien via API; cron harian.';

revoke all on function public.purge_expired_receipts() from public, anon;
grant execute on function public.purge_expired_receipts() to authenticated;

-- ---------------------------------------------------------------------------
-- Retensi otomatis (opsional, hanya bila pg_cron tersedia — pola T5)
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    raise notice 'pg_cron tidak tersedia — purge_expired_receipts harus dijadwalkan manual';
    return;
  end if;

  create extension if not exists pg_cron;

  perform cron.schedule(
    'cashtrix-purge-expired-receipts',
    '0 4 * * *',
    $job$ select public.purge_expired_receipts(); $job$
  );
end;
$$;
