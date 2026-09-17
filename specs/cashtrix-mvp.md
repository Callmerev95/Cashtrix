# Spec — Cashtrix MVP (v1.0)

Sumber: `PRD.md` v1.0 (approved) + `DESIGN.md` (kanonik). Semua keputusan terkunci mengikuti PRD §0 (D1–D11); tidak ada area abu-abu yang dibuka ulang di spec ini.

## Problem Statement

Aplikasi pencatat keuangan consumer umumnya ramai, penuh iklan, dan memaksa pengguna ke pola kategori bawaan yang tidak mencerminkan gaya hidup mereka. Persona target — Evelyn Vance, profesional urban 28–45 yang mengelola 3–6 dompet — frustrasi karena butuh 4 langkah untuk input 1 transaksi, dan laporan yang tidak bisa di-filter per wallet. Ia tidak punya alat yang tenang, cepat, dan privat untuk melihat posisi keuangannya dalam hitungan detik.

## Solution

Cashtrix — aplikasi mobile personal finance (iOS & Android) dengan estetika *private wealth* (obsidian + champagne gold), input transaksi <20 detik, multi-wallet, analitik visual yang dihitung server-side, dan budget per kategori dengan alert ambang batas yang anti-spam. Semua data milik pengguna (RLS-scoped per akun), siap diperluas ke agregasi bank di v2. MVP mencakup: Autentikasi, Multi-Wallet, Transaksi, Analytics, Budget & Alert, Profile & Settings.

## User Stories

### Autentikasi

1. Sebagai pengguna baru, saya ingin mendaftar dengan email + password, agar data saya terikat pada akun yang hanya saya akses.
2. Sebagai pengguna baru, saya ingin validasi format email dan aturan password (≥8 karakter, ≥1 huruf + ≥1 angka) dijalankan sebelum request dikirim, agar kesalahan terlihat sebagai pesan inline tanpa menunggu server.
3. Sebagai pengguna baru, saya ingin memverifikasi email via link dari Supabase Auth, agar akun benar-benar milik saya.
4. Sebagai pengguna yang baru login pertama kali, saya ingin otomatis di-seed 1 wallet "Cash" (opening balance 0) + set kategori default, agar bisa langsung mencatat tanpa setup manual.
5. Sebagai pengguna kembali, saya ingin sesi persisten via refresh token, agar app re-open langsung ke Dashboard tanpa login ulang.
6. Sebagai pengguna, saya ingin login gagal menampilkan pesan generik "Email atau password salah", agar tidak terungkap mana yang salah.
7. Sebagai pengguna, saya ingin sign out menghapus sesi lokal + cache, agar data saya tidak tertinggal di perangkat.

### Multi-Wallet

8. Sebagai pengguna, saya ingin membuat wallet dengan nama, tipe (`bank`/`ewallet`/`cash`/`card`), opening balance, serta warna/icon dari token design, agar tiap sumber dana terlihat terpisah.
9. Sebagai pengguna, saya ingin dibatasi maksimum 10 wallet per akun, agar skema personal tetap sederhana.
10. Sebagai pengguna, saya ingin melihat saldo gabungan semua wallet di Dashboard, agar posisi finansial terlihat dalam hitungan detik.
11. Sebagai pengguna, saya ingin saldo wallet selalu dihitung dari SQL view (`opening_balance + Σ income − Σ expense`), agar saldo tidak pernah drift karena tidak ada kolom mutable.
12. Sebagai pengguna, saya ingin menghapus wallet yang masih 0 transaksi, agar tidak ada data yatim.
13. Sebagai pengguna dengan wallet berisi transaksi, saya ingin ditawari reassign transaksi ke wallet lain (bulk) atau penghapusan ditolak, agar riwayat tidak hilang.

### Transaksi

