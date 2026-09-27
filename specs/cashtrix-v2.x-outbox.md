# Spec: Cashtrix offline outbox + read cache

Sumber: grill outbox 2026-09-27 (ronde 1 O1-O5, ronde 2 R1-R6, ronde 3 T1-T4),
`PRD.md` D1-D11 + R1-R10, `CONTEXT.md`, ADR-0003 + ADR-0012,
`specs/cashtrix-v2.0-widget.md` (jalur save yang dipakai ulang, termasuk
split-N). Istilah mengikuti `CONTEXT.md`. Jangan drift ke daftar `_Avoid_`.

Dikerjakan **setelah WG3 hijau** (fondasi stabil dulu, O4). Nomor versi
diputuskan saat eksekusi (rilis berikut payung v2.x).

## Problem Statement

Hari ini offline berarti tulis ditolak (PRD §5.2): user di basement, di
perjalanan, atau saat Supabase down tidak bisa mencatat, dan momennya hilang.
Keinginan "catat sekarang, kirim nanti" tidak bisa berarti antrean buta:
tanpa aturan menang, tanpa status per baris, dan tanpa batas, antrean menjadi
tempat data hilang diam-diam.

## Solution

Antrean tulis di perangkat (SQLite) + baca terdegradasi dari cache. Transaksi
(termasuk split-N) dan lampiran struk tertunda mengantre saat offline; saat
online kembali, flush FIFO satu-per-satu, tiap baris dapat hasilnya sendiri.
Konflik menang buta (terakhir-menulis-menang, hapus paling tegas). Daftar dan
form terbaca offline; agregasi tetap online. Antrean selalu terlihat (strip +
badge) dan ikut terhapus saat sign-out.

## User Stories

### OB1: Antre dan baca offline

1. Sebagai pengguna tanpa koneksi, saya ingin simpan transaksi tetap berhasil
   (masuk antrean, snackbar biasa), agar momen catat tidak hilang.
2. Sebagai pengguna tanpa koneksi, saya ingin Dashboard + Riwayat + form tetap
   terbuka dari cache berlabel data terakhir, agar bisa melihat dan menyiapkan
   catatan.
3. Sebagai pengguna tanpa koneksi, saya ingin Analytics/Budget/KPI berkata
   jujur butuh koneksi (bukan angka basi), agar tidak ada keputusan dari angka
   yang salah.
4. Sebagai pengguna yang memotret struk tanpa koneksi, saya ingin foto
   tersimpan di perangkat dan ter-upload setelah transaksinya commit (retry
   OCR paling akhir), agar O1-B terpenuhi tanpa rekayasa.
5. Sebagai pengguna dengan 200 baris antre, saya ingin tulis ke-201 ditolak
   dengan pesan jelas (bukan dibuang diam-diam), agar batas tidak memakan
   data.
6. Sebagai pengguna yang sign-out, saya ingin antrean ikut terhapus, agar user
   berikutnya di HP yang sama tidak melihatnya.

### OB2: Flush, coalesce, konflik

7. Sebagai pengguna yang kembali online, saya ingin antrean terkirim FIFO
   satu-per-satu dan strip berubah menjadi selesai, agar tiap baris jelas
   nasibnya.
8. Sebagai pengguna yang meng-undo simpan offline dalam 10 detik, saya ingin
   barisnya hilang dari antrean tanpa pernah ke server, agar batal berarti
   batal.
9. Sebagai pengguna yang mengedit lalu menghapus baris yang masih mengantre,
   saya ingin server tidak pernah tahu versi antaranya (gabung niat
   terakhir), agar tidak ada sampah audit dan alert palsu.
10. Sebagai pengguna yang baris antreannya ditolak server (dompet dihapus,
    kategori diarsip, tanggal kedaluwarsa), saya ingin barisnya bertahan
    dengan alasan + bisa diperbaiki atau dibuang, agar uang saya tidak hilang
    diam-diam.
11. Sebagai pengguna dua perangkat, saya ingin aturan menang bisa dijelaskan
    satu kalimat (terakhir-menulis-menang; hapus paling tegas), agar tanpa
    layar konflik pun perilakunya terduga.
12. Sebagai pengguna yang reconnect, saya ingin urutan catch-up → flush →
    refresh + evaluasi alert sekali, agar occurrence dan niat saya tidak
    double-fire.

### OB3: Indikator dan gerbang

