# Roadmap Cashtrix — katalog ide lengkap

Dokumen ini menampung **semua** kandidat pengembangan beserta alasan, bukti kondisi
kode saat ini (`v1.0`, commit `492a117`), dan urutan usul. `PRD.md` tetap sumber
keputusan produk; dokumen ini sumber *antrean* pekerjaan.

Aturan: ide boleh masuk katalog tanpa komitmen rilis. Setiap rilis mengambil
irisan dari sini dan dibekukan sebagai spec + ticket (`specs/`).

Legenda status: `✅ dikerjakan` · `🎯 v1.1` · `📦 v1.2` · `🧊 v2.0` · `🚫 ditolak`

---

## 1. Keputusan rilis v1.1

Diambil 2026-09-19 dari sesi grill. Paket = **rilis yang benar-benar bisa naik store**,
bukan penambahan fitur maksimal.

Prinsip yang dipakai:

1. Tanpa instrumentasi crash nyata dan jalur distribusi, menambah fitur tidak
   membuat rilis jadi mungkin.
2. Penolak store (reset password, halaman privasi) dikerjakan sebelum fitur baru.
3. Perubahan perilaku auth dikerjakan **di depan**, karena ia mengubah bentuk
   seluruh skrip verifikasi dan E2E.

### Gerbang keras (hard blocker) menuju store

| # | Penghambat | Bukti |
|---|---|---|
| 1 | Crash-free rate tidak terukur | `src/features/observability/observability.ts` masih transport ring buffer + `console.info`; komentarnya sendiri menyebut perlu `@sentry/react-native` |
| 2 | Tidak ada jalur distribusi | `eas.json` tidak ada di repo |
| 3 | Reset password tidak ada | `grep -i "resetPassword"` di `src/` + `app/` = 0 hasil |
| 4 | Tidak ada halaman privasi/ToS | tidak ada route maupun file kebijakan |
| 5 | Konfirmasi email masih auto | `docs/release-gate.md` §6 item pertama belum dicentang |
| 6 | Kepatuhan data store belum diisi | belum ada Data Safety (Play) / Privacy Manifest (Apple) |

---

## 2. Katalog ide

### A. Nilai user langsung

| ID | Ide | Kondisi sekarang (bukti) | Kenapa layak | Usul |
|---|---|---|---|---|
| A1 | **Undo hapus transaksi** | `restoreTransaction()` ada di `src/features/transactions/api.ts`, tidak ada UI pemanggil; retensi 30 hari sudah jalan | Salah hapus = kehilangan data yang sebenarnya bisa dibatalkan | 🎯 v1.1 |
| A2 | **Arsip wallet** | `v_wallet_balances` mengirim `archived_at`, tapi `src/features/wallets/api.ts` tidak punya jalur arsip; hapus wallet ditolak FK | Wallet lama bikin Dashboard berisik; arsip menyembunyikan tanpa menghapus riwayat | 🎯 v1.1 |
| A3 | **Cari & filter riwayat** | `grep -i search` di `src/` = 0 hasil; filter hanya di Analytics | Ribuan transaksi = tanpa cari, riwayat kehilangan nilainya | 📦 v1.2 |
| A4 | **Bulk edit kategori** | belum ada | Salah kategori pada 20 transaksi = 20 kali buka form | 📦 v1.2 |
| A5 | **Inbox notifikasi** | `budget_alerts` punya `fired_at` + indeks user/month, tanpa flag read | Alert yang lewat = hilang; butuh riwayat in-app | 📦 v1.2 |
| A6 | **Ringkasan bulan lalu** | `v_monthly_summary` sudah ada, Dashboard belum memakainya | Menjawab "bulan ini lebih baik dari bulan lalu?" tanpa buka Analytics | 📦 v1.2 |
| A7 | **Widget / quick-add** | Non-goal eksplisit PRD §2.4 | Menambah permukaan native + biaya build | 🧊 v2.0 |

### B. Fitur roadmap PRD §5.1

