/**
 * Icon-convention guard (bugfix ikon, pra-T11).
 *
 * Root cause it pins: `@expo/vector-icons@15` MaterialIcons memakai nama
 * ber-strip (`shopping-bag`); 7 ikon kategori memakai underscore
 * (`shopping_bag`) sehingga me-render blank + LogBox warning, padahal
 * `validateCategoryIcon` menganggapnya valid karena katalognya sendiri yang
 * salah. Tes validasi biasa tidak bisa menangkap ini — satu-satunya ground
 * truth adalah glyphmap font yang terinstal.
 */
import { ICON_CATALOG } from '@/features/profile/domain';

// Ground truth: glyphmap font yang dibundel expo. Bila path internal ini
// berubah saat upgrade expo, tes ini gagal dengan modul-tidak-ditemukan —
// itu sinyal untuk memverifikasi ulang konvensi, bukan untuk menghapus tes.
const glyphmap = require('@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/MaterialIcons.json') as Record<
  string,
  number
>;

/** 7 ikon yang blank di production sebelum bugfix (underscore → strip). */
const PREVIOUSLY_BROKEN = [
  'directions-car',
  'shopping-bag',
  'receipt-long',
  'medical-services',
  'show-chart',
  'trending-up',
  'add-circle',
] as const;

describe('ICON_CATALOG — konvensi strip @expo/vector-icons@15', () => {
  it('tidak memakai underscore atau spasi di nama mana pun', () => {
    for (const entry of ICON_CATALOG) {
      expect(entry).toMatch(/^[a-z]+(-[a-z]+)*$/);
    }
  });

  it('memuat ketujuh ikon yang dulu blank, dalam bentuk strip', () => {
    for (const name of PREVIOUSLY_BROKEN) {
      expect(ICON_CATALOG as readonly string[]).toContain(name);
    }
  });

  it('setiap entri katalog ada di glyphmap font yang terinstal', () => {
    const missing = (ICON_CATALOG as readonly string[]).filter(
      (entry) => !(entry in glyphmap),
    );
    expect(missing).toEqual([]);
  });
});
