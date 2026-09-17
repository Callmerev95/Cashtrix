-- Cashtrix — seed kategori sistem (idempotent).
-- Diterapkan lewat migrasi (bukan seed.sql) agar remote dan local konsisten.
-- Kategori sistem punya user_id = null dan terlihat semua user lewat policy
-- categories_select_own_or_system. Seed per-user (wallet "Cash") dijalankan
-- Edge Function `seed-user` saat login pertama (T3).

insert into public.categories (user_id, name, icon, kind, is_system) values
  (null, 'Makanan',      'restaurant',       'expense', true),
  (null, 'Transportasi', 'directions_car',   'expense', true),
  (null, 'Belanja',      'shopping_bag',     'expense', true),
  (null, 'Tagihan',      'receipt_long',     'expense', true),
  (null, 'Hiburan',      'movie',            'expense', true),
  (null, 'Kesehatan',    'medical_services', 'expense', true),
  (null, 'Investasi',    'show_chart',       'expense', true),
  (null, 'Lainnya',      'category',         'expense', true),
  (null, 'Gaji',         'payments',         'income',  true),
  (null, 'Bonus',        'redeem',           'income',  true),
  (null, 'Investasi',    'trending_up',      'income',  true),
  (null, 'Lainnya',      'add_circle',       'income',  true)
on conflict (name, kind) where user_id is null do nothing;
