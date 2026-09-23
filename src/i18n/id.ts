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
      confirmRequired: 'Konfirmasi password wajib diisi',
      mismatch: 'Password tidak cocok',
    },
    legal: {
      loginPrefix: 'Dengan melanjutkan, Anda menyetujui ',
      registerPrefix: 'Dengan mendaftar, Anda menyetujui ',
      terms: 'Ketentuan Layanan',
      and: ' dan ',
      privacy: 'Kebijakan Privasi',
    },
    login: {
      subtitle: 'Masuk untuk melihat posisi keuangan Anda.',
      resend: 'Kirim ulang verifikasi',
      submit: 'Masuk',
      toRegisterPrompt: 'Belum punya akun?',
      toRegister: 'Daftar',
      forgot: 'Lupa password?',
    },
    register: {
      title: 'Buat akun',
      subtitle: 'Satu akun untuk seluruh dompet dan transaksi Anda.',
      passwordHint: 'Minimal {min} karakter, memuat huruf dan angka.',
      submit: 'Daftar',
      toLoginPrompt: 'Sudah punya akun?',
      toLogin: 'Masuk',
    },
    checkEmail: {
      title: 'Cek email Anda',
      bodyWithEmail:
        'Kami mengirim tautan verifikasi ke {email}. Buka tautan itu untuk masuk — tidak perlu login ulang di perangkat ini.',
      bodyWithoutEmail:
        'Kami telah mengirim tautan verifikasi ke email Anda. Buka tautan itu, lalu masuk dengan akun Anda.',
      invalidLink:
        'Tautan verifikasi tidak valid atau kedaluwarsa. Minta tautan baru di bawah.',
      resentOk: 'Tautan verifikasi dikirim ulang. Periksa kotak masuk Anda.',
      resendFail: 'Gagal mengirim ulang. Coba lagi sebentar lagi.',
      resending: 'Mengirim…',
      resend: 'Kirim ulang',
      toLogin: 'Sudah terverifikasi? Masuk',
    },
    forgot: {
      title: 'Lupa Password',
      subtitle:
        'Masukkan email Anda, kami akan kirim tautan untuk mengatur password baru.',
      submit: 'Kirim tautan reset',
      toLoginPrompt: 'Ingat password?',
      toLogin: 'Kembali ke Masuk',
      success: 'Jika email terdaftar, tautan reset password telah dikirim.',
      fail: 'Gagal mengirim tautan. Coba lagi sebentar lagi.',
    },
    reset: {
      verifying: 'Memeriksa tautan reset…',
      doneTitle: 'Password diubah',
      doneBody:
        'Password baru Anda sudah tersimpan. Anda sudah masuk — lanjutkan ke aplikasi.',
      openApp: 'Buka aplikasi',
      formTitle: 'Atur Password Baru',
      formSubtitle:
        'Masukkan password baru Anda. Password harus minimal 8 karakter dengan huruf dan angka.',
      newPassword: 'Password Baru',
      confirmPassword: 'Konfirmasi Password',
      submit: 'Simpan Password Baru',
      linkInvalid:
        'Tautan reset tidak valid atau kedaluwarsa. Minta tautan baru dari layar Masuk.',
      linkMissing:
        'Buka tautan dari email reset password untuk mengatur password baru.',
      updateFail: 'Gagal mengubah password. Coba lagi sebentar lagi.',
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
  dashboard: {
    greeting: {
      morning: 'Selamat pagi',
      afternoon: 'Selamat siang',
      evening: 'Selamat sore',
      night: 'Selamat malam',
    },
    notif: {
      open: 'Buka Notifikasi',
      unread: '{count} notifikasi belum dibaca, buka Notifikasi',
    },
    wallets: {
      title: 'Dompet',
      manage: 'Kelola',
      emptyTitle: 'Dompet kosong',
      emptyBody:
        'Tambahkan dompet pertama Anda untuk mulai mencatat arus kas.',
      emptyAction: 'Tambah Dompet',
      moreRest: '+{rest} dompet lain · total {amount}',
    },
    history: {
      title: 'Riwayat',
      search: 'Cari',
    },
  },
  connectivity: {
    offline: 'Tidak ada koneksi',
  },
};

export type Dictionary = typeof id;