| ID | Ide | Kondisi sekarang | Catatan | Usul |
|---|---|---|---|---|
| B1 | **Transfer antar-wallet** | enum `transfer` sudah reserved (`supabase/migrations/20260917090000_schema.sql`), sengaja di-exclude dari `v_wallet_balances` | Transfer ≠ income/expense: satu operasi menyentuh dua wallet. Model data harus diputuskan dulu (lihat §4 OPEN) | 🎯 v1.1 |
| B2 | **Recurring transactions** | belum ada | Butuh penjadwal server (pg_cron + something yang menulis) atau generasi client-side. Model "rule vs occurrence" harus diputuskan (lihat §4 OPEN) | 🎯 v1.1 |
| B3 | **Kalender penuh** | stepper hari saja (ditunda di R5.4 karena date picker native) | Polish; bisa tanpa modul native dengan grid kalender dari `View` | 🎯 v1.1 |
| B4 | **Biometric app lock** | belum ada; butuh modul native → dev-client | Q6 sudah disetujui: boleh pindah dev-client | 📦 v1.2 |
| B5 | **CSV import** | belum ada; ekspor sudah ada (`src/features/data-ownership/`) | Nilai rendah vs effort, dan butuh pemetaan kategori | 📦 v1.2 |
| B6 | **Offline outbox (tulis saat offline)** | MVP: tulis butuh koneksi; tidak ada `expo-sqlite` di `package.json` | Membalik keputusan MVP "tulis ditolak, bukan antrian buta" → lapisan sync + resolusi konflik | 🧊 v2.0 |
| B7 | **Offline read cache** | tidak ada; `expo-sqlite` disebut di komentar `src/supabase/client.ts` tapi belum dipakai | Menyentuh semua screen; digabung dengan outbox agar satu model konsistensi | 🧊 v2.0 |

### C. Kesiapan rilis / store

| ID | Ide | Kondisi sekarang | Catatan | Usul |
|---|---|---|---|---|
| C1 | **Reset password (lupa password)** | tidak ada | Wajib; tanpa ini lupa password = kehilangan akun permanen | 🎯 v1.1 |
| C2 | **2FA (TOTP)** | belum ada | Supabase Auth siap; UI belum | 📦 v1.2 |
| C3 | **Konfirmasi email aktif** | `docs/release-gate.md` §6 belum dicentang | Mengubah perilaku register | 🎯 v1.1 |
| C4 | **Gate "email belum diverifikasi"** | belum ada UI state-nya | Konsekuensi C3 | 🎯 v1.1 |
| C5 | **Kebijakan privasi + ToS + link store** | tidak ada | Ditolak store tanpa ini | 🎯 v1.1 |
| C6 | **Lokalisasi ID/EN** | string hardcode Indonesia; PRD Epic E menjanjikan body notifikasi sesuai bahasa OS | Janji PRD yang belum ditepati | 📦 v1.2 |
| C7 | **Kepatuhan data store (Data Safety / Privacy Manifest)** | belum diisi | Gerbang keras | 🎯 v1.1 |
| C8 | **Perbaikan terminologi** | `app/add-transaction.tsx:408` menulis "menu Dompet" tapi layar lain menulis "Wallet"; layar budget memakai "Budget" (Inggris) bukan "Anggaran" | Inkonsistensi kecil yang terlihat langsung oleh user | 🎯 v1.1 (satu pass) |

### D. Teknis / non-fungsional

| ID | Ide | Kondisi sekarang | Catatan | Usul |
|---|---|---|---|---|
| D1 | **Sentry nyata + `configureTransport`** | `observability.ts` = ring buffer; titik sambung sudah disiapkan | Penutup KPI crash-free ≥99.5% | 🎯 v1.1 |
| D2 | **Pipeline EAS + `eas.json`** | tidak ada `eas.json`; `.gitignore` sudah mengecualikan `/ios` `/android` | Prasyarat TestFlight/Play dan dev-client | 🎯 v1.1 |
| D3 | **E2E Maestro di CI** | `.github/workflows/release-gate.yml` jalan tanpa device; run Maestro manual | Regresi v1.1 tidak tertangkap otomatis | 📦 v1.2 |
| D4 | **Penanganan error yang terlihat** | semua fetch best-effort; tidak ada indikator "gagal sync" | User tidak pernah tahu datanya belum terkirim | 📦 v1.2 |
| D5 | **Rate limiting / abuse guard di Edge Functions** | belum ada | Risiko rendah selama skala kecil | 📦 v1.2 |
| D6 | **Migration squash + baseline** | 7 file migrasi berurutan; `supabase/migrations/0001_schema.sql` disebut PRD tapi tidak ada di repo (dokumen usang) | Kebersihan; tidak mendesak | 🧊 v2.0 |
| D7 | **Store listing (aset, screenshot, deskripsi)** | belum ada | Bagian dari C5/C7 | 🎯 v1.1 |

