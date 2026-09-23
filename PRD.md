# PRD — Cashtrix

**Versi:** 1.0 · **Status:** Approved · **Tanggal:** 2026-09-17 · **Revisi terakhir:** 2026-09-19 (R6–R8, cakupan & bentuk v1.1)
**Dokumen pendamping:** `design.md` (Obsidian Luxury / Minimalist Obsidian design system) — sumber kebenaran visual.

---

## 0. Keputusan Terkunci (Resolved Decisions)

Semua area abu-abu telah diputuskan oleh owner. Ini tidak bisa dinegosiasikan ulang tanpa review baru.

| # | Keputusan | Nilai |
|---|---|---|
| D1 | Platform | React Native + Expo (iOS & Android) |
| D2 | Backend | Supabase (Postgres + Auth + RLS + Storage) |
| D3 | Sumber data | Manual entry; skema siap ekspansi bank (v2) |
| D4 | Cakupan MVP | Core + Analytics + Budget & Alert + Profile & Settings |
| D5 | Mata uang | Single (IDR default), skema siap multi-currency |
| D6 | Dompet | Personal, multi-wallet per akun |
| D7 | Budget | Batas per kategori, reset otomatis tiap tanggal 1 |
| D8 | Alert | In-app (progress ring berubah warna) + local push notification |
| D9 | KPI | Gabungan adopsi/retensi + keandalan teknis |
| D10 | Warna kanonik | `#0A0A0A` bg, `#1C1C1E` card, `#D4AF37` aksen, `#E5E5E5` teks — dari `design.md` §1, bukan dari layar Stitch |
| D11 | Font angka | JetBrains Mono (kanonik); drift Public Sans di Stitch diabaikan |

---

## 1. Executive Summary

**Problem Statement:** Aplikasi pencatat keuangan consumer umumnya ramai, penuh iklan, dan memaksa pengguna ke pola kategori bawaan yang tidak mencerminkan gaya hidup mereka. Pengguna yang disiplin secara finansial tidak punya alat yang tenang, cepat, dan privat untuk melihat posisi keuangannya dalam hitungan detik.

**Proposed Solution:** Cashtrix — aplikasi mobile personal finance dengan estetika *private wealth* (obsidian + champagne gold), input transaksi <20 detik, multi-wallet, analitik visual, dan budget per kategori dengan alert ambang batas. Semua data milik pengguna (RLS-scoped), siap diperluas ke agregasi bank di v2.

### Success Criteria (KPI)

| KPI | Target | Cara Ukur |
|---|---|---|
| Aktivasi | ≥60% user baru mencatat ≥5 transaksi dalam 7 hari pertama | Event analytics (`tx_created`) |
| Retensi | D7 retention ≥40% | Analytics cohort |
| Kecepatan input | Median waktu Add Transaction → tersimpan <20 detik | Timer in-app dari buka form sampai commit |
| Stabilitas | Crash-free sessions ≥99.5% | Sentry / expo crash reporting |
| Responsivitas | Cold start p95 <2s; round-trip Supabase p95 <2s; query analytics p95 <300ms | Instrumentasi + Supabase Logs |
| Alert latency | Notifikasi budget terkirim ≤5s sejak transaksi yang melewati threshold di-commit | Log lokal + telemetry |

---

## 2. User Experience & Functionality

### 2.1 User Persona

**Evelyn Vance — "The Discreet Wealth Builder"** (28–45, profesional urban, income menengah-atas)
- Mengelola 3–6 dompet: rekening bank, e-wallet, kartu kredit, cash.
- Kriteria keputusan: kecepatan input, ketenangan visual, privasi. **Anti-kriteria:** iklan, notifikasi spam, warna mencolok.
- Frustrasi utama dengan aplikasi sejenis: 4 langkah untuk input 1 transaksi; laporan yang tidak bisa di-filter per wallet.

### 2.2 Informasi Arsitektur & Navigasi

Struktur navigasi = **floating bottom bar** (per `design.md` §5 Navigation), 4 tab + FAB tengah:

```
[Dashboard]  [Analytics]  (+ FAB: Add Transaction)  [Budgets]  [Profile]
```

- Auth (Login/Register) berada di luar tab, sebagai gate. Session persisten; tidak ada logout otomatis kecuali token revoked.
- Semua screen list-heavy wajib menyisakan clearance bawah ≥96px + `env(safe-area-inset-bottom)` (aturan `design.md` §3).

### 2.3 User Stories & Acceptance Criteria

#### Epic A — Autentikasi

| ID | Story |
|---|---|
| A1 | Sebagai pengguna baru, saya ingin mendaftar dengan email + password agar data saya terikat pada akun yang hanya saya akses. |
| A2 | Sebagai pengguna kembali, saya ingin login agar melanjutkan data saya sebelumnya. |

