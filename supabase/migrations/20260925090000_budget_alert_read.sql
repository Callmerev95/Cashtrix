-- A5 (#48) — Inbox notifikasi: flag dibaca per alert.
--
-- Satu kolom nullable tanpa default expression: Postgres menambahkannya
-- tanpa rewrite tabel, dan baris lama otomatis "belum dibaca" (NULL) —
-- tidak ada backfill. Tanpa indeks baru: inbox per-user kecil dan listing
-- dilayani `budget_alerts_user_month_idx (user_id, month)`; filter
-- `read_at is null` berjalan di atas himpunan baris user itu saja.
-- Tanpa policy baru: `budget_alerts_update_own` (USING + WITH CHECK per-user,
-- sejak T2) sudah mengizinkan pemilik menandai dibaca.

alter table public.budget_alerts
  add column if not exists read_at timestamptz null default null;

comment on column public.budget_alerts.read_at is
  'NULL = belum dibaca (termasuk semua baris pra-A5). Tandai dibaca = now(), buka kembali = NULL. Inbox A5.';