13. Sebagai pengguna dengan antrean, saya ingin strip di atas Riwayat ("N
    menunggu terkirim · Kirim sekarang") + badge per baris antre + buang
    per-baris via konfirmasi, agar "hilang atau belum?" selalu terjawab.
    Tanpa tombol buang-semua.
14. Sebagai pemilik, saya ingin gate device + live + kontrak statis (pola
    Q10/WG3), agar outbox tidak merusak semua jalur tulis yang disentuhnya.
15. Sebagai pemilik, saya ingin kunci idempotency per baris dibuat saat baris
    dibuat offline (selamat dari restart), agar kill-then-flush tidak
    double-post (AC #22 berlaku offline).

## Implementation Decisions

**Terkunci (jangan dibuka ulang di kode):** PRD D1–D11, R1–R10, ADR-0001..0012,
`CONTEXT.md`.

**Urutan kerja:** OB1 → OB2 → OB3 berurutan. Trunk `main`, PR squash per
ticket. Tanpa bump versi di spec ini (diputuskan saat eksekusi).

**Store + antrean (OB1):**
- `expo-sqlite` (satu modul native baru = satu rebuild preview; gabung batch
  native terdekat bila ada, jangan rebuild sendirian tanpa perlu). Satu tabel
  antrean: baris + kunci idempotency (dibuat saat baris dibuat, T2) +
  `created_at` lokal + status (tunggu/kirim/gagal + alasan) + path foto lokal
  bila ada. Cap 200 baris (penuh = tolak tulis baru + pesan).
- Kunci antrean didaftarkan di `LOCAL_STORAGE_KEYS` (purge saat sign-out, R5).
  Foto offline di sandbox app; sukses upload = sapu; yatim tanpa baris antre
  lebih dari 7 hari = sapu (T4).
- Cache baca: Dashboard + Riwayat + form dari SQLite; Analytics/Budget/KPI =
  gate koneksi eksplisit (bukan angka cache). Label "data terakhir" + banner
  D4 tetap.

**Flush + konflik (OB2):**
- Flush FIFO sekuensial (T1), satu baris satu hasil. Urutan reconnect:
  `runCatchUp()` → flush → refresh semua → `evaluateAndAlert` sekali (R4).
  Foto di-upload setelah transaksi pemiliknya commit; retry OCR paling akhir.
- Coalesce lokal (R3): edit menimpa baris antre, hapus membuangnya, undo
  membuangnya tanpa server (R2). Baris yang sudah terkirim ikut jalur normal.
- LWW buta + hapus-menang (O2): tanpa kolom versi, tanpa UI konflik. Baris
  ditolak server bertahan dengan flag error + alasan (T3); banner menghitung
  "N gagal".
- i18n: semua copy antrean/indikator/error lewat kamus `src/i18n/{id,en}.ts`
  (ADR-0008); leaf tidak impor i18n.

**Agregasi & desain:** tidak ada perubahan agregasi server. Token `theme.ts`
saja; hex di komponen = lint error.

## Testing Decisions

**Kriteria test yang baik:** perilaku eksternal. Kebenaran dilihat dari simpan
offline masuk antrean, flush mengirim semua tanpa ganda, coalesce menutup
jejak versi antara, konflik menang buta sesuai aturan, indikator jujur, bukan
dari struktur internal.

**Tiga seam (jangan tambah):**

1. **Antrean murni (Jest):** coalesce edit/hapus/undo atas baris antre;
   FIFO; kunci idempotency per baris dibuat saat baris dibuat; cap 200
   menolak dengan pesan; purge sign-out mengosongkan.
2. **Flush + konflik (live + Jest navigation):** kill-sebelum-flush tidak
   ganda; baris ditolak bertahan beralasan; hapus-menang atas edit
   terlambat; urutan catch-up → flush → evaluasi-sekali (tanpa double-fire).
3. **Indikator + kontrak statis:** strip/badge/buang-per-baris;
   `verify-t11 --static-only` (tambah testID antrean).

**Pelengkap, bukan seam desain:** Maestro (mode pesawat → 2 simpan → online →
flush → strip selesai; tolak-server → flag error); `expo export`; Sentry tanpa
`amount`/`note`/path foto.

## Out of Scope

- Antre budget/rule/kategori/dompet (O1-C).
- Merge multi-device + UI resolusi konflik (O2-B).
- Baca agregasi offline / kloning agregasi ke klien (O3-A).
- Antrean diam-diam tanpa UI (O5-B); tombol buang-semua (R6).
- Antrean pindah perangkat (O2-A); multi-currency (OPEN-4); bank sync.
