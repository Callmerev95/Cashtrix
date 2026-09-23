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
  wallets: {
    validation: {
      nameRequired: 'Nama dompet wajib diisi',
      nameTooLong: 'Nama dompet maksimal {max} karakter',
      nameDuplicate: 'Nama dompet sudah dipakai',
      amountInvalid: 'Nominal harus antara 0 dan {max}',
      amountInvalidNumber: 'Nominal tidak valid',
      limitReached: 'Maksimal {max} dompet',
      deleteConfirm: 'Hapus dompet ini?',
      reassignRequired: 'Pilih dompet tujuan untuk memindahkan transaksi',
    },
    type: {
      bank: 'Bank',
      ewallet: 'E-Wallet',
      cash: 'Tunai',
      card: 'Kartu',
    },
    card: {
      total: 'Total Saldo',
      count: '{count} dompet',
    },
    row: {
      transactions: '{count} transaksi',
      balanceLabel: '{name}, saldo {balance}',
    },
    list: {
      back: 'Kembali',
      kicker: 'Kelola',
      title: 'Dompet',
      total: 'Total Saldo',
      count: '{count} dari {max} dompet',
      empty: 'Belum ada dompet. Buat dompet pertama Anda untuk mulai mencatat.',
      add: 'Tambah Dompet',
      archived: 'Arsip',
      deleteFail: 'Gagal menghapus dompet',
      deleteTitle: 'Hapus dompet?',
      deleteBody: '"{name}" tidak punya transaksi dan akan dihapus permanen.',
      archiveTitle: 'Arsipkan dompet?',
      archiveBody:
        '"{name}" disembunyikan dari Dashboard dan picker. Riwayat transaksi tetap ada.',
      archiveAction: 'Arsipkan',
      archiveFail: 'Gagal mengubah dompet',
      archivedOk: 'Dompet diarsipkan',
      unarchivedOk: 'Dompet dibuka dari arsip',
      archivedBody:
        '"{name}" disembunyikan dari Dashboard dan transaksi baru. Riwayatnya tetap tersimpan.',
      unarchivedBody: '"{name}" kembali tersedia.',
      archiveA11y: 'Arsipkan {name}',
      deleteA11y: 'Hapus {name}',
      unarchiveA11y: 'Buka arsip {name}',
      moveFail: 'Gagal memindahkan transaksi',
      moveDone: 'Selesai',
      moveDoneBody: '{moved} transaksi dipindahkan ke {name}.',
      moveToA11y: 'Pindahkan ke {name}',
    },
    sheet: {
      title: 'Pindahkan transaksi {name}',
      body: 'Dompet ini punya {count} transaksi. Pilih dompet tujuan, lalu dompet ini dihapus.',
      empty:
        'Tidak ada dompet lain. Buat dompet baru dulu untuk memindahkan transaksi.',
      create: 'Dompet baru',
    },
    form: {
      close: 'Tutup',
      editTitle: 'Ubah dompet',
      createTitle: 'Dompet baru',
      name: 'Nama',
      namePlaceholder: 'BCA, GoPay, Dompet…',
      type: 'Tipe',
      opening: 'Saldo Awal',
      hint: 'Maksimal {max} dompet per akun.',
      create: 'Buat Dompet',
      saveFailEdit: 'Gagal menyimpan perubahan',
      saveFailCreate: 'Gagal membuat dompet',
      noSession: 'Sesi tidak ditemukan',
    },
    loadError: 'Gagal memuat dompet',
  },
  transactions: {
    validation: {
      required: 'Nominal wajib diisi',
      invalid: 'Nominal tidak valid',
      tooLarge: 'Nominal maksimal {max}',
      tooManyDecimals: 'Maksimal 2 angka desimal',
      zero: 'Nominal harus lebih dari 0',
    },
    transfer: {
      sourceRequired: 'Pilih dompet sumber terlebih dahulu',
      destinationRequired: 'Pilih dompet tujuan terlebih dahulu',
      sameWallet: 'Dompet sumber dan tujuan harus berbeda',
      feedTo: 'Transfer ke {name}',
      feedBare: 'Transfer',
    },
    type: {
      expense: 'Pengeluaran',
      income: 'Pemasukan',
      transfer: 'Transfer',
    },
    divider: {
      today: 'Hari ini',
      yesterday: 'Kemarin',
    },
    undo: {
      label: '{name} · Rp {amount} dihapus',
      fallback: 'Transaksi',
      action: 'Urungkan',
      actionA11y: 'Urungkan penghapusan',
    },
    form: {
      loadFail: 'Gagal memuat transaksi',
      walletRequired: 'Pilih dompet terlebih dahulu',
      categoryRequired: 'Pilih kategori terlebih dahulu',
      futureDate: 'Tanggal tidak boleh di masa depan',
      saveFailEdit: 'Gagal menyimpan perubahan',
      saveFailCreate: 'Gagal menyimpan transaksi',
      deleteFail: 'Gagal menghapus',
      back: 'Kembali',
      editTitle: 'Ubah transaksi',
      createTitle: 'Transaksi baru',
      deleteA11y: 'Hapus transaksi',
      loading: 'Memuat transaksi…',
      amount: 'Nominal',
      notePlaceholder: 'Catatan (opsional): kopi pagi, transfer teman…',
      category: 'Kategori',
      categoryCount: '{count} kategori',
      wallet: 'Dompet',
      walletSource: 'Dompet sumber',
      walletEmpty: 'Belum ada dompet. Buat satu dulu di menu Dompet.',
      destination: 'Dompet tujuan',
      destinationEmpty:
        'Butuh dua dompet untuk transfer. Buat satu lagi di menu Dompet.',
      date: 'Tanggal',
      saveEdit: 'Simpan perubahan',
    },
    sheet: {
      title: 'Hapus transaksi ini?',
      body: 'Transaksi dipindahkan ke sampah dan dihapus permanen setelah 30 hari.',
      confirm: 'Hapus',
      close: 'Tutup',
    },
    history: {
      emptyDefault: 'Belum ada riwayat transaksi.',
      loading: 'Memuat riwayat…',
      emptyTitle: 'Tidak ada transaksi',
      emptyAction: 'Catat Transaksi',
      end: 'Akhir riwayat',
    },
    calendar: {
      prev: 'Bulan sebelumnya',
      next: 'Bulan berikutnya',
    },
    loadError: 'Gagal memuat transaksi',
  },
  search: {
    kind: {
      all: 'Semua',
      expense: 'Pengeluaran',
      income: 'Pemasukan',
      transfer: 'Transfer',
    },
    placeholder: 'Cari catatan, kategori, dompet…',
    idleHint:
      'Ketik untuk mencari di catatan, nama kategori, dan nama dompet — atau pilih jenis di atas.',
    error: 'Gagal mencari',
    noResult: 'Tidak ada hasil untuk "{query}".',
    noKindResults: 'Tidak ada transaksi jenis ini.',
    searching: 'Mencari…',
    resultCount: '{count} hasil',
    cancelSelect: 'Batalkan pilihan',
    selectedCount: '{count} dipilih',
    applyA11y: 'Ubah kategori yang dipilih',
    apply: 'Ubah',
    selectToggleA11y: 'Pilih beberapa transaksi',
    select: 'Pilih',
    transferHint: 'Transfer tidak punya kategori.',
    kindLocked: 'Pilihan dikunci ke {kind} — selesaikan atau batalkan dulu.',
    bulkCancelA11y: 'Batalkan ubah kategori',
    bulkConfirmA11y: 'Ubah {count} transaksi',
    bulkConfirm: 'Ubah {count} transaksi ke {name}?',
    saving: 'Menyimpan…',
    applyFail: 'Gagal mengubah kategori',
  },
  analytics: {
    range: {
      '1M': '1B',
      '3M': '3B',
      '6M': '6B',
      '1Y': '1T',
      ALL: 'Semua',
    },
    rangeA11y: 'Rentang {label}',
    walletAll: 'Semua',
    kpi: {
      expense: 'Pengeluaran',
      income: 'Pemasukan',
      net: 'Net',
    },
    section: {
      distribution: 'Distribusi Pengeluaran',
      trendDaily: 'Tren Harian',
      trendMonthly: 'Tren Bulanan',
    },
    empty: {
      title: 'Belum ada data',
      body: 'Tidak ada transaksi pada rentang ini. Coba rentang lain atau catat transaksi baru.',
    },
    monthly: {
      loading: 'Memuat ringkasan…',
      unavailable: 'Ringkasan belum tersedia.',
      openA11y: 'Ringkasan {month}, buka Analytics',
      title: 'Ringkasan bulan',
      invite:
        'Belum ada transaksi bulan ini — catat yang pertama lewat tombol +.',
    },
    loadError: 'Gagal memuat analytics',
  },
};

export type Dictionary = typeof id;