**AC:**
- Register: email valid (format + verifikasi email via Supabase Auth), password ≥8 karakter, ≥1 huruf + ≥1 angka. Gagal validasi → pesan inline, tidak ada request ke Supabase. Teks terkunci: "Email dan password wajib diisi", "Email tidak valid", "Password minimal 8 karakter", "Password harus memuat huruf dan angka" (revisi R2).
- Setelah verifikasi email & login pertama: otomatis di-*seed* 1 wallet "Cash" (opening balance 0). Proses seed idempotent (aman diulang). Kategori default **tidak** dikopi per-user — kategori sistem §4.2 sudah tersedia untuk semua akun (revisi R2).
- Login gagal (email/password salah) → pesan generik "Email atau password salah" (tidak membocorkan mana yang salah).
- Session persisten via refresh token; app re-open → langsung ke Dashboard tanpa login ulang.
- Sign out (Profile) → hapus session lokal + seluruh storage lokal aplikasi, kembali ke Login (revisi R2; purge cache persisten menyusul saat cache `expo-sqlite` lahir di T5).

#### Epic B — Multi-Wallet

| ID | Story |
|---|---|
| B1 | Sebagai pengguna, saya ingin membuat beberapa wallet (bank, e-wallet, cash, kartu kredit) agar posisi tiap sumber dana terlihat terpisah. |
| B2 | Sebagai pengguna, saya ingin saldo total gabungan di Dashboard tanpa harus membuka tiap wallet. |

**AC:**
- Wallet punya: `name`, `type` (enum: `bank`, `ewallet`, `cash`, `card`), `opening_balance`, warna/icon dari token design (tanpa custom color picker di MVP).
- Maksimum 10 wallet per user (konstrain DB + validasi client).
- Saldo wallet = `opening_balance + Σ(income) − Σ(expense)` — dihitung via SQL view, **tidak pernah disimpan sebagai kolom mutable** (mencegah drift).
- Saldo total Dashboard = Σ saldo semua wallet, dirender `currency-display` JetBrains Mono.
- **Transfer antar-wallet bukan bagian MVP** (lihat Non-Goals); skema `transactions.type` menyediakan enum `transfer` untuk v1.1.
- Hapus wallet hanya boleh jika memiliki 0 transaksi; jika ada transaksi → UI menawarkan reassign ke wallet lain (bulk update) atau tolak.

#### Epic C — Transaksi

| ID | Story |
|---|---|
| C1 | Sebagai pengguna, saya ingin mencatat pengeluaran/pemasukan <20 detik agar pencatatan tidak terasa seperti kerjaan. |
| C2 | Sebagai pengguna, saya ingin melihat riwayat transaksi terbaru di Dashboard agar tahu arus kas hari ini. |
| C3 | Sebagai pengguna, saya ingin mengedit/menghapus transaksi agar data akurat. |

**AC (logika fungsional Add Transaction):**
- Toggle segmented **Expense/Income** — pilihan terakhir diingat (persist lokal), default `expense`.
- Entry amount: keyboard numerik kustom; validasi: `0 < amount ≤ 999,999,999,999` (12 digit), maks 2 desimal; bukan NaN/Infinity. Live-format `id-ID` saat mengetik; glyph `Rp` statis warna gold.
- Kategori: grid ikon (Material Symbols) dari kategori yang aktif **sesuai tipe transaksi** — income hanya melihat kategori income, dst.
- Tanggal: default *now*, bisa diubah via date picker, maksimal hari ini (tidak boleh future date untuk income/expense).
- Catatan (note): opsional, maks 200 karakter, di-trim.
- Wallet: default = wallet yang dipakai pada transaksi terakhir; bisa diganti.
- Simpan → optimistic insert + idempotency key (UUID v4 dibuat saat form dibuka; dikirim sebagai header `x-idempotency-key`); retry aman.
- Hapus → konfirmasi modal (destructive, pakai token error `#FFB4AB`), soft-delete (`deleted_at`), 30 hari retention lalu hard-delete oleh cron.
- Daftar transaksi: infinite scroll 20/halaman, grouped per tanggal (`label-uppercase` divider), row = ikon kategori dalam lingkaran `#2C2C2E`, nama `body-md #E5E5E5`, timestamp `body-sm #8E8E93`, amount `currency-md` — income `+#D4AF37`, expense `#E5E5E5` tanpa tanda minus di warna merah (aturan `design.md` §1).

#### Epic D — Analytics ("Financial Intelligence")

| ID | Story |
|---|---|
| D1 | Sebagai pengguna, saya ingin melihat distribusi pengeluaran per kategori agar tahu ke mana uang mengalir. |
| D2 | Sebagai pengguna, saya ingin membandingkan tren antar periode agar tahu apakah saya membaik. |

**AC (logika fungsional):**
- Segmented range: `1M` (bulan berjalan), `3M`, `6M`, `1Y`, `ALL` — aktif = gold pill dengan glow (token `design.md` §5).
- KPI header: Total Expense, Total Income, Net (income − expense) untuk range aktif, dibandingkan dengan periode sebelumnya yang sama panjang → delta % (naik = gold, turun = `#8E8E93`; tidak ada merah).
- Donut wheel: top 8 kategori expense, sisa digabung "Other". Sudut ≥0.5% baru dirender; center = total expense range.
- Bar chart: agregat harian (range ≤1M) atau bulanan (range >1M). Bar = gradien gold + glow per `design.md` §4.
- Semua agregasi dihitung di Postgres (view / RPC), **bukan** di-fetch mentah lalu dihitung di client. Target p95 <300ms untuk 10k transaksi.
- Filter tambahan (opsional di UI): per wallet.
- Range `ALL` dengan 0 transaksi → empty state (bukan NaN/Infinity).