14. Sebagai pengguna, saya ingin mencatat pengeluaran/pemasukan dalam <20 detik, agar pencatatan tidak terasa seperti kerjaan.
15. Sebagai pengguna, saya ingin toggle Expense/Income mengingat pilihan terakhir (default `expense`), agar form hafal kebiasaan saya.
16. Sebagai pengguna, saya ingin entry amount dengan keyboard numerik kustom + live-format `id-ID` (glyph `Rp` statis warna gold), agar angka besar terbaca jelas.
17. Sebagai pengguna, saya ingin validasi amount (`0 < amount ≤ 999.999.999.999`, maks 2 desimal, bukan NaN/Infinity), agar data korup tidak pernah tersimpan.
18. Sebagai pengguna, saya ingin memilih kategori dari grid ikon yang hanya menampilkan kategori aktif sesuai tipe transaksi, agar income tidak pernah salah masuk kategori expense.
19. Sebagai pengguna, saya ingin tanggal default "sekarang" dan tidak boleh future date, agar data selalu realistis.
20. Sebagai pengguna, saya ingin menambahkan catatan opsional maks 200 karakter (di-trim), agar konteks transaksi tetap tercatat.
21. Sebagai pengguna, saya ingin wallet default = wallet pada transaksi terakhir, agar input cepat tidak menuntut pemilihan ulang.
22. Sebagai pengguna, saya ingin penyimpanan bersifat optimistic insert + idempotency key (UUID v4 dibuat saat form dibuka), agar retry jaringan tidak menduplikasi data.
23. Sebagai pengguna, saya ingin mengedit/menghapus transaksi (hapus = konfirmasi modal destructive), agar data akurat dan penghapusan tidak terjadi karena salah tekan.
24. Sebagai pengguna, saya ingin penghapusan bersifat soft-delete dengan retensi 30 hari sebelum hard-delete, agar ada jendela pemulihan.
25. Sebagai pengguna, saya ingin daftar transaksi infinite scroll 20/halaman, grouped per tanggal, income gold `+` dan expense muted white tanpa merah, agar riwayat mudah dipindai dan tenang.

### Analytics

26. Sebagai pengguna, saya ingin memilih rentang `1M`/`3M`/`6M`/`1Y`/`ALL`, agar analisis sesuai horizon saya.
27. Sebagai pengguna, saya ingin KPI header (Total Expense, Total Income, Net) dibandingkan periode sebelumnya yang sama panjang dengan delta %, agar tahu apakah saya membaik.
28. Sebagai pengguna, saya ingin donut wheel top 8 kategori expense + sisa digabung "Other" (sudut ≥0.5% baru dirender, center = total range), agar distribusi terbaca sekilas.
29. Sebagai pengguna, saya ingin bar chart agregat harian (range ≤1M) atau bulanan (range >1M), agar tren terbaca pada skala yang tepat.
30. Sebagai pengguna, saya ingin filter analytics per wallet, agar laporan tidak tercampur antar sumber dana.
31. Sebagai pengguna tanpa transaksi pada rentang terpilih, saya ingin empty state yang jelas, agar tidak melihat NaN/Infinity.
32. Sebagai pengguna, saya ingin semua agregasi analytics dihitung di Postgres (view/RPC), agar hasil konsisten dan cepat (p95 <300ms pada 10k transaksi) dan client tidak pernah menghitung agregat finansial.

### Budget & Alert

33. Sebagai pengguna, saya ingin menetapkan batas belanja per kategori expense per bulan, agar overspend terkendali.
34. Sebagai pengguna, saya ingin satu budget per kategori per bulan (unique constraint), agar tidak ambigu.
35. Sebagai pengguna, saya ingin mengubah amount budget di bulan berjalan, agar bisa menyesuaikan realita tanpa menunggu bulan baru.
36. Sebagai pengguna, saya ingin progress ring berubah state `ok` → `warning` (≥80%) → `exceeded` (≥100%), agar status terbaca sekilas.
37. Sebagai pengguna, saya ingin local push notification (expo-notifications) terkirim tepat setelah commit transaksi yang melewati threshold — sekali per budget per bulan per threshold (80% dan 100%), agar diberi tahu tanpa spam.
38. Sebagai pengguna yang mengedit/menghapus transaksi hingga persentase turun lalu naik lagi, saya ingin alert yang sudah fired tidak di-double di bulan yang sama, agar tidak menerima notifikasi duplikat.
39. Sebagai pengguna, saya ingin bulan budget dihitung dari timezone profil saya (default `Asia/Jakarta`) via satu fungsi SQL, agar batas bulan sesuai kehidupan saya, bukan UTC server.
40. Sebagai pengguna, saya ingin budget bulan baru otomatis "kosong" (0 spent) tanpa cron, karena `month` adalah dimensi data, agar reset terasa instan.
41. Sebagai pengguna, saya ingin diminta izin push hanya saat budget pertama dibuat, agar tidak diganggu di onboarding.

### Profile & Settings

42. Sebagai pengguna, saya ingin mengatur nama (maks 60 char) dan avatar (≤2MB, PNG/JPG, di-resize 512×512 sebelum upload ke bucket privat), agar app terasa milik saya.
43. Sebagai pengguna, saya ingin membuat/mengedit/mengarsip kategori kustom (nama + ikon dari katalog Material Symbols), agar kategori mencerminkan gaya hidup saya.
44. Sebagai pengguna, saya ingin kategori bawaan hanya bisa diarsipkan (bukan dihapus), agar data historis tetap valid.
45. Sebagai pengguna, saya ingin memilih currency di profil (default `IDR`, tampilan via `Intl.NumberFormat`, tanpa konversi), agar angka tampil sesuai preferensi.
46. Sebagai pengguna, saya ingin mengekspor semua transaksi sebagai CSV (kolom: date, type, category, wallet, amount, currency, note) via share sheet, agar data saya portabel.
47. Sebagai pengguna, saya ingin menghapus akun & seluruh data (konfirmasi dua langkah: ketik "HAPUS"), agar hak penghapusan terpenuhi dan operasinya eksplisit irreversible.

