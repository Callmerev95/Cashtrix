/**
 * Kamus Indonesia (C6, ADR-0008). Bahasa fallback global — key yang hilang di
 * `en` tidak pernah merender blank.
 *
 * Aturan: string yang terkunci PRD/spec dipindah VERBATIM ke sini (jangan
 * parafrase). Setiap namespace baru ditambah bersama pasangannya di `en.ts`;
 * test paritas (`__tests__/i18n-dictionary.test.ts`) menolak ketidaklengkapan.
 */
export const id = {
  common: {
    cancel: 'Batal',
    save: 'Simpan',
    delete: 'Hapus',
    retry: 'Coba lagi sebentar lagi.',
  },
  auth: {
    validation: {
      emailRequired: 'Email dan password wajib diisi',
      emailInvalid: 'Email tidak valid',
      passwordTooShort: 'Password minimal 8 karakter',
      passwordNeedsLetterAndNumber: 'Password harus memuat huruf dan angka',
      invalidCredentials: 'Email atau password salah',
      emailNotConfirmed: 'Email belum dikonfirmasi. Cek kotak masuk Anda.',
      signUpFailed: 'Pendaftaran gagal. Coba lagi sebentar lagi',
      networkError: 'Tidak dapat terhubung. Periksa koneksi Anda',
    },
  },
  budgets: {
    state: {
      ok: 'Aman',
      warning: 'Hampir habis',
      exceeded: 'Terlampaui',
    },
    alert: {
      warningTitle: 'Budget {categoryName} hampir habis',
      warningBody: 'Terpakai {spent} dari {limit} (≥80%).',
      exceededTitle: 'Budget {categoryName} terlampaui',
      exceededBody:
        'Terpakai {spent} dari {limit}. Kurangi belanja kategori ini bulan ini.',
    },
    inbox: {
      warningTitle: '{categoryName} menyentuh 80% budget',
      exceededTitle: '{categoryName} melampaui 100% budget',
    },
  },
  categories: {
    expense: {
      makanan: 'Makanan',
      transportasi: 'Transportasi',
      belanja: 'Belanja',
      tagihan: 'Tagihan',
      hiburan: 'Hiburan',
      kesehatan: 'Kesehatan',
      investasi: 'Investasi',
      lainnya: 'Lainnya',
    },
    income: {
      gaji: 'Gaji',
      bonus: 'Bonus',
      investasi: 'Investasi',
      lainnya: 'Lainnya',
    },
  },
  connectivity: {
    offline: 'Tidak ada koneksi',
  },
};

export type Dictionary = typeof id;
