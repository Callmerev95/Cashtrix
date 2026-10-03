# Roadmap Cashtrix: katalog ide lengkap

Dokumen ini menampung **semua** kandidat pengembangan beserta alasan, bukti kondisi
kode saat ini (`v2.0.0`, tag `v2.0.0`), dan urutan usul. `PRD.md` tetap sumber
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
| A7 | **Widget / quick-add** | Spec beku `specs/cashtrix-v2.0-widget.md` + ADR-0011 | Tiga tombol home screen (suara/tambah/pindai) → fast-lane; satu batch native | ✅ selesai 2026-09-29 (WG1–WG3 #70–#72, tag `v2.0.0`, Android-only) |

### B. Fitur roadmap PRD §5.1

| ID | Ide | Kondisi sekarang | Catatan | Usul |
|---|---|---|---|---|
| B1 | **Transfer antar-wallet** | enum `transfer` sudah reserved (`supabase/migrations/20260917090000_schema.sql`), sengaja di-exclude dari `v_wallet_balances` | Transfer ≠ income/expense: satu operasi menyentuh dua wallet. Model data harus diputuskan dulu (lihat §4 OPEN) | 🎯 v1.1 |
| B2 | **Recurring transactions** | belum ada | Butuh penjadwal server (pg_cron + something yang menulis) atau generasi client-side. Model "rule vs occurrence" harus diputuskan (lihat §4 OPEN) | 🎯 v1.1 |
| B3 | **Kalender penuh** | stepper hari saja (ditunda di R5.4 karena date picker native) | Polish; bisa tanpa modul native dengan grid kalender dari `View` | 🎯 v1.1 |
| B4 | **Biometric app lock** | belum ada; butuh modul native → dev-client | Q6 sudah disetujui: boleh pindah dev-client | 📦 v1.2 |
| B5 | **CSV import** | belum ada; ekspor sudah ada (`src/features/data-ownership/`) | Nilai rendah vs effort, dan butuh pemetaan kategori | 📦 v1.2 |
| B6 | **Offline outbox (tulis saat offline)** | Spec beku `specs/cashtrix-v2.x-outbox.md` + ADR-0012 (LWW buta, FIFO, antrean eksplisit) | Membalik keputusan MVP "tulis ditolak, bukan antrian buta" → lapisan sync + resolusi konflik | 🧊 rilis berikut (OB1–OB3, #74–#76, spec #73, eksekusi setelah WG3 hijau) |
| B7 | **Offline read cache** | Spec beku yang sama (baca terdegradasi: list/form cache, agregasi online-only) | Menyentuh semua screen; digabung dengan outbox agar satu model konsistensi | 🧊 rilis berikut (ikut OB1–OB3) |

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
| E2 | Multi-currency + kurs historis | Parkir (OPEN-4): default perilaku hari ini, mungkin IDR-saja permanen | Diputuskan ulang sebelum trek currency; TanStack gugur (bukan obat banyak-user) | 🚫/🧊 parkir |
| E3 | Smart insight / AI | PRD §3 sengaja kosong sampai ada evaluasi sendiri |
| E4 | Shared/household budget | Non-goal PRD §2.4 |
| E5 | Server push notification | v1.0 sengaja local-only; baru berguna bersama recurring |
| E6 | Widget, email digest, import bank statement | Non-goal |

---

## 3. Rencana rilis

### V0: Pra-rilis (dikerjakan paling depan)

Menjalankan `docs/release-gate.md` §6 + gerbang keras C1/C3/C4/C5/C7.
Dikerjakan lebih dulu karena **mengubah perilaku auth**, semua skrip
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

### V1: Instrumentasi & jalur distribusi

- `eas.json` (profil `development` / `preview` / `production`) + `expo-dev-client`.
- Sentry dengan `configureTransport` lewat seam yang sudah ada.
- Isi Data Safety (Play) + Privacy Manifest (Apple).
- `app.json` → `1.1.0`.

### V2: Transfer antar-wallet

Satu baris `type=transfer` + `counterparty_wallet_id`, `category_id` null
(ADR-0004, R8). Form Add: segmen ketiga. Menyentuh `v_wallet_balances`
(sumber −amount, tujuan +amount) dan `v_transactions_feed` (satu baris
"Transfer ke …"). Analytics / Spent / Alert tetap mengabaikan `type=transfer`.

### V3: Recurring transactions

Catch-up RPC saat app buka/foreground (ADR-0005, R8). Bulanan, Due day 1–28
atau hari terakhir bulan; plafon 12 Occurrence per Recurring rule per sesi.
Edit rule hanya mengubah yang belum lahir. Anti-ganda termasuk Soft-delete.
Occurrence identik dengan Transaction manual untuk Spent/Alert. Tidak ada
server-push di v1.1.

### V4: Nilai user langsung: undo hapus + arsip wallet

- Snackbar ~5 detik "Urungkan" setelah hapus, memanggil RPC
  `restore_transaction` yang sudah ada (termasuk Transfer). Lewat = Soft-delete
  30 hari, tanpa layar recycle bin (itu v1.2).
- Arsip/buka-arsip wallet (kolom `archived_at` sudah ada; perlu jalur tulis di
  `wallets/api.ts` + penyaring di Dashboard).

### V5: Kalender penuh + pass terminologi

- Grid kalender dari `View` (tanpa modul native, pola yang sama dengan donut T6
  dan ring T7).
- Satu pass terminologi Indonesia (katalog C8).

### V6: Gerbang v1.1

Spec + ticket ditulis saat rilis dibekukan; pola mengikuti T11
(`docs/release-gate.md`): E2E Maestro hijau, pgTAP + Jest tanpa regresi,
checklist visual, tag git `v1.1.0`.

---

## 4. Keputusan OPEN

| # | Status | Keputusan | Menghambat |
|---|---|---|---|
| OPEN-1 | closed ADR-0004 | Transfer = satu baris + `counterparty_wallet_id` | — |
| OPEN-2 | closed ADR-0005 | Recurring = catch-up RPC; semua terlewat dilahirkan; identik Spent/Alert | — |
| OPEN-3 | closed ADR-0007 | App lock = kunci perangkat saja (flag lokal; grace 60 dtk; cold start selalu kunci; biometrik + passcode OS; opt-in) | B4 v1.2 |

Transfer, Recurring, Undo, Archive, V0 auth/legal: **tertutup** (R7–R8, ADR-0004..0006). Frontier desain v1.1 kosong.

---

## 5. Yang sengaja tidak dikerjakan

- Offline outbox & read cache di v1.1, menyentuh semua screen dan melawan
  keputusan MVP "tulis ditolak, bukan antrian buta"; digabung jadi satu pekerjaan
  konsistensi di v2.0.
- CSV import di v1.1, nilai rendah dibanding biaya pemetaan kategori.
- Multi-bahasa di v1.1, dikerjakan bersama pass terminologi v1.2 supaya string
  tidak diaudit dua kali.

---

## 6. Rencana pasca-v1.1 (disetujui pemilik 2026-09-22)

v1.1.0 sudah di-tag dan di-push. Fase di bawah ini mengikat **urutan**, bukan
jadwal mati, hal-hal kecil boleh ditambahkan di tengah jalan selama tidak
melanggar prinsip §6.4. Tiap batch dibekukan jadi spec + ticket (`specs/`)
seperti v1.1 sebelum dikerjakan.

### 6.1 v1.1.x: penutup lubang (kecil, tanpa ubah perilaku)

| Urutan | Item | Kenapa sekarang | Status 2026-09-25 |
|---|---|---|---|
| 1 | Semantik transfer di CSV export | Lubang dari V6 (transfer ter-drop diam-diam); makin lama makin banyak export yang kehilangan baris. Grill singkat + satu format baris + test. | ✅ selesai (`452fdab`, verify-t9 49/49) |
| 2 | Aset store listing + mekanik `release-gate.md` §7.5 | Prasyarat submit TestFlight/Play, tanpa ini v1.1.0 tidak naik store. | ⏸️ sebagian: `docs/store-submit.md` selesai + email dukungan diisi (`83b8536`); **tunda: screenshot HP** (ikut blok store) |
| 3 | Run Maestro device | Menutup janji opsi B selagi flow + akun e2e masih segar. | ✅ selesai 2026-09-25 (smoke + happy-path hijau di HP asli, KPI `[analytics]` terbukti) |

### 6.2 v1.2 batch 1: nilai user langsung, risiko kecil

Memakai pola yang sudah ada (view/RPC + komponen):

| Urutan | Item | Alasan urutan |
|---|---|---|
| 1 | Ringkasan bulan lalu (A6) | Paling kecil, `v_monthly_summary` sudah ada, tinggal permukaan Dashboard. |
| 2 | Cari & filter riwayat (A3) | Nilai naik seiring data user bertambah; fondasi query untuk A4. |
| 3 | Bulk edit kategori (A4) | Bergantung pola filter A3; tanpa A3 dulu implementasinya duplikasi logika. |
| 4 | Inbox notifikasi (A5) | Fondasi baru diperbaiki (alert pipeline V6 + `fired_at`); tinggal flag read + layar. |
| 5 | Error handling terlihat (D4) | Robustness yang makin penting saat user riil bertambah. |

### 6.3 v1.2 batch 2: butuh keputusan / setup native

| Item | Syarat mulai |
|---|---|
| Biometric lock (B4) | Tutup dulu OPEN-3 (kunci perangkat vs state server) via grill, jangan sentuh kode sebelumnya. |
| i18n ID/EN (C6) | Paket dengan satu pass terminologi (audit string sekali saja). |
| 2FA (C2) | Supabase siap; UI sedang, antre setelah B4/C6. |
| Preloader + skeleton | Sesudah batch 1 (menyentuh semua permukaan loading → re-gate visual; jangan digabung rilis fitur). Perlu amandemen `DESIGN.md` (motion). |
| Maestro di CI (D3) | Time-box riset device farm/emulator dulu; bila mahal, tetap manual + perkuat mock test navigasi. |
| Rate limiting (D5) | Sebelum publikasi luas, bukan sebelumnya. |
| CSV import (B5) | Nilai rendah vs biaya, diputuskan **drop** 2026-09-24 (tetap di katalog, tanpa ticket; kembali hanya bila user riil meminta) |

### 6.4 Prinsip urutan (mengikat)

1. Yang menutup lubang > yang menambah permukaan.
2. Yang fondasinya sudah ada (view/RPC) > yang butuh keputusan desain (grill dulu, pola ADR).
3. Satu pass lintas-layar (terminologi, skeleton, i18n) dikerjakan sekaligus, tidak dicicil.
4. Item kecil tambahan di tengah jalan boleh masuk batch berjalan bila memenuhi 1–3; bila tidak, antre di batch berikutnya.

### 6.5 v2: payung berurutan, satu gate per rilis (revisi R11, grill 2026-09-27)

Aturan lama "v2.0 = paket arsitektur, jangan dicicil" diganti: payung v2.x
dikerjakan **berurutan, tiap rilis gate hijau sendiri** (pola Q10: satu
kegagalan tidak menahan yang lain).

| Urutan | Isi | Spec + ticket |
|---|---|---|
| **2.0.0** | Widget + fast-lane: tiga tombol home screen (suara/tambah/pindai) → deep-link existing → sheet yang sama, split-N maks 3 sejenis, notifikasi lokal khusus save-dari-widget, gate penuh, tanpa label AI | `specs/cashtrix-v2.0-widget.md` + ADR-0011, WG1 (#70) → WG2 (#71) → WG3 (#72), spec #69 |
| Berikutnya | Offline outbox + read cache = satu pekerjaan konsistensi (LWW buta + hapus-menang, FIFO sekuensial, coalesce, antrean eksplisit, baca terdegradasi), didahului spec + grill seperti v1.1 | `specs/cashtrix-v2.x-outbox.md` + ADR-0003/0012, OB1 (#74) → OB2 (#75) → OB3 (#76), spec #73, eksekusi setelah WG3 hijau |

Bank sync, multi-currency (parkir OPEN-4), AI insight antre di belakangnya
per PRD. TanStack gugur permanen untuk trek ini ("banyak user" = urusan
server: indeks/pooling/rate-limit, bukan cache klien).

### 6.6 v1.2.0: pintasan + scan struk (disetujui pemilik 2026-09-25)

Keputusan grill: tap-belakang ditangkap OS (bukan app); lampiran via
`expo-image-picker` yang sudah ada (nol rebuild); foto 30 hari lalu purge;
OCR server eksperimen, prefill-saja, satu total, saran kategori opsional.
Detail beku di `specs/cashtrix-v1.2.md` + ADR-0009. Ticket: S1 → S2 → S3 → RLS
(`specs/tickets.md`).

| Urutan | Item | Kenapa sekarang |
|---|---|---|
| S1 | Pintasan deep-link + panduan OS | Tanpa native; membuka jalan tap-belakang di semua vendor |
| S2 | Foto lampiran 30 hari | Nilai langsung tanpa tebakan OCR; fondasi Storage + tabel untuk S3 |
| S3 | OCR server eksperimen | Prefill Starbucks "AMERICANO 30.000" → 30.000; gagal = lanjut manual, mock-first + device-gate lolos (closed via PR #60) |
| RLS | Gerbang `1.2.0` | Bump minor sekali (akumulasi pasca-1.1.0 + S1–S3) + polish final UI/UX + screenshot HP (closed via PR #61, tag `v1.2.0`) |

Aturan versi (mengikat): `1.2.0` = minor ini; `2.0.0` = hanya arsitektur besar;
`1.2.x` = lubang tanpa ubah perilaku. v2.0 tetap trek terpisah, satu-satunya
titik temu: spec sync v2.0 mencakup `transaction_receipts` sebagai tipe antrean
outbox (upload tertunda + retry OCR).

### 6.7 Pasca-1.2: monetisasi scan (arah disetujui pemilik 2026-09-25, belum ticket)

S3 dikirim sebagai **plumbing + mock + seam kuota** (engine OCR riil menyusul);
skema monetisasi di bawah ini **bukan scope S3 maupun RLS**, dicatat agar
keputusan tidak hilang:

- Free: **5 scan/bulan**; kuota habis → catat manual tetap bisa (scan tidak
  pernah memblokir pencatatan).
- Langganan ±**Rp15.000/bulan** mendanai Vision pay-as-you-go: `TEXT_DETECTION`
  = 1.000 unit pertama/bulan gratis, selebihnya **$1,50/1.000** (satu scan =
  satu unit; terverifikasi dari halaman pricing resmi Google, Juli 2026).
  Unit economics aman pada pemakaian personal-finance normal (~20 scan/bulan ≈
  Rp500 biaya vs Rp15.000 harga, sebelum potongan store 15%).
- Pool 1.000 gratis bersifat **per project GCP, dipakai bersama**, sejak swap
  Vision, pengukuran **scan free vs scan subscriber dipisah** agar jebolnya
  pool terpantau.
- Seam yang ditanam S3: titik cek kuota di `scan-receipt` setelah
  `enforceRateLimit` (kini pass-through) + kontrak error beku
  `{ error: 'quota_exceeded' }` (beda dari `{ ok: false }` gagal OCR) agar
  klien kelak menampilkan prompt paywall, bukan fallback diam-diam.
- Trek penagihan terpisah (Play Billing / App Store IAP atau gateway lokal +
  entitlement **server-side**: tabel pemakaian bulanan per user dengan bulan
  ikut `profiles.timezone` + status langganan dari webhook store; klien tidak
  pernah memutuskan kuota). Angka "5 gratis" divalidasi dari data pemakaian
  riil sebelum dikunci ke store listing.
- RLS `1.2.0` **tidak mengklaim akurasi OCR** ke store; Data Safety ditulis
  apa adanya ("foto diproses sementara").

### 6.8 Pasca-1.2: Catat Suara (selesai penuh, device lolos 2026-09-27)

Spec `specs/cashtrix-voice-capture.md` + ADR-0010. Ticket VC1 (#63) → VC2
(#64) → VC3 (#65), PR squash #66/#67/#68, spec #62 closed. Tanpa bump versi
(JS-only, OTA preview runtime `1.2.0`).

Keputusan grill yang bertahan di device: STT milik OS + parser aturan lokal +
prefill-saja (satu ucapan satu transaksi, Simpan selalu manual + snackbar).
Tanpa dialog recognizer di dalam app — tak ada modul STT di bundle Expo,
maka mic membuka panel dan dikte lewat mic keyboard OS (Option A, disetujui
pemilik). Tanpa modul native baru, tanpa DDL baru, tanpa rebuild (B-OTA).

Ide v2.0 pemilik (**sudah ticket**, grill v2.0 2026-09-27): **widget Catat
Suara** + tambah + pindai, yaitu tombol di home screen yang tiap ketuknya
membuka deep-link fast-lane (tanpa tab/chrome, auto-dismiss), satu batch
rebuild native bareng long-press launcher voice. Prinsip mengikat: widget
hanya tombol (tanpa data/sesi, ADR-0011); Simpan tetap satu ketuk di app,
tebakan tak pernah menulis data kotor dari pintu belakang. Ticket WG1 (#70) → WG2 (#71) → WG3
(#72), spec #69, rilis `2.0.0`.

### 6.9 v2.0.0: widget + fast-lane + polish (rilis 2026-09-29, tag `v2.0.0`)

WG1 parser split (#70) → WG2 widget + fast-lane (#71) → WG3 gerbang (#72),
spec #69 closed. Gate: CI static + live matriks penuh hijau di commit bump,
pgTAP tak diulang (nol DDL, tercatat), rebuild preview + fresh-install,
device Redmi lolos, tag seizin pemilik.

Ikut rilis yang sama: restyle kartu widget + fix ukuran 4x2 (HyperOS),
pill Keluar danger, kartu Profile per bagian, sumur kurs + chips bersimbol,
hero obsidian + eye toggle, katalog 76 ikon, fix refresh opsi dompet (#81).
Keputusan terkunci: Android hand-rolled (tanpa dep runtime), iOS tunda,
tanpa label AI, tanpa angka/statistik fiktif di widget maupun kartu.

Berikutnya: OB1–OB3 outbox + read cache (rilis berikut, eksekusi setelah
WG3 hijau; prasyarat terpenuhi).

### 6.10 Batch B1 + AI6 (satu rebuild hemat kuota, grill 2026-10-03)

`expo-audio` (AI6) + `expo-haptics` (B1) dikompilasi sekali (ADR-0016).
`2.1.0` = Analytics Overhaul (svg yang ditangguhkan dari batch ini).
Backlog: recent search queries.