### E. Sesudah v1.1

| ID | Ide | Alasan tunda |
|---|---|---|
| E1 | Bank sync / Open Finance | v2.0 (PRD D3); butuh compliance review |
| E2 | Multi-currency + kurs historis | v2.0 (PRD D5) |
| E3 | Smart insight / AI | PRD §3 sengaja kosong sampai ada evaluasi sendiri |
| E4 | Shared/household budget | Non-goal PRD §2.4 |
| E5 | Server push notification | v1.0 sengaja local-only; baru berguna bersama recurring |
| E6 | Widget, email digest, import bank statement | Non-goal |

---

## 3. Rencana rilis

### V0 — Pra-rilis (dikerjakan paling depan)

Menjalankan `docs/release-gate.md` §6 + gerbang keras C1/C3/C4/C5/C7.
Dikerjakan lebih dulu karena **mengubah perilaku auth** — semua skrip
`scripts/verify-*.mjs` dan `.maestro/flows/*.yaml` ikut berubah, jadi lebih murah
sekali jalan.

- Konfirmasi email manual. Auth gate menahan session tanpa `email_confirmed_at`
  di layar "Cek email" (bukan tabs); tombol kirim ulang; deep link konfirmasi
  → tabs. E2E menandai akun uji terkonfirmasi via Admin API.
- Reset password: tautan email Supabase → deep link `cashtrix://reset-password`.
- Privasi + ToS di GitHub Pages (`docs/legal/`); in-app dan store listing
  memakai URL yang sama (ADR-0006).
- Bersihkan akun uji (`delete from auth.users where email like '%cashtrix.test';`).
- Catat versi + tanggal di catatan rilis.

### V1 — Instrumentasi & jalur distribusi

- `eas.json` (profil `development` / `preview` / `production`) + `expo-dev-client`.
- Sentry dengan `configureTransport` lewat seam yang sudah ada.
- Isi Data Safety (Play) + Privacy Manifest (Apple).
- `app.json` → `1.1.0`.

### V2 — Transfer antar-wallet

Satu baris `type=transfer` + `counterparty_wallet_id`, `category_id` null
(ADR-0004, R8). Form Add: segmen ketiga. Menyentuh `v_wallet_balances`
(sumber −amount, tujuan +amount) dan `v_transactions_feed` (satu baris
"Transfer ke …"). Analytics / Spent / Alert tetap mengabaikan `type=transfer`.

### V3 — Recurring transactions

Catch-up RPC saat app buka/foreground (ADR-0005, R8). Bulanan, Due day 1–28
atau hari terakhir bulan; plafon 12 Occurrence per Recurring rule per sesi.
Edit rule hanya mengubah yang belum lahir. Anti-ganda termasuk Soft-delete.
Occurrence identik dengan Transaction manual untuk Spent/Alert. Tidak ada
server-push di v1.1.

### V4 — Nilai user langsung: undo hapus + arsip wallet

- Snackbar ~5 detik "Urungkan" setelah hapus, memanggil RPC
  `restore_transaction` yang sudah ada (termasuk Transfer). Lewat = Soft-delete
  30 hari, tanpa layar recycle bin (itu v1.2).
- Arsip/buka-arsip wallet (kolom `archived_at` sudah ada; perlu jalur tulis di
  `wallets/api.ts` + penyaring di Dashboard).

### V5 — Kalender penuh + pass terminologi

- Grid kalender dari `View` (tanpa modul native, pola yang sama dengan donut T6
  dan ring T7).
- Satu pass terminologi Indonesia (katalog C8).

### V6 — Gerbang v1.1

Spec + ticket ditulis saat rilis dibekukan; pola mengikuti T11
(`docs/release-gate.md`): E2E Maestro hijau, pgTAP + Jest tanpa regresi,
checklist visual, tag git `v1.1.0`.

---

## 4. Keputusan OPEN

| # | Status | Keputusan | Menghambat |
|---|---|---|---|
| OPEN-1 | closed ADR-0004 | Transfer = satu baris + `counterparty_wallet_id` | — |
| OPEN-2 | closed ADR-0005 | Recurring = catch-up RPC; semua terlewat dilahirkan; identik Spent/Alert | — |
| OPEN-3 | OPEN, diparkir v1.2 | App lock: kunci perangkat saja vs state server | B4 v1.2 |

