# Spec — Cashtrix v1.1

Sumber: grill 2026-09-19, `PRD.md` R6–R8, `CONTEXT.md`, `docs/roadmap.md`, ADR-0001..0006, `DESIGN.md`.
Istilah mengikuti `CONTEXT.md`. Jangan drift ke daftar `_Avoid_`.

v1.0 adalah pre-release internal. v1.1 adalah irisan yang bisa naik store, bukan daftar lama PRD §5.1.

## Problem Statement

Evelyn sudah bisa mencatat income/expense, melihat Saldo gabungan, dan memasang Budget — tapi ia tidak bisa memindahkan uang antar Wallet tanpa mengarang sepasang income+expense yang merusak donut dan Spent. Tagihan dan gaji bulanan harus diketik ulang setiap tanggal. Salah hapus tidak bisa diurungkan dari UI meskipun RPC pulih sudah ada. Wallet lama tidak bisa disembunyikan tanpa menghapus riwayat. Dan build ini tidak bisa masuk store: tidak ada reset password, tidak ada URL privasi, email masih auto-confirm, crash-free rate tidak terukur, tidak ada jalur distribusi.

## Solution

Rilis v1.1: gerbang auth yang jujur (konfirmasi email + reset password + privasi EN publik), jalur build (EAS + Sentry), Transfer satu baris, Recurring rule bulanan yang materialisasi lewat Catch-up, arsip Wallet, undo hapus lewat snackbar, kalender penuh di form Add. Offline outbox, biometric, cari, CSV import, i18n, 2FA — bukan rilis ini.

## User Stories

### V0 — Pra-rilis auth & legal

1. Sebagai pengguna baru, saya ingin email saya dikonfirmasi sebelum masuk tabs, agar akun benar-benar milik saya.
2. Sebagai pengguna yang baru daftar, saya ingin layar "Cek email" dengan tombol kirim ulang, agar tidak terjebak jika email pertama hilang.
3. Sebagai pengguna yang mengklik tautan konfirmasi, saya ingin langsung masuk tabs, agar tidak login ulang.
4. Sebagai pengguna yang lupa password, saya ingin meminta tautan reset dari layar Login, agar tidak kehilangan akun permanen.
5. Sebagai pengguna yang membuka tautan reset, saya ingin form password baru di app via `cashtrix://reset-password`, agar tidak mereset di browser asing.
6. Sebagai reviewer store, saya ingin URL Publik Kebijakan Privasi dan Ketentuan (EN) yang sama dengan yang dibuka in-app, agar review tidak ditolak.
7. Sebagai pengguna di Login/Register/Profile, saya ingin tautan Privasi dan Ketentuan, agar syarat terlihat sebelum data diisi.

### V1 — Distribusi & crash

8. Sebagai pengembang, saya ingin development client terpasang di simulator/perangkat, agar modul native (Sentry) bisa diuji tanpa Expo Go.
9. Sebagai pemilik aplikasi, saya ingin crash terkirim ke Sentry dengan field `amount`/`note` tetap di-scrub, agar KPI crash-free terukur tanpa bocor data finansial.
10. Sebagai pengembang, saya ingin `eas.json` dengan profil development / preview / production, agar TestFlight/Play punya jalur yang sama.

### Transfer

11. Sebagai pengguna, saya ingin segmen ketiga Expense | Income | Transfer di form Add, agar pindah uang memakai alur yang sudah hafal (<20 detik).
12. Sebagai pengguna yang memilih Transfer, saya ingin grid Category hilang dan pemilih Wallet tujuan muncul, agar tidak terpaksa memilih Category palsu.
13. Sebagai pengguna, saya ingin Transfer menolak Wallet sumber = tujuan, agar uang tidak "pindah ke dirinya sendiri".
14. Sebagai pengguna, saya ingin Transfer menolak tanggal masa depan, sama seperti income/expense.
15. Sebagai pengguna, saya ingin Saldo Wallet sumber berkurang dan Saldo Wallet tujuan bertambah sebesar amount yang sama, agar posisi per sumber dana benar.
16. Sebagai pengguna, saya ingin Saldo gabungan tidak berubah setelah Transfer, agar pindah uang tidak terlihat seperti belanja atau gaji.
17. Sebagai pengguna, saya ingin Transfer tidak muncul di donut, Spent, atau Alert, agar Budget dan analitik tidak berbohong.
18. Sebagai pengguna, saya ingin satu baris di riwayat "Transfer ke {nama Wallet tujuan}", agar jejak terbaca tanpa dua baris.
19. Sebagai pengguna, saya ingin mengedit amount, tanggal, catatan, atau Wallet sumber/tujuan (keduanya milik saya, tidak sama), agar salah ketik bisa diperbaiki.
20. Sebagai pengguna, saya ingin menghapus Transfer (satu konfirmasi) menghapus kedua sisi sekaligus, agar Saldo tidak pecah.
21. Sebagai pengguna, saya ingin picker Transfer hanya menampilkan Wallet aktif, agar tidak memindahkan ke Wallet yang sudah di-Archive.
22. Sebagai pengguna yang mengarsip Wallet tujuan setelah Transfer tercatat, saya ingin Transfer lama tetap terlihat di feed dengan nama Wallet itu, agar jejak tidak hilang.
23. Sebagai pengguna yang mereassign Wallet, saya ingin ditolak jika hasilnya sumber = tujuan, dengan pesan memilih Wallet lain atau menghapus Transfer dulu.

