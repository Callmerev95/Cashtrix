# Spec — Cashtrix v1.2 (Pintasan + Scan Struk)

Sumber: grill 2026-09-25, `PRD.md` D1–D11 + R1–R10, `CONTEXT.md`, `docs/roadmap.md` §6.6, ADR-0009, `DESIGN.md`.
Istilah mengikuti `CONTEXT.md`. Jangan drift ke daftar `_Avoid_`.

v1.1.0 sudah di-tag. Semua yang selesai pasca-1.1.0 (A3–A6, B4, C2, C6, D3–D5, skeleton) plus
rilis ini dikumpulkan jadi **satu bump minor → `1.2.0`** (`app.json` + `package.json`).
Perubahan besar arsitektur (offline outbox + read cache) tetap trek terpisah → `2.0.0`.

## Problem Statement

Evelyn mencatat 5+ transaksi/minggu, tapi tiap catat harus: buka app → tunggu Dashboard →
tap FAB → pilih tipe → ketik nominal. Untuk struk belanja (misal Starbucks Americano
Rp 30.000) ia mengetik ulang apa yang sudah tercetak. Keinginan "ketuk belakang HP 3x
langsung catat" tidak bisa dibangun di dalam app secara andal lintas-vendor (iOS Back Tap
vs Pixel Quick Tap vs Samsung RegiStar vs MIUI tanpa gesture) tanpa Accessibility Service
native yang sensitif izin dan ketat review store.

## Solution

Rilis v1.2: **pintasan OS-level** (tap-belakang ditangkap OS, app hanya sediakan pintu
deep-link + App Shortcuts) dan **scan struk bertahap** — Fase 1 foto lampiran 30 hari via
`expo-image-picker` yang sudah ada (nol rebuild), Fase 2 OCR server eksperimen yang hanya
prefill (tanpa auto-save), satu total, saran kategori opsional.

## User Stories

### S1 — Pintasan deep-link (tanpa modul native baru)

1. Sebagai pengguna, saya ingin deep link `cashtrix://add-transaction?type=expense|income`
   membuka form Add dengan segmen terpilih, agar Back Tap / Quick Tap bisa menargetkannya.
2. Sebagai pengguna, saya ingin deep link `cashtrix://scan` membuka form Add langsung
   di mode lampiran/foto, agar shortcut scan satu ketuk.
3. Sebagai pengguna, saya ingin long-press icon app menampilkan "Tambah Expense / Income /
   Scan" (App Shortcuts), agar HP tanpa gesture tap-belakang tetap punya jalan cepat.
4. Sebagai pengguna, saya ingin panduan 1 halaman (ID/EN) cara menempelkan Shortcut ke
   Back Tap iPhone / Quick Tap Pixel / Back-Tap Samsung, agar setup sekali jalan.
5. Sebagai pengguna terkunci (B4) / belum login / belum confirm / MFA, saya ingin pintasan
   tetap parkir di gate yang benar (biometrik → Login → Cek email → challenge), agar
   pintasan tidak pernah bypass keamanan.

### S2 — Foto lampiran struk 30 hari (tanpa OCR)

6. Sebagai pengguna di form Add, saya ingin tombol "Foto struk" memakai kamera/galeri
   via `expo-image-picker`, agar tanpa modul native baru dan tanpa rebuild.
7. Sebagai pengguna, saya ingin foto tersimpan di bucket privat `receipts/{userId}/`
   (≤2MB, resize sebelum upload, pola avatar T8), agar bukti tidak tercampur avatar.
8. Sebagai pengguna, saya ingin foto bisa diambil sebelum transaksi disimpan (lalu
   ditautkan saat save), agar alur scan → koreksi → simpan tetap <20 detik.
9. Sebagai pengguna, saya ingin lampiran otomatis hilang 30 hari setelah diambil
   (sejajar retensi soft-delete), tanpa layar recycle bin, agar Storage tidak membengkak
   dan privasi terjaga. Riwayat transaksi tetap.
10. Sebagai pengguna, saya ingin thumbnail struk terlihat di form + bisa dihapus sebelum
    save, agar salah foto bisa diulang tanpa menyimpan transaksi sampah.

### S3 — OCR server eksperimen (prefill saja)

