# Spec: Cashtrix voice capture (Catat Suara)

Sumber: grill 2026-09-27, `PRD.md` D1–D11 + R1–R10, `CONTEXT.md`, ADR-0010,
`specs/cashtrix-v1.2.md` (preseden S1 pintu + S3 prefill-saja).
Istilah mengikuti `CONTEXT.md`. Jangan drift ke daftar `_Avoid_`.

## Problem Statement

Pengguna mencatat 5+ transaksi/minggu dan sering memakai HP satu tangan: tangan
sibuk di pasar atau sedang berkendara. Tiap catat harus: buka app, tap FAB,
pilih tipe, ketik nominal, pilih dompet, pilih kategori. Keinginan "ngomong
langsung kecatat" tidak bisa berarti auto-save: tebakan parser yang salah
menulis data kotor tanpa tombol koreksi.

## Solution

Rilis voice capture v1: **STT milik OS + parser aturan + prefill**. App membuka
recognizer OS, menerima teks, membaca nominal digit-ID, lalu mengisi sheet
konfirmasi. User mengetuk Dompet (ketuk 1, terisi awal dari sebutan di ucapan)
dan Simpan (ketuk 2). Picker kategori selalu tampil dengan saran sebagai
pilihan awal. Gagal dengar atau gagal parse jatuh ke isi manual. Satu ucapan
satu transaksi. Tanpa modul native baru, tanpa rebuild (B-OTA).

## User Stories

### VC1: Pintu masuk (tanpa rebuild)

1. Sebagai pengguna, saya ingin tombol mic di form Add membuka recognizer OS,
   agar saya bisa bicara tanpa mengetik nominal.
2. Sebagai pengguna, saya ingin deep link `cashtrix://voice` membuka sheet
   voice langsung (mic ikut terbuka), agar Back Tap / Quick Tap bisa
   menargetkannya seperti pintu S1.
3. Sebagai pengguna, saya ingin baris panduan voice di layar Pintasan,
   agar setup gesture OS sekali jalan (ID/EN).
4. Sebagai pengguna terkunci / belum login / belum confirm / MFA, saya ingin
   pintu voice parkir di gate yang benar, agar voice tidak pernah bypass
   keamanan.

### VC2: Ucap, konfirmasi, simpan

5. Sebagai pengguna, saya ingin teks hasil ucapan tampil di sheet sebelum
   disimpan ("soto mie 25rb pakai gopay"), agar saya tahu apa yang didengar app.
6. Sebagai pengguna, saya ingin sebutan dompet di ucapan menjadi dompet
   terpilih awal dan tetap bisa diganti lewat picker, agar benar hemat satu
   ketuk dan salah tidak merugikan.
7. Sebagai pengguna, saya ingin picker kategori selalu tampil dengan saran
   sebagai pilihan awal (kind ikut tipe terdeteksi), agar tebakan kategori
   tidak pernah dipercaya buta.
8. Sebagai pengguna, saya ingin mengetuk Dompet lalu Simpan dan melihat
   snackbar sukses pola app, agar tanpa modal baru dan tanpa izin notifikasi.
9. Sebagai pengguna yang ucapannya gagal didengar atau gagal diparse, saya
   ingin pesan jelas ("Sebutkan angkanya, mis. 30 ribu") plus fallback ketik
   manual, agar voice tidak pernah memblokir pencatatan.

### VC3: Batas parser v1

10. Sebagai pengguna, saya ingin nominal digit-ID dipahami (`30.000`,
    `30 ribu`, `25rb`, `Rp30.000`), agar cara saya menyebut harga sehari-hari
    lolos.
11. Sebagai pengguna yang mengucap dua item ("nasi padang 30rb dan kopi 12rb"),
    saya ingin pesan "sebutkan satu per satu", agar tidak ada split diam-diam.
12. Sebagai pengguna yang mengucap kata-bilangan murni ("tiga puluh ribu"),
    saya ingin penolakan jujur plus fallback ketik, agar tahu batas v1.
13. Sebagai pengguna, saya ingin tipe expense sebagai default dan income
    dikenali dari kata kunci kecil ("gaji", "dapat", "masuk"), agar
    "gajian 5 juta" tidak tercatat sebagai belanja.
14. Sebagai pengguna, saya ingin ucapan transfer ditolak eksplisit
    ("transfer pakai form"), agar tidak ada tebak-tebakan dua dompet.

## Implementation Decisions

**Terkunci (jangan dibuka ulang di kode):** PRD D1–D11, R1–R10, ADR-0001..0010,
`CONTEXT.md`.