### Recurring

24. Sebagai pengguna, saya ingin membuat Recurring rule income atau expense dari Profile ("Transaksi berulang"), agar gaji dan tagihan tidak diketik ulang.
25. Sebagai pengguna, saya ingin Recurring rule bulanan dengan Due day 1–28 atau "hari terakhir bulan", agar Februari tidak bolong.
26. Sebagai pengguna, saya ingin `starts_on` wajib (hari-1, default bulan berjalan) dan `ends_on` opsional, agar Catch-up tidak mengarang riwayat sebelum saya mulai.
27. Sebagai pengguna yang menyimpan Recurring rule di bulan berjalan setelah Due day lewat, saya ingin Occurrence pertama adalah siklus berikutnya, agar pengeluaran masa lalu tidak diada-adakan.
28. Sebagai pengguna, saya ingin Catch-up berjalan saat app dibuka atau masuk foreground, agar Occurrence lahir tanpa cron dan tanpa server-push.
29. Sebagai pengguna yang tidak membuka app dua bulan, saya ingin dua Occurrence di tanggal jatuh tempo masing-masing (bukan digabung hari ini), agar akuntansi benar.
30. Sebagai pengguna, saya ingin Catch-up paling banyak 12 Occurrence per Recurring rule per sesi buka, agar splash tidak hang; sisa menunggu sesi berikutnya.
31. Sebagai pengguna, saya ingin paling banyak 20 Recurring rule aktif; yang di-Jeda tidak makan kuota, agar skip Netflix dua bulan tidak memaksa hapus.
32. Sebagai pengguna, saya ingin Occurrence diperlakukan identik dengan Transaction manual (Saldo, Spent, Alert), agar Budget tidak berbohong di bulan tagihan otomatis.
33. Sebagai pengguna yang mengedit Recurring rule, saya ingin hanya Occurrence yang belum lahir yang berubah, agar riwayat tidak diubah diam-diam.
34. Sebagai pengguna yang menghapus atau mengedit Occurrence, saya ingin Catch-up tidak menuliskan ganda (termasuk yang Soft-delete), agar hapus sengaja tetap hapus.
35. Sebagai pengguna, saya ingin Jeda Recurring rule: Catch-up berhenti, Occurrence yang sudah lahir tetap.
36. Sebagai pengguna yang menghapus Recurring rule, saya ingin Occurrence tetap sebagai Transaction biasa (`recurring_rule_id` kosong), agar riwayat Gaji 12 bulan tidak yatim dan tidak ikut terhapus.
37. Sebagai pengguna yang meng-Archive Wallet yang dipakai Recurring rule, saya ingin rule otomatis Jeda dan banner di Profile, agar tagihan tidak gagal diam-diam.
38. Sebagai pengguna, saya tidak ingin Recurring Transfer di v1.1, agar form Recurring tidak menggandakan form Transfer.

### Undo & Archive

39. Sebagai pengguna yang baru menghapus Transaction (termasuk Transfer), saya ingin snackbar ~5 detik "Urungkan" yang memanggil pulih, agar salah tekan tidak kehilangan data.
40. Sebagai pengguna yang snackbar-nya sudah hilang, saya ingin Soft-delete 30 hari tetap berlaku tanpa layar recycle bin, agar v1.1 tidak membangun kotak sampah.
41. Sebagai pengguna, saya ingin meng-Archive Wallet agar hilang dari Dashboard dan picker, tanpa menghapus riwayat.
42. Sebagai pengguna, saya ingin membuka-arsip Wallet, agar sumber dana bisa dipakai lagi.

### Kalender & bahasa UI