11. Sebagai pengguna, saya ingin hasil scan hanya **prefill** (amount + merchant + tanggal
    + saran kategori) yang semuanya bisa dikoreksi, lalu saya tekan Simpan manual, agar
    OCR yang salah tidak menulis data kotor (contoh: "AMERICANO 30.000" → 30.000).
12. Sebagai pengguna, saya ingin saran kategori (misal "Makanan") bersifat opsional —
    bisa diterima atau diganti manual ke kategori lain, agar 1 ketuk lebih cepat tapi
    tidak memaksa.
13. Sebagai pengguna, saya ingin satu struk = satu total dulu (diskon/PPN/multi-item
    dijumlahkan), agar parser MVP tidak menangani pecah-per-item.
14. Sebagai pengguna, saya ingin diminta consent eksplisit sebelum foto dikirim untuk
    dibaca ("Kirim foto untuk dibaca otomatis?"), agar privasi sesuai PRD §4.4.
15. Sebagai pengguna, saya ingin file sementara OCR dihapus setelah respons, agar tidak
    ada duplikat selain lampiran 30 hari milik saya.
16. Sebagai pengguna offline / OCR gagal, saya ingin form tetap bisa disimpan manual,
    agar OCR tidak pernah memblokir pencatatan.
17. Sebagai pemilik, saya ingin `scan-receipt` di-rate-limit per-user (usul 5/menit,
    pola D5: tolak 429 ber-body + `Retry-After`), agar eksperimen tidak dibanjiri.

### Gerbang

18. Sebagai pemilik, saya ingin gerbang rilis v1.2 (Jest + pgTAP + `verify-*` + kontrak
    statis Maestro + checklist visual + polish final UI/UX + bump `1.2.0`) tanpa regresi.

## Implementation Decisions

**Terkunci (jangan dibuka ulang di kode):** PRD D1–D11, R1–R10, ADR-0001..0009, `CONTEXT.md`.

**Urutan kerja:** S1 → S2 → S3 berurutan (tiap fase bisa rilis sendiri). Trunk `main`,
PR squash per ticket. Bump `1.2.0` sekali di akhir (bersama polish UI/UX final + screenshot
store), bukan per fase.

**Pintasan (S1, ADR-0009):**
- Skema `cashtrix` sudah ada (`app.json`). Tambah rute deep-link di `expo-router` mengikuti
  pola `reset-password` (V0): `add-transaction?type=` (expense|income|transfer tidak ikut —
  pintasan hanya expense/income/scan) dan `scan` (alias form Add mode lampiran).
- Tidak ada detektor tap di dalam app. Tidak ada Accessibility Service. Panduan OS:
  iPhone Back Tap Triple, Pixel Quick Tap (double), Samsung Good Lock + RegiStar.
- Auth gate (`app/_layout.tsx`) + `LockOverlay` (B4) tetap satu-satunya penentu parkir.
  Pintasan tidak menambah cabang auth baru.
- `testID` kontrak statis: `shortcut-expense`, `shortcut-income`, `shortcut-scan`
  (ikut `verify-t11.mjs --static-only`, pola kontrak 78 id / 8 teks / 3 KPI).

**Lampiran (S2):**
- Kamera via `expo-image-picker` (`launchCameraAsync` + galeri) — modul sudah di
  `package.json`, **nol rebuild, OTA aman**. `expo-camera` viewfinder kustom ditunda.
- Bucket privat baru `receipts` (pisah dari `avatars`): path `receipts/{userId}/{uuid}.jpg`,
  batas 2MB PNG/JPG, resize sebelum upload (pola avatar T8).
- Tabel `transaction_receipts(id, user_id, transaction_id nullable, storage_path,
  created_at)`: `transaction_id` nullable agar foto pra-save legal; FK komposit
  `(transaction_id, user_id)` pola transfer V2; RLS 4 policy `to authenticated`
  deny-by-default + revoke anon.
- Retensi: `purge_expired_receipts()` + hapus objek Storage (pola
  `purge_deleted_transactions` T5, job `pg_cron` harian). 30 hari dari `created_at`.