### Operasional & Non-fungsional

48. Sebagai pemilik aplikasi, saya ingin event analytics minimal (`tx_created`, `budget_threshold_reached`, `screen_view`), agar KPI aktivasi/retensi terukur.
49. Sebagai pemilik aplikasi, saya ingin crash reporting (Sentry atau setara) dengan scrubbing field `amount`/`note`, agar stabilitas terukur tanpa membocorkan data finansial.
50. Sebagai pengguna dengan izin push ditolak, saya ingin alert in-app (ring berubah warna) tetap berfungsi, agar notifikasi tidak menjadi single point of failure.
51. Sebagai pengguna saat Supabase downtime, saya ingin mode read-only dari cache + banner status (tulis ditolak, bukan antrian buta), agar tidak ada kehilangan data.

## Implementation Decisions

**Terkunci (PRD §0, tidak dinegosiasikan ulang):**

- D1 Platform: React Native + Expo (iOS & Android). D2 Backend: Supabase (Postgres + Auth + RLS + Storage). D3 Manual entry; skema siap ekspansi bank (v2). D5 Single currency IDR (schema multi-ready). D6 Personal, multi-wallet maks 10. D7 Budget per kategori, reset otomatis tanggal 1. D8 Alert in-app + local push. D10/D11 Warna & font dari `DESIGN.md`, bukan layar Stitch.

**Arsitektur:**

- Expo Router (4 tab + FAB tengah: Dashboard, Analytics, [+ Add Transaction], Budgets, Profile); Auth di luar tab sebagai gate.
- TanStack Query sebagai single source data remote; `expo-sqlite` hanya read-through cache untuk list & dashboard. Tidak ada state saldo yang persisten di client — saldo selalu dari SQL view saat fetch.
- Semua agregasi finansial (saldo, analytics, budget spent) di Postgres via view/RPC. Client tidak pernah menghitung agregat.
- Edge Functions (service role, dipanggil dengan JWT user): `seed-user` (idempotent: wallet "Cash" + kategori default saat login pertama), `export-csv`, `delete-account` (hapus semua baris user + storage avatar + auth user).

**Skema (Postgres):**

- Tabel: `profiles` (id = auth.uid, timezone default `Asia/Jakarta`, currency default `IDR`), `wallets` (type enum `bank/ewallet/cash/card`, `unique(user_id, name)`), `categories` (user_id nullable = kategori sistem; `kind` income/expense; `unique(user_id, name, kind)`), `transactions` (`type` enum `income/expense/transfer` — `transfer` reserved v1.1; `amount > 0` numeric(18,2); `char_length(note) <= 200`; `unique(user_id, idempotency_key)`; soft-delete `deleted_at`; index `(user_id, occurred_at desc)` dan `(user_id, category_id, occurred_at)`), `budgets` (`month` date = hari-1 UTC dari bulan tz user; `unique(user_id, category_id, month)`), `budget_alerts` (threshold `warning_80`/`exceeded_100`; `unique(user_id, category_id, month, threshold)` — dedup per-user, PRD §6.1 R1).
- View wajib: `v_wallet_balances`, `v_monthly_summary(user_id, month, tz)`, `v_category_breakdown(user_id, range_start, range_end)`, `v_budget_status(user_id, month, tz)` (state `ok/warning/exceeded`).
- Bulan budget dihitung dari `profiles.timezone` oleh satu fungsi SQL (`current_month(tz)`); tidak ada perhitungan bulan di client.
- Dedup alert: insert ke `budget_alerts` pakai `ON CONFLICT DO NOTHING` dengan kunci per-user `(user_id, category_id, month, threshold)`; edit/hapus transaksi yang menurunkan % tidak menghapus alert yang sudah fired.
- Idempotency transaksi: UUID v4 dibuat saat form dibuka, dikirim sebagai header `x-idempotency-key`; retry aman.
- RLS di 100% tabel, deny-by-default; tidak ada policy `USING (true)`. Storage bucket privat untuk avatar, path `avatars/{user_id}`, policy `user_id = auth.uid()`.
- Service role key hanya di Edge Functions. Tidak ada data finansial di log (client maupun server).

**Design system (binding ke `DESIGN.md`):**