**Urutan kerja:** VC1 → VC2 → VC3 berurutan. Trunk `main`, PR squash per
ticket. Tanpa bump versi khusus (ikut rilis berjalan).

**Pintu (VC1, B-OTA):**
- Skema `cashtrix` sudah ada (`app.json`). Tambah rute deep-link
  `cashtrix://voice` mengikuti pola `/scan` (alias → form Add mode voice,
  mic auto-buka; bila STT tak tersedia langsung mode ketik).
- Tidak ada item long-press launcher di rilis ini (butuh manifest + rebuild,
  antre batch native bareng widget). Tidak ada widget.
- Auth gate + `LockOverlay` tetap satu-satunya penentu parkir.
- `testID` kontrak statis: `voice-mic`, `voice-sheet`, `voice-save`
  (ikut `verify-t11.mjs --static-only`, tanpa hapus ID lama).

**Sheet + parser (VC2/VC3):**
- STT = intent recognizer OS (`id-ID` dulu). App menerima teks, bukan audio.
  Tidak ada rekaman tersimpan, tidak ada upload audio.
- Parser murni lokal di `src/features/voice/domain.ts` (seam Jest):
  nominal digit-ID (reuse pola parse S3), deteksi multi-nominal → tolak,
  deteksi kata-bilangan murni → tolak jujur, keyword income kecil, sebutan
  dompet cocok substring terhadap dompet aktif, hint kategori opsional.
- Saran dompet/kategori = preselect picker, bukan nilai kunci. Kind grid
  kategori ikut tipe terdeteksi. Transfer = pesan tolak, bukan parse.
- Idempotency key sekali per sesi sheet (pola AC #22), retry simpan tidak
  double-post. Simpan memakai jalur `createTransaction` yang ada, lalu
  refresh wallets/transactions/budgets/analytics + `evaluateAndAlert`
  (pola pasca-save).
- i18n: semua copy voice lewat kamus `src/i18n/{id,en}.ts` (ADR-0008); leaf
  tidak impor i18n.

**Agregasi & desain:** tidak ada perubahan agregasi (saldo/Spent/KPI tetap
server). Token `theme.ts` saja; hex di komponen = lint error. Tidak ada tab baru.

## Testing Decisions

**Kriteria test yang baik:** perilaku eksternal. Kebenaran dilihat dari teks
masuk sheet benar, preselect benar, tolak-jujur muncul saatnya, transaksi
tunggal tersimpan, bukan dari struktur internal.

**Tiga seam (jangan tambah):**

1. **Parser murni (Jest, ≥90% folder domain):** varian digit ID lolos,
   multi-nominal ditolak, kata-bilangan murni ditolak, keyword income,
   transfer ditolak, substring dompet (aktif saja).
2. **Gate + kontrak statis:** Jest navigation (voice saat locked/unconfirmed/
   MFA parkir benar) + `verify-t11 --static-only` (tambah 3 testID).
3. **Simpan sekali:** key idempotency per sesi sheet; retry tidak ganda
   (pola `createTransaction` 23505).

**Pelengkap, bukan seam desain:** Maestro (mic → sheet → dompet → simpan 1
transaksi; tolak multi-item → pesan); `expo export`; Sentry tanpa
`amount`/`note`/teks ucapan mentah.

## Addendum Fase 1 AI (AI1-AI5, Oktober 2026)

STT tetap milik OS (mic keyboard atau ketik); teks dikte kini dikirim ke
Edge `parse-voice` (maks 500 karakter) dengan consent-once terpisah
(`cashtrix:voice-consent-v1`, device-local, di luar purge sign-out).
Konteks disuntik server dari `user_id` (dompet aktif, kategori visible,
timezone). Hasil = prefill saja, Simpan manual wajib, tanpa auto-save.
Gagal model = `{ ok: false }` lalu fallback parser lokal diam-diam.
Dokumen legal v2.0.0 (3 Oktober 2026) + `verify-legal.mjs` jadi syarat gate.

## Out of Scope

- Widget home-screen, item long-press launcher (antre batch native).
- Split satu ucapan jadi N transaksi.
- Kata-bilangan Indonesia ("tiga puluh ribu", "setengah juta").
- Keyword income Inggris; transfer via suara.
- Modal sukses + notifikasi sistem; simpan/unggah audio.
- STT server-side; bahasa selain ID di v1.
- Offline outbox + read cache (trek v2.0, ADR-0003).
