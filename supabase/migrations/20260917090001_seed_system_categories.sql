-- Cashtrix — seed kategori sistem (idempotent).
-- Diterapkan lewat migrasi (bukan seed.sql) agar remote dan local konsisten.
-- Kategori sistem punya user_id = null dan terlihat semua user lewat policy
-- categories_select_own_or_system. Seed per-user (wallet "Cash") dijalankan
-- Edge Function `seed-user` saat login pertama (T3).

-- NOTE (bugfix ikon, pra-T11): `@expo/vector-icons@15` MaterialIcons memakai
-- nama dengan strip (`shopping-bag`), bukan underscore. Nilai di bawah
-- memakai konvensi strip agar cocok dengan glyphmap font yang terinstal.

insert into public.categories (user_id, name, icon, kind, is_system) values
  (null, 'Makanan',      'restaurant',       'expense', true),
  (null, 'Transportasi', 'directions-car',   'expense', true),
  (null, 'Belanja',      'shopping-bag',     'expense', true),
  (null, 'Tagihan',      'receipt-long',     'expense', true),
  (null, 'Hiburan',      'movie',            'expense', true),
  (null, 'Kesehatan',    'medical-services', 'expense', true),
  (null, 'Investasi',    'show-chart',       'expense', true),
  (null, 'Lainnya',      'category',         'expense', true),
  (null, 'Gaji',         'payments',         'income',  true),
  (null, 'Bonus',        'redeem',           'income',  true),
  (null, 'Investasi',    'trending-up',      'income',  true),
  (null, 'Lainnya',      'add-circle',       'income',  true)
on conflict (name, kind) where user_id is null do nothing;
