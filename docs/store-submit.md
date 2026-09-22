# Paket Submit Store — Cashtrix v1.1.0 (jalur gratis)

Keputusan pemilik 2026-09-22: submit berbayar **ditunda** sampai app selesai
keseluruhan. Dokumen ini menyiapkan semua yang gratis (copy, jawaban
kepatuhan, inventaris aset) + jalur distribusi gratis + langkah persis saat
budget ada. Sumber teknis: `app.json`, `docs/legal/*` (live), `DESIGN.md`,
`docs/release-gate.md` §7.3–§7.5.

## 1. Status distribusi saat ini (gratis)

| Jalur | Status | Kegunaan |
|---|---|---|
| APK preview sideload (`eas build --profile preview`) | ✅ jalan | Testing pribadi/teman — kirim file APK, izinkan install dari sumber tak dikenal sekali |
| OTA `eas update --channel preview` | ✅ jalan | Update JS ±1 menit tanpa reinstall |
| Expo Go | ✅ jalan | Kerja JS harian |
| Play Store / TestFlight | ⏸️ tunda ($25 sekali / $99 per tahun) | Lihat §6 saat budget ada |

## 2. Identitas app (dari `app.json` — jangan diubah sembarangan)

- Nama: **Cashtrix** · versi **1.1.0** · orientasi portrait · dark-only
- Android `package` / iOS `bundleIdentifier`: `com.callmerev95.cashtrix`
  (mengganti ini = app baru di store — jangan pernah)
- Scheme deep link: `cashtrix://` (dipakai konfirmasi email + reset password)

## 3. Copy listing (draf siap tempel, ID primer)

**Judul (≤30 karakter Play / ≤30 Apple):** `Cashtrix — Catat Keuangan`

**Deskripsi singkat Play (≤80):**
`Catat income, expense, dan transfer antar-dompet. Budget per kategori dengan pengingat otomatis.`

**Deskripsi penuh (draf, sunting sebelum submit):**
```
Cashtrix adalah catatan keuangan pribadi yang cepat dan jujur.

• Tambah transaksi dalam <20 detik: Expense, Income, Transfer antar-dompet
• Transfer satu baris — saldo gabungan tidak berubah, analitik tidak berbohong
• Tagihan bulanan otomatis lewat aturan berulang (catch-up saat app dibuka)
• Budget per kategori + pengingat saat 80% dan 100%
• Kalender penuh, arsip dompet, urungkan hapus 10 detik
• Data milikmu: ekspor CSV + hapus akun permanen dari dalam app

Tanpa iklan, tanpa penjualan data. Butuh koneksi untuk menyimpan.
```

**Kategori store:** Keuangan/Finance. **Rating konten:** 4+ / Everyone
(tanpa konten sensitif, tanpa konten buatan user yang dibagikan, tanpa chat).

**Kontak developer (TODO pemilik — wajib diisi saat submit):**
email dukungan + (opsional) situs. Penghapusan data: in-app
(Profile → Hapus akun), jadi tidak perlu URL penghapusan terpisah.

## 4. Inventaris aset

| Aset | Status | Catatan |
|---|---|---|
| Ikon 1024 (`assets/icon.png`) | ✅ ada | Dipakai store + device |
| Adaptive icon Android (foreground/background/mono) | ✅ ada | |
| Splash (`assets/splash-icon.png`) | ✅ ada | |
| Privacy Policy + Terms (EN, GitHub Pages) | ✅ live 200 | `https://callmerev95.github.io/Cashtrix/privacy.html` dan `.../terms.html` — URL yang sama dibuka in-app |
| Screenshot HP (min 2 Play; set App Store 6.5"+5.5") | ❌ TODO pemilik | Ambil di HP: Dashboard, Add, Analytics, Budgets, Recurring — tanpa data asli |
| Feature graphic Play 1024×500 | ❌ TODO pemilik | Satu banner: logo + tagline di atas, latar `#0A0A0A` + aksen gold `#D4AF37` (token `DESIGN.md` §1) |

## 5. Data Safety Play (jawaban final, siap salin)

- Email developer: **[TODO — email pemilik]**
- Kebijakan privasi: URL §4. Penghapusan akun: **ya, in-app**.
- Data dikumpulkan: email (login), info keuangan yang diketik user
  (transaksi, budget, aturan berulang), log crash.
- Dibagikan ke pihak ketiga: **tidak** (Supabase = prosesor penyimpanan,
  Sentry = prosesor crash — bukan bagi-data).
- Iklan / penjualan data: **tidak ada**.
- Enkripsi transit: **ya** (HTTPS/TLS ke Supabase + Sentry).
- Target anak: **tidak**.

## 6. Jawaban Apple (siap salin)

- **Tracking (`NSPrivacyTracking`): false.** Endpoint hanya Supabase
  (fungsionalitas) dan Sentry (crash) — untuk tujuan app, bukan pelacakan
  lintas-app. Tidak ada ID iklan.
- **Privacy label:** Contact Info (email) + Financial Info (transaksi/budget
  + crash log) — keduanya *tidak dibagikan ke pihak ketiga*, untuk
  fungsionalitas app.
- **Required-reason API:** dipakai tidak langsung via Expo SDK/AsyncStorage
  (`UserDefaults`, file timestamps). Manifest final digabung otomatis oleh
  EAS prebuild dari manifest tiap paket — verifikasi sebelum submit:
  `npx expo prebuild --clean`, periksa
  `ios/Cashtrix/PrivacyInfo.xcprivacy`, cocokkan dengan App Store Connect.
- **Export compliance (enkripsi):** HTTPS standar saja → **exempt**
  (`ITSAppUsesNonExemptEncryption = false`).

## 7. Saat budget ada (langkah submit, berurutan)

1. Daftar Play Console ($25) / Apple Developer ($99) — isi email §3 + URL §4.
2. `eas build --profile production --platform android` (AAB) dan
   `--platform ios`, submit: `eas submit -p android` / `-p ios`.
3. Tempel copy §3 + aset §4 + jawaban §5/§6 apa adanya.
4. Pantau crash-free di dashboard Sentry pasca-rilis.