- Idempotency key tetap sekali per sesi form (AC #22) — retry upload tidak double-post.
- i18n: semua copy scan lewat kamus `src/i18n/{id,en}.ts` (ADR-0008); leaf tidak impor i18n.

**OCR (S3, eksperimen server):**
- Edge Function baru `scan-receipt` (pola D5): JWT dulu → `enforceRateLimit` →
  OCR → hapus file sementara → respons `{ amount, occurred_on, merchant,
  category_suggestion, confidence }`. Tanpa menyimpan transaksi. Gagal OCR =
  `{ ok: false }`, form lanjut manual (fail-open untuk UX, bukan untuk auth).
- Engine OCR diputuskan saat eksekusi (Tesseract gratis/lemah vs Cloud Vision
  akurat/bayar) — keduanya di server, tanpa modul OCR native.
- Parser MVP: hanya `total + tanggal + merchant`. Format ID didukung (`30.000`,
  `30,000`, `Rp30rb`, tanggal `12/09/26`). Multi-item/diskon/PPN = satu total.
- Privasi: consent eksplisit; scrub `amount`/`note`/base64 dari log + Sentry (PRD §4.4);
  auto-delete sumber; Data Safety diperbarui ("foto diproses sementara").
- Rate limit usul: 5/menit/user (konsisten D5: seed 10, csv 5, delete 3).

**Agregasi & desain:** tidak ada perubahan agregasi (saldo/Spent/KPI tetap server).
Token `theme.ts` saja; hex di komponen = lint error. Tidak ada tab baru.

## Testing Decisions

**Kriteria test yang baik:** perilaku eksternal. Kebenaran dilihat dari deep link mendarat
di form benar, lampiran muncul/hilang tepat waktu, prefill benar/tetap bisa dikoreksi —
bukan dari struktur internal.

**Tiga seam (jangan tambah):**

1. **Supabase data API (RLS/RPC/purge)** — pgTAP + `scripts/verify-s*.mjs`:
   - `transaction_receipts`: pemilik CRUD, cross-user no-op sunyi, anon 42501;
     FK ke transaksi orang lain ditolak; purge 30 hari menghapus baris + objek.
   - `scan-receipt`: tanpa JWT 401 sebelum rate check; flood 5+2 → 429 ber-body;
     isolasi per-user/per-window (pola `verify-d5`, parkir `awaitFreshRateWindow`).
2. **Fungsi domain murni (Jest, ≥90% folder domain):** parse total ID (`30.000` dan
   varian), parse tanggal, hitung expiry 30 hari, validasi ukuran/ekstensi, saran
   kategori opsional (terima/tolak sama-sama legal).
3. **Gate + kontrak statis:** Jest navigation (pintasan saat locked/unconfirmed/mfa
   parkir benar) + `verify-t11 --static-only` (tambah 3 testID, tanpa hapus).

**Pelengkap, bukan seam desain:** Maestro (pintasan → form → foto → save 1 transaksi;
OCR prefill → koreksi → save); `expo export`; Sentry tanpa `amount`/`note`/base64.

**Prior art:** `supabase/tests/database/16_budget_alert_read.sql`,
`17_function_rate_limits.sql`, `scripts/verify-a5.mjs`, `scripts/verify-d5.mjs`,
`__tests__/navigation.test.tsx` (gate V0/C2/B4/D3).

## Out of Scope

- Detektor tap-belakang di dalam app / Accessibility Service.
- `expo-camera` viewfinder kustom, OCR on-device (ML Kit / Vision), widget,
  Quick Settings Tile.
- Pecah struk per-item / per-kategori otomatis; multi-mata-uang + kurs.
- Layar recycle bin lampiran; retensi selain 30 hari.
- Offline outbox + read cache (`expo-sqlite`) — trek v2.0 terpisah (ADR-0003).
- Bank sync, AI insight, shared budget, server push.

## Further Notes

- Katalog: `docs/roadmap.md` §6.6. Binding: ADR-0009.
- v2.0 tetap paket utuh terpisah; satu-satunya titik temu: spec sync v2.0 mencakup
  `transaction_receipts` sebagai tipe antrean outbox (upload tertunda + retry OCR).
- Biaya store tidak berubah (submit tetap tunda sampai budget; screenshot HP ikut polish
  final UI/UX sebelum submit).
