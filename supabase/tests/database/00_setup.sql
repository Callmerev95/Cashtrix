-- Setup suite pgTAP Cashtrix (T2, issue #2).
--
-- File ini dijalankan pgTAP paling awal (urutan alfabetis) dan TIDAK memancarkan
-- assertion (tanpa plan/finish). DDL di dalamnya persisten, jadi file test
-- berikutnya tidak perlu mengimpor apa pun.
--
-- Konteks: pgTAP dijalankan sebagai superuser (postgres) sehingga RLS ter-bypass.
-- Untuk menguji kebijakan RLS sebagai pengguna biasa, setiap blok test:
--   1. menyiapkan data sebagai postgres (bypass RLS),
--   2. `set local role authenticated`,
--   3. `set local request.jwt.claim.sub = '<uuid>'` (dibaca `auth.uid()`).
--
-- Catatan portabilitas (ditemukan saat verifikasi remote):
--  * `reset role` mengembalikan role ke session user (bukan postgres) dan
--    memulihkan `search_path` ke snapshot saat role di-set — maka test yang
--    memakai `reset role` harus men-set ulang `set role postgres` +
--    `set search_path = public, extensions`.
--  * UPDATE/DELETE bentrok RLS diuji lewat perilaku observable: baris milik user
--    lain tidak ikut berubah (bukan lewat `returning`, karena baris memang tidak
--    terlihat), kecuali bila errornya datang dari trigger/constraint lain.
--
-- Semua test file berjalan di dalam transaksi + rollback, jadi tidak ada residu.

create schema if not exists tests;
create extension if not exists pgtap with schema extensions;

-- UUID deterministik (uuid v5-style) agar test mudah dibaca; tidak butuh extension.
create or replace function tests.seed_uuid(seed text)
returns uuid
language sql
immutable
as $$
  select (
    substr(h, 1, 8) || '-' ||
    substr(h, 9, 4) || '-5' ||
    substr(h, 14, 3) || '-a' ||
    substr(h, 18, 3) || '-' ||
    substr(h, 21, 12)
  )::uuid
  from (select md5('cashtrix:' || seed)) as t(h);
$$;

grant usage on schema tests to anon, authenticated, service_role;
grant execute on all functions in schema tests to anon, authenticated, service_role;