#### Epic E — Budget & Alert ("Budget Architecture")

| ID | Story |
|---|---|
| E1 | Sebagai pengguna, saya ingin menetapkan batas belanja per kategori per bulan agar tidak overspend. |
| E2 | Sebagai pengguna, saya ingin diberi tahu saat mendekati/melewati batas agar bisa menahan diri. |

**AC (logika fungsional):**
- Budget = baris `(user_id, category_id, amount_limit, month)`; `month` = tanggal 1 UTC dari bulan kalender di **timezone profil user** (default `Asia/Jakarta`).
- Set budget hanya untuk kategori expense. Satu budget per kategori per bulan (unique constraint). Update budget di bulan berjalan diperbolehkan.
- Spent = Σ expense transaksi kategori tsb dalam bulan budget (dihitung server-side).
- Progress ring/bars: fill gradien gold → `#F3E5AB`; track `#2C2C2E` (per `design.md` §5).
- **Threshold logic:**
  - `spent/limit ≥ 80%` dan `< 100%` → state `warning`: ring berubah ke gold penuh + label persentase; push lokal **sekali** per budget per bulan.
  - `spent/limit ≥ 100%` → state `exceeded`: ring bergaris penuh gold; push lokal **sekali** per budget per bulan.
  - Dedup alert disimpan di tabel `budget_alerts (user_id, month, category_id, threshold, fired_at)` — **kunci dedup per-user**: `unique(user_id, category_id, month, threshold)`. Ini disengaja agar kategori sistem yang dipakai bersama banyak akun tidak saling memblokir baris alert; transaksi edit/hapus yang menurunkan % tidak menghapus alert yang sudah fired, dan tidak double-fire di bulan yang sama untuk user tersebut.
- Push = **local notification** (expo-notifications), trigger dievaluasi client-side tepat setelah commit transaksi + saat app foreground; body sesuai bahasa OS (ID/EN).
- Reset bulanan: tidak ada pekerjaan cron — karena `month` adalah dimensi data, budget bulan baru otomatis "kosong" (0 spent). View Analytics/Budget selalu query `month = current_month(tz)`.

#### Epic F — Profile & Settings

| ID | Story |
|---|---|
| F1 | Sebagai pengguna, saya ingin mengatur nama, avatar, dan kategori agar app terasa milik saya. |
| F2 | Sebagai pengguna, saya ingin mengekspor data saya agar tidak terkunci vendor. |
| F3 | Sebagai pengguna, saya ingin menghapus akun & data saya sepenuhnya. |

**AC:**
- Profil: nama (maks 60 char), avatar (upload ke Supabase Storage, maks 2MB, PNG/JPG, di-resize 512×512 sebelum upload).
- Kategori kustom: buat/edit/arsip kategori (nama + ikon dari katalog Material Symbols; warna ikon hanya dari token design — tidak ada custom color). Kategori bawaan tidak bisa dihapus, hanya diarsipkan.
- Pengaturan mata uang: pilihan currency disimpan di profil (default `IDR`, tampilan mengikuti `Intl.NumberFormat`) — **belum ada konversi** (D5).
- Ekspor CSV: query semua transaksi user → file CSV (kolom: date, type, category, wallet, amount, currency, note) → share sheet. Generasi via Edge Function agar tidak membebani memori client.
- Hapus akun: konfirmasi dua langkah (ketik "HAPUS") → Edge Function (service role) menghapus semua baris user + storage avatar; Auth user dihapus. **Tidak reversible** — UI harus menyatakannya eksplisit.

### 2.4 Non-Goals (Tidak dibangun di MVP)

- ❌ Sinkronisasi/agregasi bank (open banking) — v2; hanya skema yang disiapkan.
- ❌ Multi-currency dengan konversi kurs — hanya field `currency_code` di skema.
- ❌ Transfer antar-wallet — v1.1 (enum `transfer` sudah disiapkan).
- ❌ Recurring/subscription transactions — v1.1.
- ❌ Offline write queue (outbox) + read cache — v2.0 (revisi R6; sebelumnya direncanakan v1.1). MVP: tulis butuh koneksi; baca dari cache lokal terakhir.
- ❌ App lock biometrik (Face ID/PIN) — v1.2 (butuh dev-client; lihat R6).
- ❌ Cari/filter riwayat, bulk edit kategori, CSV import, lokalisasi ID/EN — v1.2.
- ❌ Shared/household budget, web version, widget, email digest, AI insights.

---

## 3. AI System Requirements

**Tidak berlaku untuk MVP.** Cashtrix MVP tidak memakai fitur AI/ML. Bagian ini direservasi kosong dengan sengaja; kategori "smart insight" (v2+) akan mendokumentasikan evaluasinya sendiri.

---

## 4. Technical Specifications

### 4.1 Architecture Overview

