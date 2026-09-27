# Spec: Cashtrix widget + fast-lane (v2.0)

Sumber: grill 2026-09-27 (sesi v2.0 ronde 1-3 + final F1-F3), `PRD.md` D1-D11 +
R1-R10, `CONTEXT.md`, ADR-0011, `specs/cashtrix-voice-capture.md` (VC1-VC3
sebagai fondasi yang dipakai ulang), referensi alur
`stitch_cashtrix/reference_voice_capture/alur-1..6.png` (Kasflow, layout saja).
Istilah mengikuti `CONTEXT.md`. Jangan drift ke daftar `_Avoid_`.

Rilis sebagai **`2.0.0`**: item pertama payung v2.x. Multi-currency parkir
(OPEN-4, default perilaku hari ini), TanStack gugur (keputusan lama bertahan),
outbox + read cache tetap paket utuh untuk rilis berikut (ADR-0003).

## Problem Statement

Pintu tercepat hari ini masih butuh buka app, cari FAB, dan navigasi ke form.
Referensi Kasflow menunjukkan yang diinginkan user: satu ketuk dari home
screen, bicara, cek, catat, kembali ke home. Syaratnya: tebakan tidak pernah
menulis sendiri, dan logika tidak digandakan ke kode native.

## Solution

Tiga tombol widget (Catat Suara, tambah transaksi, pindai struk) membuka app
lewat deep-link yang sudah ada dalam presentasi fast-lane: tanpa tab bar,
tanpa chrome, tutup sendiri setelah simpan plus notifikasi lokal. Sheet,
parser, dan jalur save = komponen yang sama dengan pintu in-app. Satu ucapan
bisa split sampai tiga transaksi sejenis; satu ketuk Catat menulis semuanya.

## User Stories

### WG1: Parser split + domain murni