43. Sebagai pengguna di form Add, saya ingin grid kalender (bukan stepper hari), agar pilih tanggal tidak bolak-balik.
44. Sebagai pengguna, saya ingin istilah Indonesia konsisten (Dompet, bukan campur Wallet di tombol), agar layar tidak campur bahasa.

### Gerbang

45. Sebagai pemilik, saya ingin gerbang rilis v1.1 (Maestro + pgTAP + Jest + checklist visual + tag `v1.1.0`) tanpa regresi KPI stabilitas.

## Implementation Decisions

**Terkunci (jangan dibuka ulang di kode):** PRD D1–D11, R1–R8, ADR-0001..0006, `CONTEXT.md`.

**Urutan kerja:** V0 di depan karena mengubah bentuk auth (semua `verify-*.mjs` dan Maestro ikut). Tag git `v1.0.0` dipasang mundur di commit rilis MVP sebelum tag `v1.1.0`. Trunk `main`, PR squash per ticket.

**Auth (V0):**
- Hosted: `auth.email.enable_confirmations` = true. Jangan `supabase config push` dari repo root (AGENTS.md); workdir minimal.
- Auth gate menahan session yang `email_confirmed_at` kosong di layar "Cek email" (bukan tabs). Kirim ulang memakai API Supabase. Deep link konfirmasi → tabs.
- Akun E2E / verify: ditandai terkonfirmasi via Admin API / service role, **bukan** mematikan konfirmasi di hosted.
- Reset password: email tautan Supabase → `cashtrix://reset-password` → form password baru (aturan password sama Epic A).
- Legal: `docs/legal/` (Privacy Policy + Terms, **EN**), GitHub Pages `https://callmerev95.github.io/Cashtrix/`, in-app dan store listing memakai URL yang sama. ID menyusul v1.2.

**Distribusi (V1):**
- `eas.json` profil `development` / `preview` / `production`. Native folders tetap gitignored (CNG).
- Kerja JS harian tetap boleh Expo Go; Sentry native di dev-client.
- Transport observability yang sudah ada (`configureTransport`) disambung Sentry; scrub `amount`/`note` tidak berubah.
- `app.json` version `1.1.0`. EAS Free 15 iOS + 15 Android / bulan; prebuild lokal gratis.

**Transfer (ADR-0004):**
- Satu baris `transactions`: `type=transfer`, `wallet_id` = sumber, `counterparty_wallet_id` = tujuan, `amount` > 0, `category_id` NULL.
- Check: `type=transfer` ↔ `category_id IS NULL` ↔ `counterparty_wallet_id IS NOT NULL`; income/expense ↔ `counterparty_wallet_id IS NULL` ↔ `category_id IS NOT NULL`.
- Sumber ≠ tujuan; kedua Wallet milik User; future `occurred_at` ditolak.
- `v_wallet_balances`: sumber −amount, tujuan +amount untuk `type=transfer` (soft-deleted dikecualikan). Income/expense tidak berubah.
- Analytics, Spent, Alert, donut: tetap mengabaikan `type=transfer` (sudah exclude di v1.0; jaga tetap begitu).
- Form Add: segmen ketiga. Pilih Transfer → hilangkan grid Category, tampilkan pemilih tujuan (Wallet aktif saja).
- Feed: satu baris, label "Transfer ke {nama}".
- Hapus/edit = satu baris (RPC hapus yang ada tetap berlaku).
- `reassign_wallet_transactions`: pindahkan `wallet_id` **dan** `counterparty_wallet_id`. Jika suatu baris menjadi sumber = tujuan → seluruh reassign ditolak (atomic).
- Idempotency key tetap satu per sesi form.

**Recurring (ADR-0005):**
- Tabel `recurring_rules` (nama mengikuti glosarium): User, kind income|expense, amount, Wallet, Category, Due day (1–28 atau last), `starts_on` date hari-1, `ends_on` date hari-1 nullable, status aktif|jeda. Unique masuk akal per User (bukan wajib unik per Category — dua tagihan Category sama boleh).
- Maks 20 Recurring rule **aktif** per User (Jeda tidak dihitung). Constraint + validasi client.
- `transactions.recurring_rule_id` nullable, FK `ON DELETE SET NULL`. Unique `(recurring_rule_id, occurred_on)` termasuk baris Soft-delete (`occurred_on` = tanggal jatuh tempo di tz Profile, bukan timestamp penuh — simpan sebagai `date` generated/kolom agar unik tidak pecah karena jam).
- Catch-up = satu RPC `security invoker`, dipanggil saat app buka/foreground. Menulis Occurrence due ≤ hari ini, ≥ `starts_on`, ≤ `ends_on` jika ada, rule aktif (bukan Jeda), belum ada baris (termasuk Soft-delete), plafon 12 per rule per panggilan. `occurred_at` = due date di tz Profile (bukan now()).
- Bulan `starts_on` + Due day sudah lewat → skip bulan itu.
- Edit Recurring rule (amount/Wallet/Category/Due day/`ends_on`) tidak menulis ulang Occurrence yang sudah lahir.
- Archive Wallet yang dirujuk rule → rule Jeda + banner Profile. Picker Transfer/Recurring hanya Wallet aktif.
- Bukan Transfer. Bukan cron. Bukan server-push.