```
┌─────────────────────────────┐
│  Expo App (iOS/Android)     │
│  - Expo Router (tabs)       │
│  - TanStack Query (cache)   │
│  - expo-notifications       │
│  - expo-sqlite (read cache) │
└──────────┬──────────────────┘
           │ HTTPS / supabase-js
           ▼
┌─────────────────────────────┐     ┌────────────────────┐
│  Supabase                   │     │  Edge Functions    │
│  - Auth (email+password)    │     │  - seed-user       │
│  - Postgres + RLS           │◄────│  - export-csv      │
│  - Views/RPC (agregasi)     │     │  - delete-account  │
│  - Storage (avatar)         │     └────────────────────┘
└─────────────────────────────┘
```

- **State:** TanStack Query sebagai single source untuk data remote; `expo-sqlite` hanya read-through cache untuk list & dashboard (agar app terasa instan saat re-open).
- **Tidak ada state saldo di client yang persisten** — saldo selalu berasal dari SQL view saat fetch; cache hanya untuk render awal.
- **Agregasi** (analytics, budget spent, saldo) semuanya di Postgres via view/RPC. Client tidak pernah menghitung agregat finansial.

### 4.2 Data Model (Postgres)

```sql
-- Semua tabel punya: id uuid pk default gen_random_uuid(), created_at, updated_at timestamptz
-- dan RLS: user_id = auth.uid() (kecuali profiles: id = auth.uid())

profiles (
  id uuid pk references auth.users on delete cascade,
  display_name text not null default 'Pengguna',
  avatar_url text,
  currency_code char(3) not null default 'IDR',
  timezone text not null default 'Asia/Jakarta',
  locale text not null default 'id-ID'
)

wallets (
  id, user_id fk,
  name text not null,
  type text not null check (type in ('bank','ewallet','cash','card')),
  opening_balance numeric(18,2) not null default 0,
  archived_at timestamptz,
  unique (user_id, name)
)

categories (
  id, user_id fk nullable,        -- null = kategori bawaan sistem
  name text not null,
  icon text not null,             -- nama Material Symbols
  kind text not null check (kind in ('income','expense')),
  is_system bool not null default false,
  archived_at timestamptz,
  unique (user_id, name, kind)
)

transactions (
  id, user_id fk,
  wallet_id fk wallets,
  category_id fk categories,
  type text not null check (type in ('income','expense','transfer')), -- 'transfer' reserved v1.1
  amount numeric(18,2) not null check (amount > 0),
  currency_code char(3) not null default 'IDR',   -- siap multi (D5)
  occurred_at timestamptz not null,
  note text check (char_length(note) <= 200),
  idempotency_key uuid not null,
  deleted_at timestamptz,
  unique (user_id, idempotency_key)
)
create index on transactions (user_id, occurred_at desc);
create index on transactions (user_id, category_id, occurred_at);

budgets (
  id, user_id fk,
  category_id fk categories,
  month date not null,            -- selalu hari-1 UTC dari bulan tz user
  amount_limit numeric(18,2) not null check (amount_limit > 0),
  unique (user_id, category_id, month)
)

budget_alerts (
  id, user_id fk,
  category_id fk categories,
  month date not null,
  threshold text not null check (threshold in ('warning_80','exceeded_100')),
  fired_at timestamptz not null default now(),
  unique (user_id, category_id, month, threshold)  -- dedup per-user (revisi §0/§6)
)
```

**View wajib (agregasi server-side):**
- `v_wallet_balances` — saldo per wallet (`opening_balance + Σ income − Σ expense`, exclude soft-delete).
- `v_monthly_summary(user_id, month, tz)` — income/expense/net bulanan.
- `v_category_breakdown(user_id, range_start, range_end)` — untuk donut & bar chart.
- `v_budget_status(user_id, month, tz)` — join budget × spent × % × state (`ok`/`warning`/`exceeded`).

**Seed default (idempotent, via Edge Function `seed-user` saat login pertama):**
- Wallet: "Cash" (type `cash`, opening 0) — satu-satunya baris yang dibuat `seed-user` (revisi R2).
- Kategori default **sudah tersedia sebagai kategori sistem** (migrasi T2, `user_id = NULL`, `is_system = true`), terlihat semua akun lewat policy `categories_select_own_or_system` — tidak ada kategori per-user di seed:
  - expense: Makanan (`restaurant`), Transportasi (`directions_car`), Belanja (`shopping_bag`), Tagihan (`receipt_long`), Hiburan (`movie`), Kesehatan (`medical_services`), Investasi (`show_chart`), Lainnya (`category`).
  - income: Gaji (`payments`), Bonus (`redeem`), Investasi (`trending_up`), Lainnya (`add_circle`).

### 4.3 Integration Points

| Integrasi | Kegunaan | Catatan |
|---|---|---|
| Supabase Auth | Register/login/session | Email verification: auto-confirm untuk pengembangan (R2); wajib konfirmasi manual sebelum rilis publik |
| Supabase Postgres | Semua data domain | RLS aktif di semua tabel |
| Supabase Storage | Avatar | Bucket privat, path `avatars/{user_id}` |
| Supabase Edge Functions | seed-user, export-csv, delete-account | Service role, dipanggil dengan JWT user |
| expo-notifications | Local push budget alert | Tidak butuh server push di MVP |
| Sentry (atau setara) | Crash + performance | Wajib sebelum rilis |
| Analytics event | KPI §1 | Event minimal: `tx_created`, `budget_threshold_reached`, `screen_view` |

