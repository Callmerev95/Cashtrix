/**
 * T8 profile domain tests — the pure Jest seam (no bridge, no network).
 */
import {
  AVATAR_MAX_BYTES,
  AVATAR_SIZE_PX,
  CATEGORY_NAME_MAX_LENGTH,
  DEFAULT_CURRENCY,
  DISPLAY_NAME_MAX_LENGTH,
  ICON_CATALOG,
  SUPPORTED_CURRENCIES,
  displayNameOrEmail,
  formatMoney,
  isAvatarMimeType,
  isCatalogIcon,
  isCategoryKind,
  isCategoryVisible,
  isCurrencyCode,
  validateCategoryIcon,
  validateCategoryName,
  validateCurrency,
  validateDisplayName,
  visibleCategories,
  type ManagedCategory,
} from '@/features/profile/domain';

function category(
  overrides: Partial<ManagedCategory> = {},
): ManagedCategory {
  return {
    id: 'id',
    name: 'Makan',
    icon: 'restaurant',
    kind: 'expense',
    isSystem: false,
    archived: false,
    muted: false,
    ...overrides,
  };
}

describe('validateDisplayName', () => {
  it('menolak nama kosong', () => {
    expect(validateDisplayName('')).toBe('Nama wajib diisi');
    expect(validateDisplayName('   ')).toBe('Nama wajib diisi');
  });

  it('menolak nama lebih dari 60 karakter', () => {
    expect(validateDisplayName('a'.repeat(DISPLAY_NAME_MAX_LENGTH + 1))).toBe(
      `Nama maksimal ${DISPLAY_NAME_MAX_LENGTH} karakter`,
    );
  });

  it('menerima nama 60 karakter dan mengabaikan spasi tepi', () => {
    expect(validateDisplayName('a'.repeat(DISPLAY_NAME_MAX_LENGTH))).toBeNull();
    expect(validateDisplayName('  Evelyn  ')).toBeNull();
  });
});

describe('validateCategoryName', () => {
  it('menolak nama kosong dan nama lebih dari 40 karakter', () => {
    expect(validateCategoryName('')).toBe('Nama kategori wajib diisi');
    expect(
      validateCategoryName('a'.repeat(CATEGORY_NAME_MAX_LENGTH + 1)),
    ).toBe(`Nama kategori maksimal ${CATEGORY_NAME_MAX_LENGTH} karakter`);
  });

  it('menerima nama valid', () => {
    expect(validateCategoryName('Jajan')).toBeNull();
  });
});

describe('validateCategoryIcon / isCatalogIcon', () => {
  it('menerima seluruh isi katalog', () => {
    for (const entry of ICON_CATALOG) {
      expect(validateCategoryIcon(entry)).toBeNull();
      expect(isCatalogIcon(entry)).toBe(true);
    }
  });

  it('menolak ikon di luar katalog', () => {
    expect(validateCategoryIcon('not-an-icon')).toBe('Pilih ikon dari katalog');
    expect(isCatalogIcon('not-an-icon')).toBe(false);
  });
});

describe('currency', () => {
  it('default IDR dan daftar berisi kode umum', () => {
    expect(DEFAULT_CURRENCY).toBe('IDR');
    expect(SUPPORTED_CURRENCIES).toContain('IDR');
    expect(SUPPORTED_CURRENCIES).toContain('USD');
  });

  it('validateCurrency menolak kode asing', () => {
    expect(validateCurrency('IDR')).toBeNull();
    expect(validateCurrency('XXY')).toBe('Mata uang tidak didukung');
  });

  it('isCurrencyCode dan isCategoryKind menjaga tipe', () => {
    expect(isCurrencyCode('USD')).toBe(true);
    expect(isCurrencyCode('XXX')).toBe(false);
    expect(isCategoryKind('income')).toBe(true);
    expect(isCategoryKind('transfer')).toBe(false);
  });

  it('formatMoney me-render tanpa konversi dan tanpa NaN', () => {
    const rendered = formatMoney(1250000, 'IDR');
    expect(rendered).toContain('Rp');
    expect(rendered).not.toContain('NaN');
    expect(formatMoney(99.5, 'USD', 'en-US')).toContain('$');
  });
});

describe('avatar contract', () => {
  it('512px dan batas 2MB sesuai AC', () => {
    expect(AVATAR_SIZE_PX).toBe(512);
    expect(AVATAR_MAX_BYTES).toBe(2 * 1024 * 1024);
  });

  it('hanya PNG/JPEG yang diterima', () => {
    expect(isAvatarMimeType('image/png')).toBe(true);
    expect(isAvatarMimeType('image/jpeg')).toBe(true);
    expect(isAvatarMimeType('image/gif')).toBe(false);
  });
});

describe('isCategoryVisible / visibleCategories', () => {
  it('menyembunyikan yang diarsip (kustom) dan yang di-mute (sistem)', () => {
    expect(isCategoryVisible(category())).toBe(true);
    expect(isCategoryVisible(category({ archived: true }))).toBe(false);
    expect(
      isCategoryVisible(category({ isSystem: true, muted: true })),
    ).toBe(false);
  });

  it('mengembalikan subset terlihat dalam urutan nama stabil', () => {
    const rows = [
      category({ id: '2', name: 'Zakat' }),
      category({ id: '1', name: 'Arisan', archived: true }),
      category({ id: '3', name: 'Bonus', kind: 'income', isSystem: true }),
    ];
    expect(visibleCategories(rows).map((row) => row.id)).toEqual(['3', '2']);
  });
});

describe('displayNameOrEmail', () => {
  it('memakai nama profil ketika pengguna sudah mengaturnya', () => {
    expect(displayNameOrEmail('Evelyn', 'evelyn@x.test')).toBe('Evelyn');
  });

  it('jatuh ke email untuk seed default, kosong, atau null', () => {
    expect(displayNameOrEmail('Pengguna', 'evelyn@x.test')).toBe(
      'evelyn@x.test',
    );
    expect(displayNameOrEmail('', 'evelyn@x.test')).toBe('evelyn@x.test');
    expect(displayNameOrEmail(null, 'evelyn@x.test')).toBe('evelyn@x.test');
  });

  it('tak pernah blank: default terakhir adalah nama seed', () => {
    expect(displayNameOrEmail(null, null)).toBe('Pengguna');
  });
});
