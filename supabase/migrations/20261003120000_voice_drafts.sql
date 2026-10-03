-- AI6 (#95) — Rekaman suara sementara: bucket privat + retensi 0 hari.
--
-- Objek-only, TANPA tabel baru (keputusan grill terkunci): kontrak
-- `{audio} → {teks}` bersifat transien. Klien meng-upload rekaman pendek
-- (maks 15 detik, <1MB) ke `voice_drafts/{userId}/{uuid}.m4a`; Edge
-- `transcribe-voice` mengunduh via service role, mentranskrip, lalu
-- MENGHAPUS objek via service role sebelum return. Tidak ada cron, tidak ada
-- sweep klien: objek yang gagal ditranskrip (Edge crash sebelum hapus) adalah
-- path uuid tak-tertebak dan bisa dibersihkan manual via service_role.
--
-- Pola bucket meniru `receipts` (S2): privat, prefix `{userId}/`, 4 policy
-- `to authenticated` deny-by-default + revoke anon. Beda yang disengaja:
-- `file_size_limit` 1MB (cap klien <1MB ditegakkan ganda di sini) dan tanpa
-- tabel pendamping / tanpa purge function — retensi nol dijamin oleh hapus
-- instan di Edge, bukan oleh job periodik.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('voice_drafts', 'voice_drafts', false, 1048576, array['audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/x-m4a'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

create policy voice_drafts_select_own on storage.objects
  for select to authenticated
  using (bucket_id = 'voice_drafts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy voice_drafts_insert_own on storage.objects
  for insert to authenticated
  with check (bucket_id = 'voice_drafts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy voice_drafts_update_own on storage.objects
  for update to authenticated
  using (bucket_id = 'voice_drafts' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'voice_drafts' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy voice_drafts_delete_own on storage.objects
  for delete to authenticated
  using (bucket_id = 'voice_drafts' and (storage.foldername(name))[1] = (select auth.uid())::text);