### 4.4 Security & Privacy

- **RLS di 100% tabel**; deny-by-default. Tidak ada satu pun tabel policy `USING (true)`. Verifikasi dengan test suite khusus RLS (user A tidak bisa SELECT/UPDATE/DELETE baris user B) — coverage wajib 100% tabel.
- Service role key **hanya** di Edge Functions, tidak pernah di bundle client.
- Tidak ada data finansial di log (client maupun server); Sentry scrubbing untuk field `amount`/`note`.
- Transport: HTTPS wajib (default supabase-js); tanpa cleartext fallback.
- Storage avatar: policy `user_id = auth.uid()` untuk read/write path miliknya.
- Hapus akun (F3) memenuhi hak penghapusan data; ekspor CSV (F2) memenuhi hak portabilitas.
- Idempotency key per transaksi mencegah duplikasi saat retry jaringan.

### 4.5 Design System Compliance (binding ke `design.md`)

Kode UI **wajib** mengonsumsi token berikut — dilarang hardcode hex di komponen:

| Sumber | Wajib dipakai |
|---|---|
| `design.md` §1 | Semua warna (`#0A0A0A`, `#1C1C1E`, `#2C2C2E`, `#3A3A3C`, `#D4AF37`, `#F3E5AB`, `#E5E5E5`, `#8E8E93`, `#FFB4AB`) |
| `design.md` §2 | 12 type tokens (Inter / JetBrains Mono) |
| `design.md` §3 | Skala spacing 4px, margin 20px, clearance nav ≥96px |
| `design.md` §4 | Radius 16/20/24/32/9999px, glow catalog |
| `design.md` §5 | Pola komponen (button 52px, row transaksi, chip, ring) |

- Implementasi token: satu file `theme.ts` (atau setara) sebagai satu-satunya definisi; component library internal tipis, bukan UI kit eksternal.
- Verifikasi visual: setiap screen dibandingkan terhadap render Stitch hanya untuk **layout**; warna mengikuti kanonik (D10), bukan pick dari screenshot.

### 4.6 Testing Strategy

| Lapis | Cakupan | Tool |
|---|---|---|
| Unit — domain | Format uang, boundary budget (79.9/80/99.9/100%), boundary bulan tz (31 Des 23:59 WIB), validasi amount, dedup alert | Jest ≥90% coverage di folder domain |
| Unit — RLS | Matriks akses antar-user, semua tabel | pgTAP / supabase test |
| Integration | Flow auth→seed→tx→budget→alert (dedup fired) | Testcontainers / Supabase local |
| E2E happy path | Register → input 3 tx → lihat dashboard & analytics → set budget → trigger alert | Maestro |
| Visual smoke | Layout vs Stitch (referensi saja) | Manual checklist per rilis |

---

## 5. Risks & Roadmap

### 5.1 Phased Rollout

Katalog lengkap setiap kandidat (termasuk yang ditunda dan yang ditolak) beserta
bukti kondisi kode hidup di **`docs/roadmap.md`**. Tabel di bawah ringkasannya.

| Fase | Isi | Kriteria keluar |
|---|---|---|
| **MVP (v1.0)** | Epic A–F persis seperti §2.3; TestFlight/internal distribution → Play Store + App Store | Semua AC terpenuhi + KPI instrumentasi hidup |
| **v1.1** | **Dibekukan 2026-09-19** (revisi R6): jalur distribusi + instrumentasi crash (EAS + Sentry), reset password, konfirmasi email manual, halaman privasi/ToS, transfer antar-wallet, recurring transactions, kalender penuh, undo hapus, arsip wallet | Tidak ada regresi KPI stabilitas; crash-free terukur; lolos review store |
| **v1.2** | Cari/filter riwayat, bulk edit kategori, inbox notifikasi, ringkasan bulan lalu, biometric app lock, CSV import, lokalisasi ID/EN, 2FA, E2E di CI | — |
| **v2.0** | Offline outbox + read cache, agregasi bank via aggregator (Open Finance), multi-currency + kurs historis, smart insights | Compliance review selesai sebelum rilis |

### 5.2 Technical Risks

| Risiko | Dampak | Mitigasi |
|---|---|---|
| Timezone boundary (bulan budget beda antara server UTC vs user tz) | Budget spent salah hitung / alert salah fire | `month` selalu dihitung dari `profiles.timezone` di satu fungsi SQL (`current_month(tz)`); unit test lintas tz (WIB vs UTC) wajib |
| Double-fire push alert saat retry transaksi | Spam notifikasi → uninstall | `budget_alerts` unique `(user_id, category_id, month, threshold)` (dedup per-user); insert alert pakai `ON CONFLICT DO NOTHING` |
| Drift saldo jika ada kode yang menulis saldo langsung | Data korup | Tidak ada kolom saldo mutable; hanya view. Code review melarang `update wallets set balance` |
| Agregasi lambat saat data besar | Analytics p95 >300ms | Index `(user_id, occurred_at desc)`; view hanya agregasi, pagination di list |
| Expo push/notification permission ditolak | Alert tidak sampai | Alert in-app (ring state) tetap berfungsi tanpa izin push; minta izin hanya saat budget pertama dibuat |
| Drift visual ke hex Stitch (bukan kanonik) | Brand tidak konsisten | Lint rule: hex literal di komponen = error; hanya `theme.ts` boleh berisi hex |
| Supabase downtime | Tidak bisa input | Mode read-only dari cache + banner status; komunikasi jelas, tanpa kehilangan data (tulis ditolak, bukan antrian buta) |

