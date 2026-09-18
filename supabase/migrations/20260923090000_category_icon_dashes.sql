-- Cashtrix — bugfix ikon kategori (pra-T11).
--
-- `@expo/vector-icons@15` MaterialIcons memakai nama dengan strip
-- (`shopping-bag`), bukan underscore (`shopping_bag`); 7 ikon kategori
-- sistem me-render blank + LogBox warning. File seed
-- `20260917090001` sudah diperbaiki untuk install baru, tetapi baris yang
-- sudah telanjur di-seed di database hosted masih bernilai underscore
-- (upsert seed memakai `do nothing` sehingga tidak menimpa).
--
-- Migrasi ini memetakan ulang nilai lama ke konvensi strip, untuk kategori
-- sistem (user_id null) maupun kategori kustom yang meniru nama sistem.
-- Idempotent: hanya menyentuh baris yang masih bernilai lama.

update public.categories set icon = 'directions-car'
  where icon = 'directions_car';
update public.categories set icon = 'shopping-bag'
  where icon = 'shopping_bag';
update public.categories set icon = 'receipt-long'
  where icon = 'receipt_long';
update public.categories set icon = 'medical-services'
  where icon = 'medical_services';
update public.categories set icon = 'show-chart'
  where icon = 'show_chart';
update public.categories set icon = 'trending-up'
  where icon = 'trending_up';
update public.categories set icon = 'add-circle'
  where icon = 'add_circle';