- Satu file tema (`theme.ts` atau setara) = satu-satunya tempat hex literal; dilarang hex di komponen (lint rule).
- Warna kanonik: `#0A0A0A` bg, `#1C1C1E` card, `#2C2C2E` elevated/border, `#3A3A3C` border-strong, `#D4AF37` accent, `#F3E5AB` accent-soft, `#E5E5E5` text-primary, `#8E8E93` text-secondary, `#FFB4AB` error (destructive saja).
- Inter untuk teks struktural, JetBrains Mono untuk semua nilai moneter. 12 type tokens sesuai skala design.md §2.
- Expense = `#E5E5E5` (tidak pernah merah); income = gold `+`; error `#FFB4AB` hanya untuk aksi destruktif.
- Stitch hanya referensi **layout**; dilarang color-pick dari layar Stitch; drift font Public Sans pada token currency diabaikan (JetBrains Mono kanonik).
- Floating bottom nav frosted glass + FAB 56px gradient gold; semua screen list-heavy clearance bawah ≥96px + safe-area inset; tap target min 44px, button 52px.

## Testing Decisions

**Kriteria test yang baik:** menguji perilaku eksternal, bukan detail implementasi. Kebenaran finansial diverifikasi dari hasil query/view dan notifikasi yang muncul, bukan dari struktur internal kode.

**Dua seam (sesedikit mungkin):**

1. **Supabase data API (views/RPC/RLS policies)** — seam utama kebenaran domain. Dites via pgTAP / Supabase local:
   - Matriks RLS antar-user di 100% tabel: user A tidak bisa SELECT/UPDATE/DELETE baris user B.
   - Boundary bulan timezone: transaksi 31 Des 23:59 WIB vs 1 Jan UTC — bulan budget harus mengikuti `profiles.timezone`.
   - Boundary threshold: 79.9/80/99.9/100% → state `ok/warning/exceeded`.
   - Dedup alert: transaksi kedua yang melewati threshold sama di bulan sama TIDAK membuat baris alert baru (`ON CONFLICT DO NOTHING`).
   - Saldo: `v_wallet_balances` = opening + Σ income − Σ expense, exclude soft-delete.
2. **Fungsi domain murni di client** (Jest, target ≥90% coverage folder domain): format `id-ID`, validasi amount (batas 12 digit, 2 desimal, NaN/Infinity), boundary threshold untuk state UI, persistensi pilihan Expense/Income.

**Pelengkap (bukan seam pengembangan):**

- Integration flow auth → seed → tx → budget → alert (dedup fired) di Supabase local.
- E2E happy path (Maestro): register → input 3 tx → dashboard & analytics → set budget → trigger alert. Gerbang rilis, bukan driver desain.
- Visual smoke manual per rilis: layout dibandingkan render Stitch (referensi), warna selalu dari token kanonik.

**Prior art:** belum ada — repo pre-code; test suite pertama akan mendirikan pola (pgTAP untuk RLS/SQL, Jest untuk domain, Maestro untuk E2E).

## Out of Scope

- Sinkronisasi/agregasi bank (open banking) — v2; hanya skema yang disiapkan.
- Multi-currency dengan konversi kurs — hanya field `currency_code`.
- Transfer antar-wallet — v1.1 (enum `transfer` reserved).
- Recurring/subscription transactions — v1.1.
- Offline write queue (outbox) — v1.1; MVP tulis butuh koneksi, baca dari cache lokal terakhir.
- App lock biometrik (Face ID/PIN) — v1.1.
- Shared/household budget, web version, widget, email digest, AI insights, import CSV, custom color picker.
- Server push notification (hanya local notification di MVP).

## Further Notes

- **Risiko utama & mitigasi** (PRD §5.2): timezone boundary → satu fungsi SQL + unit test lintas tz; double-fire alert → unique constraint + `ON CONFLICT DO NOTHING`; drift saldo → tidak ada kolom saldo mutable (code review melarang `update wallets set balance`); agregasi lambat → index `(user_id, occurred_at desc)` + pagination di list; izin push ditolak → alert in-app tetap hidup, minta izin saat budget pertama; drift visual → lint rule hex di komponen = error; downtime → mode read-only dari cache + banner.
- **KPI rilis** (PRD §1): aktivasi ≥60% (≥5 tx dalam 7 hari), D7 retention ≥40%, input <20s, crash-free ≥99.5%, cold start p95 <2s, analytics query p95 <300ms, alert latency ≤5s.
- Dokumen sumber: `PRD.md` (keputusan produk) dan `DESIGN.md` (sistem desain kanonik). Pertanyaan baru saat development wajib dicatat di PRD §6 dengan status `OPEN` sebelum diputuskan di kode.