Transfer, Recurring, Undo, Archive, V0 auth/legal: **tertutup** (R7–R8, ADR-0004..0006). Frontier desain v1.1 kosong.

---

## 5. Yang sengaja tidak dikerjakan

- Offline outbox & read cache di v1.1 — menyentuh semua screen dan melawan
  keputusan MVP "tulis ditolak, bukan antrian buta"; digabung jadi satu pekerjaan
  konsistensi di v2.0.
- CSV import di v1.1 — nilai rendah dibanding biaya pemetaan kategori.
- Multi-bahasa di v1.1 — dikerjakan bersama pass terminologi v1.2 supaya string
  tidak diaudit dua kali.

---

## 6. Rencana pasca-v1.1 (disetujui pemilik 2026-09-22)

v1.1.0 sudah di-tag dan di-push. Fase di bawah ini mengikat **urutan**, bukan
jadwal mati — hal-hal kecil boleh ditambahkan di tengah jalan selama tidak
melanggar prinsip §6.4. Tiap batch dibekukan jadi spec + ticket (`specs/`)
seperti v1.1 sebelum dikerjakan.

### 6.1 v1.1.x — penutup lubang (kecil, tanpa ubah perilaku)

| Urutan | Item | Kenapa sekarang |
|---|---|---|
| 1 | Semantik transfer di CSV export | Lubang dari V6 (transfer ter-drop diam-diam); makin lama makin banyak export yang kehilangan baris. Grill singkat + satu format baris + test. |
| 2 | Aset store listing + mekanik `release-gate.md` §7.5 | Prasyarat submit TestFlight/Play — tanpa ini v1.1.0 tidak naik store. |
| 3 | Run Maestro device | Menutup janji opsi B selagi flow + akun e2e masih segar. |

### 6.2 v1.2 batch 1 — nilai user langsung, risiko kecil

Memakai pola yang sudah ada (view/RPC + komponen):

| Urutan | Item | Alasan urutan |
|---|---|---|
| 1 | Ringkasan bulan lalu (A6) | Paling kecil — `v_monthly_summary` sudah ada, tinggal permukaan Dashboard. |
| 2 | Cari & filter riwayat (A3) | Nilai naik seiring data user bertambah; fondasi query untuk A4. |
| 3 | Bulk edit kategori (A4) | Bergantung pola filter A3; tanpa A3 dulu implementasinya duplikasi logika. |
| 4 | Inbox notifikasi (A5) | Fondasi baru diperbaiki (alert pipeline V6 + `fired_at`); tinggal flag read + layar. |
| 5 | Error handling terlihat (D4) | Robustness yang makin penting saat user riil bertambah. |

### 6.3 v1.2 batch 2 — butuh keputusan / setup native

| Item | Syarat mulai |
|---|---|
| Biometric lock (B4) | Tutup dulu OPEN-3 (kunci perangkat vs state server) via grill — jangan sentuh kode sebelumnya. |
| i18n ID/EN (C6) | Paket dengan satu pass terminologi (audit string sekali saja). |
| 2FA (C2) | Supabase siap; UI sedang — antre setelah B4/C6. |
| Preloader + skeleton | Sesudah batch 1 (menyentuh semua permukaan loading → re-gate visual; jangan digabung rilis fitur). Perlu amandemen `DESIGN.md` (motion). |
| Maestro di CI (D3) | Time-box riset device farm/emulator dulu; bila mahal, tetap manual + perkuat mock test navigasi. |
| Rate limiting (D5) | Sebelum publikasi luas — bukan sebelumnya. |
| CSV import (B5) | Nilai rendah vs biaya — paling akhir, atau drop. |

### 6.4 Prinsip urutan (mengikat)

1. Yang menutup lubang > yang menambah permukaan.
2. Yang fondasinya sudah ada (view/RPC) > yang butuh keputusan desain (grill dulu, pola ADR).
3. Satu pass lintas-layar (terminologi, skeleton, i18n) dikerjakan sekaligus, tidak dicicil.
4. Item kecil tambahan di tengah jalan boleh masuk batch berjalan bila memenuhi 1–3; bila tidak, antre di batch berikutnya.

### 6.5 v2.0 — paket arsitektur, jangan dicicil

Offline outbox + read cache = satu pekerjaan konsistensi (satu model sync +
resolusi konflik), didahului spec + grill seperti v1.1. Widget, bank sync,
multi-currency, AI insight antre di belakangnya per PRD.