**Undo & Archive:**
- Snackbar ~5 detik setelah hapus, termasuk Transfer, memanggil `restore_transaction` yang sudah ada. Tidak ada layar "terhapus baru-baru ini".
- Archive Wallet: tulis `archived_at`; Dashboard dan picker menyembunyikan; feed Transfer lama tetap menampilkan nama. Buka-arsip = `archived_at` null. Hapus Wallet tetap jalur reassign yang ada.

**Kalender:**
- Grid kalender dari `View` (pola donut T6 / ring T7), bukan date picker native. Future date tetap ditolak untuk income/expense/transfer.

**Agregasi:** client tidak pernah menghitung Saldo, Spent, atau KPI. Perubahan view/RPC di server, pgTAP wajib.

**Design:** token `theme.ts` saja; hex di komponen = lint error. Nav 4 tab + FAB tidak bertambah tab.

## Testing Decisions

**Kriteria test yang baik:** perilaku eksternal. Kebenaran uang dari hasil view/RPC dan baris yang muncul/tidak muncul, bukan dari struktur internal.

**Tiga seam (jangan tambah):**

1. **Supabase data API (views/RPC/RLS)** — seam utama, pgTAP + skrip `verify-*`:
   - Transfer: Saldo sumber/tujuan/gabungan; analytics/Spent tidak bergerak; `category_id` null enforced; sumber ≠ tujuan; reassign yang collapse ditolak; RLS User A tidak melihat Transfer User B; `counterparty_wallet_id` Wallet orang lain ditolak.
   - Catch-up: lahir di due date; skip bulan pertama jika Due day lewat; plafon 12; unique termasuk Soft-delete; Jeda tidak lahir; hapus rule SET NULL; Archive Wallet → rule Jeda; Occurrences masuk Spent dan bisa tembus Alert.
   - Recurring rule: maks 20 aktif; income/expense saja; `starts_on`/`ends_on` hari-1.
2. **Fungsi domain murni (Jest, folder domain, ≥90%)**: validasi Transfer (sumber ≠ tujuan, tidak future, tanpa Category); Due day last-of-month; skip siklus pertama; format label "Transfer ke …"; state Jeda vs aktif.
3. **Auth gate (Jest navigation + verify live)**: session tanpa `email_confirmed_at` tidak masuk tabs; confirmed masuk; reset-password route terpasang. Bukan tes SMTP.

**Pelengkap, bukan seam desain:** Maestro (register → confirm via deep link/fixture → Transfer → Recurring catch-up → undo); `expo export`; Sentry event tanpa `amount`/`note` (cek scrub di unit transport yang sudah ada).

**Prior art:** `supabase/tests/database/07_wallet_balances.sql`, `08_wallet_reassign.sql`, suite T5–T7, `scripts/verify-t5.mjs`..`t11.mjs`, `__tests__/navigation.test.tsx`.

## Out of Scope

- Offline outbox + read cache (`expo-sqlite`) — v2.0 (ADR-0003).
- Biometric app lock — v1.2 (OPEN-3).
- Cari/filter riwayat, bulk edit kategori, inbox notifikasi, CSV import, i18n ID/EN, 2FA, E2E Maestro di CI — v1.2.
- Recurring Transfer, frekuensi harian/mingguan/tahunan, clamp tanggal 29–31.
- Server-push, Recurring sebagai pengingat-saja.
- Bank sync, multi-currency + kurs, smart insight, household budget, widget.
- Privasi/ToS bahasa Indonesia (v1.2).
- Layar recycle bin 30 hari.

## Further Notes

- Katalog lengkap: `docs/roadmap.md`. Binding: PRD §6.1 R6–R8.
- OPEN-3 (bentuk biometric) diparkir, tidak menghambat ticket v1.1.
- Biaya: EAS Free 15+15 build/bulan; Apple $99/tahun + Play $25 sekali untuk store, bukan untuk dev-client.
- Issue #1 (spec MVP) jangan ditutup atau diubah selama eksekusi ticket v1.1.