1. Sebagai pengguna, saya ingin satu ucapan berisi dua-tiga item ("nasi padang
   30rb dan kopi 12rb") menjadi dua-tiga baris preview, agar tidak perlu bicara
   tiga kali.
2. Sebagai pengguna yang barisnya campur expense dan income dalam satu ucapan,
   saya ingin penolakan jelas, agar tidak ada tebak-tebakan jenis.
3. Sebagai pengguna, saya ingin tiap baris preview bisa dihapus sebelum Catat,
   agar baris salah tidak ikut tersimpan.
4. Sebagai pengguna yang satu barisnya gagal parse (tanpa angka), saya ingin
   baris valid tetap tersimpan dan yang gagal kembali sebagai teks mentah yang
   bisa diketik manual, agar yang jelas tidak terbuang.
5. Sebagai pengguna, saya ingin batas dan aturan lama tetap berlaku (digit-ID,
   kata-bilangan murni ditolak jujur, transfer via suara ditolak, kata kunci
   income kecil), agar split tidak melonggarkan parser diam-diam.

### WG2: Widget native + fast-lane

6. Sebagai pengguna, saya ingin tiga tombol widget di home screen (suara,
   tambah, pindai) yang tiap ketuknya membuka layar yang tepat, agar tidak
   melewati tab dan navigasi.
7. Sebagai pengguna, saya ingin layar fast-lane berisi sheet yang sama dengan
   versi in-app (picker dompet/kategori, tombol Catat), agar yang saya pelajari
   di app berlaku di widget.
8. Sebagai pengguna yang mengetuk widget saat app terkunci / belum login /
   MFA, saya ingin gate penuh berjalan dulu (unlock, login, challenge) dan
   widget sendiri tidak menampilkan data apa pun, agar kunci tetap berarti.
9. Sebagai pengguna, saya ingin tombol mic di form Add tetap ada, agar tanpa
   widget pun saya tetap bisa bicara di form.
10. Sebagai pengguna, saya ingin item voice di long-press icon seperti pintu
    S1/VC3, agar tanpa widget pun ada jalan cepat.
11. Sebagai pengguna yang menyimpan dari widget, saya ingin notifikasi lokal
    "N transaksi, Total RpX" (ID/EN ikut bahasa), agar dari home screen saya
    tahu catatannya masuk. Simpan dari dalam app tetap snackbar, tanpa
    notifikasi baru.

### WG3: Gerbang rilis 2.0.0

12. Sebagai pemilik, saya ingin tiap ticket WG punya gate device + live +
    kontrak statis sendiri (pola Q10), agar satu kegagalan tidak menahan yang
    lain.
13. Sebagai pemilik, saya ingin label widget tanpa kata "AI", agar listing
    store tidak memuat klaim palsu.

## Implementation Decisions

**Terkunci (jangan dibuka ulang di kode):** PRD D1-D11, R1-R10, ADR-0001..0011,
`CONTEXT.md`.

**Urutan kerja:** WG1 → WG2 → WG3 berurutan. Trunk `main`, PR squash per
ticket. Bump `app.json`/`package.json` → `2.0.0` sekali di akhir (runtimeVersion
appVersion: OTA lama tidak berlaku pasca-bump, pola RLS 1.2.0).

**Parser split (WG1, murni, tanpa native):**
- Perluasan `src/features/voice/domain.ts` (seam Jest yang sama): sensus
  nominal per klausa; 1 klausa = perilaku VC1; 2-3 klausa = baris split;
  lebih dari 3 = tolak dengan pesan; campur kind = tolak; tiap baris butuh
  nominal sendiri (klausa tanpa angka = baris gagal F1a).
- Aturan VC1 tidak berubah: digit-ID, tolak kata-bilangan murni, tolak
  transfer, keyword income kecil, substring dompet aktif, hint kategori.
- Satu sesi sheet = satu idempotency key per baris (pola AC #22); retry tidak
  double-post; simpan memakai `createTransaction` yang ada lalu refresh
  wallets/transactions/budgets/analytics + `evaluateAndAlert` (pola
  pasca-save). Baris valid yang sudah tersimpan tidak ditulis ulang saat retry.

**Widget + fast-lane (WG2, satu batch native):**
- iOS: `expo-widgets` (SDK 57-ready, config plugin, butuh dev build + binary
  baru, bukan Expo Go). Android: paket widget community (RemoteViews, config
  plugin, dev build + binary baru). Widget hanya tombol + deep-link
  (`voice`/`add-transaction?type=`/`scan` + `source=widget`); tanpa data, tanpa
  sesi, tanpa query.
- Presentasi fast-lane: rute yang sama dibuka tanpa tab bar dan tanpa chrome
  navigasi, auto-dismiss setelah save + notifikasi lokal. Sheet/komponen reuse
  penuh, bukan salinan.
- Long-press: tambah item voice ke shortcut S1 yang ada (satu batch rebuild,
  tanpa paket baru).
- Gate parkir = auth gate + `LockOverlay` yang ada; tidak ada logika sesi di
  pintu. Mic in-app tidak dihapus.
- i18n: semua copy widget/fast-lane/notifikasi lewat kamus
  `src/i18n/{id,en}.ts` (ADR-0008); leaf tidak impor i18n. Label tanpa "AI".
- `testID` kontrak statis: tambah ID pintu widget/fast-lane mengikuti pola
  `verify-t11.mjs --static-only`, tanpa hapus ID lama.

**Agregasi & desain:** tidak ada perubahan agregasi (saldo/Spent/KPI tetap
server). Token `theme.ts` saja; hex di komponen = lint error.

## Testing Decisions

**Kriteria test yang baik:** perilaku eksternal. Kebenaran dilihat dari ucapan
masuk preview benar per baris, hapus-per-baris jalan, satu ketuk menulis N
baris tanpa ganda, widget membuka layar yang tepat, gate parkir benar, bukan
dari struktur internal.

**Tiga seam (jangan tambah):**

1. **Parser split murni (Jest, ≥90% folder domain):** 1/2/3 klausa jadi
   1/2/3 baris; 4+ ditolak; campur kind ditolak; klausa tanpa angka = baris
   gagal; aturan VC1 (digit-ID, kata-bilangan, transfer, keyword income,
   substring dompet) tetap.
2. **Gate + kontrak statis:** Jest navigation (pintu widget saat
   locked/unconfirmed/MFA parkir benar) + `verify-t11 --static-only` (tambah
   testID widget/fast-lane).
3. **Simpan N baris sekali:** key idempotency per baris per sesi sheet; retry
   tidak ganda (pola `createTransaction` 23505); baris valid tersimpan + baris
   gagal kembali mentah (F1a).

**Pelengkap, bukan seam desain:** Maestro (tap widget → fast-lane → split 2
baris → Catat → notifikasi; tolak campur-kind → pesan); `expo export`; Sentry
tanpa `amount`/`note`/teks ucapan mentah; device gate HP (pola V6/RLS).

## Out of Scope

- Widget saldo / glanceable angka (butuh desain refresh + privasi lock screen
  sendiri).
- Split lebih dari 3; split lintas kind; kata-bilangan Indonesia; keyword
  income Inggris; transfer via suara.
- Sheet interaktif di dalam widget (duplikasi native, ditolak ADR-0011).
- Server push / push jarak jauh; sinkron sesi ke ekstensi widget (App Groups +
  keychain, ditolak ADR-0011).
- Multi-currency (OPEN-4, parkir); TanStack (gugur); offline outbox + read
  cache (rilis berikut, ADR-0003); bank sync; AI insight.