---

## 6. Open Questions

Pertanyaan baru yang muncul selama development wajib ditambahkan ke sini dengan status `OPEN` sebelum keputusan diambil di kode. Katalog dan konteks: `docs/roadmap.md` §4.

| # | Status | Keputusan | Menghambat |
|---|---|---|---|
| OPEN-1 | closed (R7) | Transfer = satu baris, `wallet_id` sumber + `counterparty_wallet_id` tujuan; `amount` positif; hapus/edit satu baris | — |
| OPEN-2 | closed (R7) | Recurring = catch-up RPC saat app buka/foreground; semua Occurrence terlewat dilahirkan di tanggal jatuh tempo masing-masing; identik dengan Transaction manual untuk Spent/Alert | — |
| OPEN-3 | closed (R9) | App lock biometrik: kunci perangkat saja (flag lokal, tanpa state server); grace 60 dtk background→foreground, cold start selalu kunci; biometrik + passcode OS, tanpa PIN app; opt-in via Profile; overlay penuh, lock ≠ sign-out | B4 v1.2 |

Transfer / Recurring / V0 auth-legal tertutup di R7–R8. Tidak ada OPEN yang menghambat spec v1.1.

### 6.1 Revisi tercatat (resolved)

- **R1 — Unique constraint `budget_alerts` (2026-09-17, saat T2/#2).** PRD awal memakai `unique(category_id, month, threshold)`. Karena `categories.user_id` boleh `NULL` (kategori sistem dipakai bersama antar-akun), baris alert pertama akan memblokir user lain: `ON CONFLICT DO NOTHING` membuat user kedua tidak pernah menerima alert-nya. Diputuskan: kunci dedup menjadi **per-user** → `unique(user_id, category_id, month, threshold)`. Berlaku juga di `supabase/migrations/0001_schema.sql`, `specs/cashtrix-mvp.md` §Implementation Decisions, dan acceptance criteria T2 (#2).
- **R2 — Isi seed `seed-user` + strategi verifikasi T3 (2026-09-17, saat T3/#4).** Edge Function `seed-user` hanya membuat wallet **"Cash"** (`type=cash`, opening 0). Kategori default **tidak** dikopi per-user: 12 kategori sistem dari migrasi T2 sudah terlihat semua user lewat policy `categories_select_own_or_system`; menyalinnya akan menduplikasi grid kategori (T5) dan mengubah semantik T8 (kategori bawaan harusnya hanya bisa diarsipkan). Verifikasi T3 memakai Jest untuk fungsi domain murni + verifikasi state DB via MCP/psql (pgTAP `supabase test db` butuh Docker yang tidak tersedia di mesin pengembangan); baris "integration flow auth → seed" di spec dianggap tercakup oleh kombinasi ini. Teks validasi inline Auth dikunci di PRD (lihat Epic A): "Email dan password wajib diisi", "Email tidak valid", "Password minimal 8 karakter", "Password harus memuat huruf dan angka". Verifikasi email diatur **auto-confirm** pada project Supabase hosted (pengecualian tercatat terhadap keputusan awal "Email verification wajib" §4.3; dikembalikan ke konfirmasi manual sebelum rilis publik). Sign out sejak T3 menghapus sesi + seluruh storage lokal aplikasi; purge cache persisten (`expo-sqlite`/TanStack Query) menyusul di T5 saat cache benar-benar ada.
- **R3 — Saldo gabungan & reassign wallet (2026-09-18, saat T4/#5).** Tiga keputusan yang memperjelas AC Epic B (bukan perubahan perilaku yang terlihat user):
  1. **`v_wallet_balances` dibuat `security_invoker = true`.** View biasa dieksekusi dengan hak owner, sehingga RLS tabel di bawahnya ter-bypass dan baris `wallets` user lain ikut teragregasi. Sama pentingnya: Supabase memberi default privileges ke role `anon`, jadi view baru harus di-`revoke all` dari `anon`/`public` sebelum di-`grant select` ke `authenticated`.
  2. **Reassign dilakukan oleh RPC Postgres `reassign_wallet_transactions(from, to)`**, bukan bulk `update` dari client: satu transaksi DB (atomic), `search_path` dikunci, hanya `authenticated` yang boleh `execute`, dan transaksi **soft-deleted ikut dipindah** supaya pemulihan 30 hari tidak menabrak FK `ON DELETE RESTRICT`. AC "tawarkan reassign atau tolak" tetap terpenuhi: FK tetap menolak hapus selama masih ada transaksi.
  3. **`amount` transaksi tidak diubah** (tetap positif dengan `type` sebagai penanda arah), konsisten dengan §4.2; saldo bertanda hanya muncul di view.
- **R4 — `expense` disimpan positif (2026-09-18, saat T4/#5).** Dikonfirmasi ulang dari insiden serupa di proyek lain: agregasi apa pun **wajib** memakai `type` (`income` menambah, `expense` mengurangi) dan tidak boleh menjumlahkan `amount` mentah. `v_wallet_balances` sudah mengikuti aturan ini; view T6/T7 menyusul dengan pola yang sama.
- **R5 — Riwayat transaksi + soft-delete (2026-09-19, saat T5/#6).** Empat keputusan implementasi yang tidak mengubah perilaku yang terlihat user:
  1. **`v_transactions_feed` = satu-satunya sumber riwayat**, dengan `security_invoker = true` dan join `categories` + `wallets` di server. Alternatif "klien join sendiri" ditolak: tiga query terpisah berarti RLS diuji tiga kali dan nama kategori/wallet bisa hilang di antara halaman. View menyaring `deleted_at is null`, jadi batas 20 baris per halaman selalu penuh dan klien tidak pernah bisa menampilkan transaksi terhapus.
  2. **Hapus dan pulih lewat RPC `soft_delete_transaction`/`restore_transaction`**, bukan `update` inline dari klien. Keduanya mengembalikan jumlah baris yang berubah, sehingga "sudah terhapus" dan "bukan milik saya" bisa dibedakan tanpa pesan error khusus, dan idempotensinya jelas (hapus ulang = 0, bukan error).
  3. **Retensi 30 hari dijalankan `pg_cron`** (job `cashtrix-purge-deleted-transactions`, harian 03:00 UTC) memanggil `purge_deleted_transactions()`. Fungsi ini sengaja **bukan** `security definer`: dijalankan cron sebagai `postgres` ia membersihkan semua user, dan jika dipanggil klien ia hanya menyentuh baris sendiri — satu definisi, dua perilaku yang keduanya benar. Ekstensi `pg_cron` di-install di database `postgres` dengan guard `pg_available_extensions` agar image Postgres polos tidak menggagalkan migrasi.
  4. **Tanggal transaksi dipilih dengan stepper hari, bukan date picker native.** AC hanya menuntut "default sekarang, tidak boleh future date"; date picker native (`@react-native-community/datetimepicker`) menambah modul native yang memaksa rebuild dev-client. Stepper memenuhi AC tanpa itu; kalender penuh dicatat sebagai polish v1.1.
  5. **Optimistic insert hanya untuk edit.** Baris baru belum punya id, dan id palsu akan membuat alur hapus/undo menunjuk baris yang tidak ada. Create menunggu `refresh()` selesai (modal menahan spinner selama jeda itu) — edit boleh optimistis karena id-nya sudah diketahui.
  6. **Bug laten di `supabase/tests/database/08_wallet_reassign.sql` (T4) diperbaiki.** Tiga assertion tidak pernah benar: (a) saldo wallet tujuan diharapkan −750.000 padahal `v_wallet_balances` sudah benar mengecualikan soft-deleted (−350.000); (b)–(c) kontrol silang-user membaca `transactions` **sebagai alice**, sehingga RLS menyembunyikan baris bob dan count selalu 0. Kontrol cross-user kini dijalankan sebagai `postgres`, dan `plan()` dikoreksi dari 16 → 15 (file hanya punya 15 assertion).
- **R6 — Cakupan rilis v1.1 dibekukan (2026-09-19).** Sebelumnya §5.1 mencantumkan v1.1 = transfer + recurring + offline outbox + biometric + CSV import. Setelah audit kondisi kode v1.0, prioritas diubah: yang menghambat rilis bukan kekurangan fitur, melainkan (a) crash-free rate belum terukur (transport observability masih ring buffer, `src/features/observability/observability.ts`), (b) belum ada jalur distribusi (`eas.json` tidak ada), dan (c) penolak review store: reset password tidak ada sama sekali, halaman privasi/ToS tidak ada, konfirmasi email masih auto.
  Keputusan:
  1. **v1.1 = V0 pra-rilis + distribusi/instrumentasi + transfer + recurring + kalender penuh + undo hapus + arsip wallet.** Daftar lengkap dan urutannya di `docs/roadmap.md` §3.
  2. **Offline outbox + read cache ditunda ke v2.0.** Fitur ini membalik keputusan MVP "tulis ditolak, bukan antrian buta" (§5.2) dan menyentuh seluruh screen; dikerjakan bersama model konsistensi di v2.0.
  3. **Biometric app lock, CSV import, cari/filter riwayat, bulk edit kategori, lokalisasi ID/EN, 2FA → v1.2.**
  4. **Batasan Expo Go dilonggarkan.** Sampai v1.0 modul native dihindari (R5.4, T6/T7). Untuk v1.1 ke atas dev-client/EAS Build diizinkan untuk fitur yang benar-benar butuh native; kerja JS harian tetap boleh Expo Go. Prebuild lokal (`npx expo run:ios`/`android`) gratis; EAS Free tier = 15 build iOS + 15 build Android per bulan.
  5. **Alur kerja tidak berubah**: revisi PRD → spec → ticket GitHub + blocking edge → PR squash ke `main` → tag `v1.1.0` saat gerbang rilis lolos. Tag `v1.0.0` dipasang mundur di commit rilis MVP.
  6. **`CONTEXT.md` + `docs/adr/` dibuat sekarang** (sebelumnya sengaja lazily). Glosarium ditulis saat istilah diputuskan, bukan di akhir.
  7. **Keputusan terbuka sebelum ticket ditulis** (saat R6): model data Transfer, penjadwal Recurring, bentuk biometric lock. OPEN-1 dan OPEN-2 ditutup di R7; OPEN-3 diparkir v1.2.
- **R7 — Model Transfer dan Recurring (2026-09-19).** Dua keputusan domain yang mengunci skema v1.1:
  1. **Transfer = satu baris.** `type=transfer`, `wallet_id` = sumber, `counterparty_wallet_id` = tujuan, `amount` tetap positif (R4). Saldo gabungan tidak berubah. Analytics / Spent / Alert mengabaikan `type=transfer` (view v1.0 sudah mengecualikannya). Hapus = hapus satu baris. Edit jumlah, tanggal, catatan, atau Wallet sumber/tujuan boleh selama keduanya milik User dan tidak sama. Dua baris berpasangan ditolak: memaksa `amount` negatif atau kolom `direction`, bertentangan R4. ADR-0004.
  2. **Recurring = catch-up RPC, bukan cron.** Saat app buka/foreground, RPC `security invoker` menulis Occurrence yang tanggal jatuh temponya ≤ hari ini dan belum ada Transaction-nya; `occurred_at` = tanggal jatuh tempo, bukan "sekarang". Dua bulan app tertutup = dua Occurrence di tanggal masing-masing. Occurrence identik dengan Transaction manual (masuk Spent, bisa menembus Alert). `pg_cron` ditolak: v1.1 tidak punya server-push, jadi ketepatan cron tidak terlihat User, dan menulis sebagai `postgres` di luar RLS. "Hanya pengingat" ditolak: itu bukan Recurring. ADR-0005.
- **R8 — Bentuk Transfer dan Recurring (2026-09-19).** Melengkapi R7:
  1. **Transfer tanpa Category.** `category_id` nullable iff `type=transfer`. Form Add menambah segmen ketiga Expense | Income | Transfer; pilih Transfer → grid Category hilang, pemilih Wallet tujuan muncul. Category sistem "Transfer" dan "User pilih Category biasa" ditolak (donut / `kind` ketiga).
  2. **Recurring v1.1 = bulanan saja**, Due day 1–28 atau "hari terakhir bulan" (hindari 29–31). Catch-up plafon 12 Occurrence per Recurring rule per sesi buka. Edit Recurring rule hanya mengubah Occurrence yang belum lahir. Kunci anti-ganda `(recurring_rule_id, occurred_on)` termasuk baris Soft-delete. Recurring = income atau expense, bukan Transfer. Dikelola dari Profile. Jeda menghentikan Catch-up; hapus Recurring rule men-SET NULL kaitan Occurrence (riwayat tetap). Wajib `starts_on` (hari-1, default bulan berjalan); opsional `ends_on`. Maks 20 Recurring rule aktif (Jeda tidak makan kuota). Archive Wallet yang dipakai rule → rule otomatis Jeda + banner Profile. Transfer menolak future date; picker Transfer hanya Wallet aktif; riwayat ke Wallet yang kemudian di-Archive tetap terlihat. Undo hapus = snackbar ~5 detik → `restore_transaction` (termasuk Transfer).
  3. **Privasi/ToS** di GitHub Pages (`docs/legal/`, URL publik sama untuk in-app dan store listing, **bahasa Inggris** di v1.1 — ID menyusul v1.2 bersama i18n). **Reset password** = tautan email Supabase → deep link `cashtrix://reset-password`. ADR-0006.
  4. **Reassign vs Transfer:** RPC memindahkan `wallet_id` dan `counterparty_wallet_id`; jika hasilnya sumber = tujuan, reassign ditolak. Occurrence bulan `starts_on` **tidak** lahir bila Due day sudah lewat (siklus berikutnya). **Auth gate v1.1:** session tanpa `email_confirmed_at` ditahan di layar "Cek email" (bukan tabs); E2E menandai terkonfirmasi via Admin API, bukan mematikan konfirmasi di hosted.
- **R9 — App lock device-local (2026-09-23, grill batch 2, menutup OPEN-3).** State kunci hanya di perangkat (flag lokal, tanpa kolom server — tanpa migrasi/RLS/pgTAP). Grace 60 detik background→foreground; cold start selalu kunci. Buka via biometrik + fallback passcode OS (`expo-local-authentication`); tanpa PIN buatan app. Opt-in via toggle Profile (mati default; perangkat tanpa biometrik = disabled + pesan). Overlay penuh pola auth gate; lock ≠ sign-out (sesi Supabase tetap). Modul native baru = satu rebuild preview, ditunda atas keputusan pemilik — kode B4 wajib degrade gracefully bila modul absen (Expo Go). ADR-0007.
