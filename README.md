# Cashtrix — Personal Finance, Tenang & Privat

**Cashtrix** adalah aplikasi mobile personal finance (iOS & Android) dengan
estetika *private wealth* — obsidian + champagne gold. Input transaksi di bawah
20 detik, multi-dompet, transfer antar-dompet, transaksi berulang otomatis,
analitik server-side, budget per kategori dengan alert anti-spam, pencarian
riwayat, dan inbox notifikasi. Satu pengguna, satu perangkat; semua agregasi
uang dihitung di Postgres, tidak pernah di klien.

> **Status: v1.1.0 rilis (tag `v1.1.0`).** Pasca-1.1.0 selesai penuh
> (A3–A6, B4, C2, C6, D3–D5, skeleton + Maestro device GREEN 2026-09-25).
> Berikutnya: **v1.2.0 — Pintasan + scan struk** (S1 deep-link → S2 lampiran
> 30 hari → S3 OCR prefill, spec beku).
> Peta ticket: [specs/tickets.md](specs/tickets.md).

**Dokumen perencanaan (mengikat):**

| Dokumen | Isi |
|---|---|
| [PRD.md](PRD.md) | Keputusan produk terkunci (D1–D11), KPI, Epic A–F, risiko, revisi R1–R10 |
| [DESIGN.md](DESIGN.md) | Design system kanonik "Minimalist Obsidian" (sumber kebenaran visual) |
| [specs/cashtrix-mvp.md](specs/cashtrix-mvp.md) | Spec MVP v1.0 |
| [specs/cashtrix-v1.1.md](specs/cashtrix-v1.1.md) | Spec v1.1 (V0–V6) |
| [specs/cashtrix-v1.2.md](specs/cashtrix-v1.2.md) | Spec v1.2 (S1–S3 pintasan + scan, gerbang `1.2.0`) |
| [specs/tickets.md](specs/tickets.md) | Peta ticket: T1–T11, V0–V6, A3–A6, D4, B4, C6, C2/D5/D3, S1–S3 + RLS |
| [docs/roadmap.md](docs/roadmap.md) | Katalog ide + urutan rilis + keputusan OPEN |
| [docs/adr/](docs/adr/) | ADR-0001..0009 (scope, dev-client, transfer, recurring, legal, lock, i18n, shortcut/scan) |
| [docs/release-gate.md](docs/release-gate.md) | Gerbang rilis: bukti E2E, KPI, checklist visual, pra-store |
| [docs/store-submit.md](docs/store-submit.md) | Mekanik submit TestFlight / Play Store |
| [CONTEXT.md](CONTEXT.md) | Glosarium + konteks domain |

---

## Daftar isi

- [Fitur](#fitur)
- [Teknologi](#teknologi)
- [Arsitektur & konvensi](#arsitektur--konvensi)
- [Struktur repo](#struktur-repo)
- [Memulai](#memulai)
- [Database](#database)
- [Pengujian](#pengujian)
- [Rilis & distribusi](#rilis--distribusi)
- [Desain](#desain)
- [Keamanan & privasi](#keamanan--privasi)
- [Keputusan penting](#keputusan-penting)
- [Roadmap](#roadmap)

---

## Fitur

### Auth + gate email (Epic A, V0)

- Register email + password dengan validasi inline (format email, ≥8 karakter,
  ≥1 huruf + ≥1 angka); pesan error terpetakan client-side, bukan string server.
- Sesi tanpa `email_confirmed_at` ditahan di layar **Cek email** (bukan tabs),
  dengan tombol kirim ulang; deep link `cashtrix://check-email` menukar kode
  PKCE / hash token sendiri (`detectSessionInUrl: false`).
- **Lupa password**: tautan email Supabase → deep link
  `cashtrix://reset-password`.
- Login pertama pasca-konfirmasi otomatis di-seed 1 dompet **Cash** via Edge
  Function `seed-user` (idempotent); 12 kategori sistem langsung tersedia.
- Sesi persisten — buka ulang app langsung ke Dashboard. Sign out menghapus
  sesi + seluruh storage lokal aplikasi.

### Dompet (Epic B, V4)

- CRUD dompet: nama, tipe (`bank` / `ewallet` / `cash` / `card`), opening
  balance. Maksimal **10 dompet per akun** (trigger).
- Saldo gabungan di Dashboard — selalu dari SQL view, tidak pernah disimpan di
  kolom mutable.
- Hapus dompet berisi transaksi ditolak FK — UI menawarkan **reassign massal**
  ke dompet lain (satu transaksi DB via RPC, termasuk transaksi soft-deleted).
- **Arsip dompet**: `archived_at` menyembunyikan dari Dashboard + semua picker
  tanpa menghapus riwayat; transfer lama ke dompet terarsip tetap bernama.
  Arsip otomatis menjeda rule recurring yang memakai dompet itu.

### Transaksi (Epic C, V2, V4, V5, A3, A4)

- Form <20 detik: segmen Expense / Income / **Transfer**, keyboard numerik
  kustom + live-format `id-ID`, grid kategori sesuai tipe (transfer tanpa
  kategori — `category_id` nullable khusus transfer), **grid kalender `View`**
  (tanpa date picker native), catatan ≤200 karakter, future date ditolak
  (trigger DB, toleransi 1 menit).
- Transfer = satu baris (`wallet_id` sumber + `counterparty_wallet_id`
  tujuan, amount positif); saldo sumber − / tujuan + / gabungan diam;
  analytics & budget mengabaikan transfer.
- Idempotency key (UUID v4 per sesi form) — retry jaringan tidak menduplikasi
  (konflik `23505` dianggap sudah tersimpan).
- Hapus = **soft-delete** (retensi 30 hari via `pg_cron`, lalu hard-delete)
  dengan **snackbar "Urungkan" ~10 detik** (`restore_transaction`).
- Riwayat virtualisasi (`SectionList`, grup per hari, sticky divider),
  paging 20/halaman; **pencarian** teks (catatan + kategori + dompet) dengan
  filter jenis + debounce 300ms di layar `/search`.
- **Bulk edit kategori**: mode pilih di layar search (sejenis terkunci,
  transfer dikecualikan), satu UPDATE atomic dengan guard `type` server-side.

### Analytics (Epic D, A6)

- Rentang `1B` / `3B` / `6B` / `1T` / `Semua` + filter per dompet, semua
  diagregasi server dalam **satu round-trip** (`analytics_overview`;
  target p95 <300ms pada 10k transaksi). Klien tidak pernah menjumlahkan
  `amount`.
- KPI header dengan delta % vs periode sebelumnya yang sama panjang (`—` bila
  periode lalu nol). Donut top-8 expense + "Other", bar chart harian/bulanan,
  empty state eksplisit.
- **Ringkasan bulan lalu** di Dashboard (dari `v_monthly_summary`, zero-fill
  bukan lubang) — tap menuju Analytics.

### Budget & alert (Epic E, A5)

- Satu budget per kategori expense per bulan (upsert = create = edit),
  bulan dari `profiles.timezone` via fungsi SQL `current_month(tz)`.
- Ring progres `ok` → `warning` (≥80%) → `exceeded` (≥100%), boundary-exact
  antara SQL dan klien.
- Evaluasi threshold selalu membaca ulang server pasca-commit (tidak pernah
  dari cache pra-commit); local push + banner in-app, **dedup per-user**
  (satu alert per budget per bulan per threshold via `ON CONFLICT DO NOTHING`).
- **Inbox notifikasi** (`/notifications`): grup per bulan, tap menandai dibaca
  + menuju Budgets, aksi "tandai semua dibaca"; dot unread di bel Dashboard.

### Transaksi berulang (V3)

- Rule bulanan: jatuh tempo 1–28 atau akhir bulan, `starts_on` wajib,
  `ends_on` opsional, maks **20 rule aktif** (jeda tidak makan kuota).
- **Catch-up RPC** saat app dibuka / foreground: occurrence yang terlewat
  lahir di tanggal jatuh temponya masing-masing (plafon 12 per rule per sesi,
  anti-ganda termasuk soft-delete). Occurrence identik dengan transaksi manual
  (masuk spent, bisa memicu alert). Tanpa server-push di v1.x.

### Profile & data milik pengguna (Epic F, T8, T9)

- Nama (≤60 char), avatar (≤2MB PNG/JPG, resize 512×512 sebelum upload ke
  bucket privat, tampil via signed URL), currency display (default `IDR`,
  tanpa konversi).
- Kategori kustom (nama + ikon katalog, ≤40 char); kategori sistem hanya bisa
  diarsipkan per-user via `category_mutes` — histori tetap valid.
- **Ekspor CSV** via share sheet (transfer = satu baris `type=transfer`,
  kategori `Transfer ke {tujuan}`). **Hapus akun** dua langkah (ketik `HAPUS`)
  via Edge Function — menghapus seluruh data + avatar + auth user.

### Ketahanan & status (D4)

- Banner offline in-flow (NetInfo) + **refresh otomatis** semua data +
  catch-up saat koneksi kembali, tanpa memblokir app open.
- `ErrorStateCard` seragam dengan retry di 6 permukaan: Analytics, Budgets,
  Search, Notifikasi, section Dompet & Riwayat Dashboard.

### Observabilitas (T10)

- Event minimal `screen_view`, `tx_created`, `budget_threshold_reached`
  (fakta kasar saja — tanpa amount/note, PRD §4.4).
- **Sentry nyata** via `configureTransport` yang di-inject (crash-free ≥99,5%),
  scrubbing rekursif field finansial sebelum keluar perangkat.

---

## Teknologi

| Lapisan | Pilihan |
|---|---|
| App | React Native 0.86.3 + Expo SDK 57, Expo Router (auth group + 4 tab + FAB) |
| Bahasa | TypeScript strict (`tsc --noEmit`), React 19 |
| Backend | Supabase (project `Cashtrix`, `ap-southeast-2`): Postgres + Auth + RLS + Storage + Edge Functions |
| State server | Context per fitur di atas satu Supabase client (`src/supabase/`) + refresh eksplisit (tanpa Realtime, tanpa TanStack/RTK) |
| Chart | `View` polos (donut = ring tick terotasi, bar = kolom gradient, ring budget = 48 tick) — tanpa `react-native-svg` |
| Notifikasi | `expo-notifications` (local push), izin on-demand |
| Konektivitas | `@react-native-community/netinfo` (modul native — berimplikasi rebuild, lihat [Rilis](#rilis--distribusi)) |
| Crash reporting | `@sentry/react-native` via transport injeksi |
| Media | `expo-image-picker` + `expo-image-manipulator` (avatar; modul Expo Go) |
| Unit test | Jest (preset `jest-expo`) — fungsi domain murni |
| DB test | pgTAP (`supabase/tests/database/`, 17 file, 374 assertion) |
| E2E | Maestro (`happy-path` + `smoke`) + cermin API `verify-t11` |
| CI | GitHub Actions — `release-gate.yml` (lint → typecheck → Jest → kontrak statis → export; matriks live saat push `main`) |
| Distribusi | EAS (profil `development` / `preview` / `production`), `expo-dev-client`, OTA `expo-updates` (`runtimeVersion: appVersion`) |

**Keputusan terkunci (PRD §0, D1–D11):** React Native + Expo, Supabase, manual
entry, single currency display (skema siap multi), personal maks 10 dompet,
budget per kategori reset tiap tanggal 1, alert in-app + local push, warna &
font dari `DESIGN.md` — bukan dari layar Stitch.

---

## Arsitektur & konvensi

- **Auth gate tunggal** (`app/_layout.tsx`): memulihkan sesi sebelum first
  paint (splash ditahan), satu-satunya tempat yang navigasi atas state auth.
- **Rantai provider** (dalam → luar: Profile → Recurring → Analytics →
  Budgets → Transactions → Wallets → Auth), dibungkus `DataProviders` dengan
  `key={user.id}` sehingga tiap login me-remount dan fetch segar; refresh
  berpasangan memakai ulang promise in-flight (tanpa query ganda).
- **Tiap modul fitur** = `domain.ts` (murni, seam Jest) + `api.ts` (Supabase)
  + `*-context.tsx` + `components/`. Modul: `auth`, `wallets`,
  `transactions`, `analytics`, `budgets`, `profile`, `recurring`,
  `connectivity`, `data-ownership`, `observability`.
- **Aturan yang mudah dilanggar (PRD §4):** tidak ada kolom saldo mutable;
  semua agregasi finansial di Postgres; bulan budget dari timezone user;
  RLS 100% tabel deny-by-default; dedup alert via unique constraint.
- **Tanpa `setState` di effect** untuk sinkronisasi form (lint
  `react-hooks/set-state-in-effect`); derivasi saat render
  (`override ?? preferensi ?? baris termuat ?? opsi pertama`).
- **TestID statis** untuk kontrak Maestro (`verify-t11 --static-only`);
  rute baru wajib `expo start` sekali untuk regen router types.
- **Hex literal hanya di `src/theme/theme.ts`** (lint
  `no-restricted-syntax`); komponen mengonsumsi via alias `@/theme`
  (`@/*` → `src/*` di tsconfig + jest).

---

## Struktur repo

```
Cashtrix/
├── app/                      # Expo Router
│   ├── _layout.tsx           #   auth gate + rantai DataProviders
│   ├── (auth)/               #   login, register, check-email, forgot/reset-password
│   ├── (tabs)/               #   index (Dashboard), analytics, budgets, profile
│   ├── add-transaction.tsx   #   form transaksi (create + edit ?id=)
│   ├── search.tsx            #   cari + filter + bulk edit kategori
│   ├── notifications.tsx     #   inbox alert budget
│   ├── recurring(.tsx|-form) #   rule berulang + form
│   ├── budget-form.tsx wallets.tsx wallet-form.tsx
│   ├── categories.tsx category-form.tsx delete-account.tsx
├── src/
│   ├── features/             # 10 modul (domain + api + context + components)
│   ├── components/           # bersama: ErrorStateCard, UndoSnackbar, …
│   ├── theme/                # theme.ts = satu-satunya tempat hex
│   └── supabase/             # client tunggal (persist AsyncStorage)
├── supabase/
│   ├── migrations/           # 11 migrasi (kanonis — jangan divergen)
│   ├── functions/            # seed-user, export-csv, delete-account
│   └── tests/database/       # pgTAP 00_setup + 01–16
├── __tests__/               # 26 suite Jest (hapus .session-seed.json bila stale)
├── scripts/                  # verify-t5..t9, verify-t11, verify-v2/v3/v4, verify-a5,
│                             # provision-e2e, seed-bulk, lib/admin-confirm
├── .maestro/flows/           # happy-path.yaml + smoke.yaml
├── .github/workflows/        # release-gate.yml (+ pages.yml legal)
├── docs/                     # roadmap, release-gate, store-submit, adr/, legal/, agents/
└── specs/                    # cashtrix-mvp.md, cashtrix-v1.1.md, tickets.md
```

`ios/` dan `android/` tidak di-commit (generated, Expo managed).

---

## Memulai

### Prasyarat

- Node 22, npm
- Expo Go (loop JS harian) atau dev build (fitur native: NetInfo; segera
  biometric + deteksi locale)
- Project Supabase hosted `Cashtrix` untuk verifikasi live
- Docker/Podman — hanya untuk `npm run db:test` (alternatif: `psql` langsung
  per AGENTS.md)

### 1. Install & env

```sh
npm install   # biasa saja — JANGAN npx expo install (gagal EALLOWSCRIPTS di repo ini);
              # versi modul native mengikuti node_modules/expo/bundledNativeModules.json
cp .env.example .env   # isi EXPO_PUBLIC_SUPABASE_ANON_KEY (publishable key,
                       # aman di bundle — RLS yang menjaga)
```

> Service role key **tidak pernah** masuk bundle atau repo — hanya via env
> sekali pakai untuk skrip verifikasi, lalu unset + verifikasi bersih.

### 2. Database

Sumber kanonis: `supabase/migrations/*.sql`. Terapkan via:

```sh
supabase db push --linked
```

atau `apply_migration` dengan isi file identik (jangan divergen).

### 3. Jalan

```sh
npm run ios        # / android / start
npx expo export --platform android --output-dir /tmp/out   # bundle check tanpa device
```

### Perintah

| Perintah | Fungsi |
|---|---|
| `npm run lint` | ESLint (termasuk larangan hex di luar `theme.ts`) |
| `npm run typecheck` | `tsc --noEmit`, 0 error |
| `npm run test` | Jest — hapus `__tests__/.session-seed.json` dulu bila stale (untracked, jangan commit) |
| `npm run db:test` | pgTAP — butuh Docker; alternatif `psql` per AGENTS.md |
| `npm run e2e:check` | Kontrak statis selektor Maestro (tanpa device — jalan di CI) |
| `npm run e2e:verify` | Mirror API-level happy path (self-cleanup user uji) |

---

## Database

**8 tabel:** `profiles` (id = auth.uid, timezone `Asia/Jakarta`, currency
`IDR`, locale `id-ID`), `wallets` (enum `bank/ewallet/cash/card`,
`unique(user_id, name)`, batas 10 via trigger, `archived_at`), `categories`
(`user_id` nullable = kategori sistem; `kind` income/expense), `transactions`
(`amount > 0`, `type` income/expense/transfer, `category_id` nullable khusus
transfer, `counterparty_wallet_id`, note ≤200 char,
`unique(user_id, idempotency_key)`, soft-delete `deleted_at`,
`recurring_rule_id` + `occurred_on`), `budgets`
(`unique(user_id, category_id, month)`), `budget_alerts`
(`unique(user_id, category_id, month, threshold)` — dedup **per-user**,
plus `read_at` nullable untuk inbox), `category_mutes` (arsip per-user atas
kategori sistem), `recurring_rules` (due 1–28 / akhir bulan, `starts_on`
wajib, `ends_on` opsional, maks 20 aktif via trigger).

**4 view** (semua `security_invoker = true`, `revoke` dari `anon`/`public`,
`grant select` ke `authenticated`): `v_wallet_balances`,
`v_transactions_feed`, `v_monthly_summary`, `v_budget_status`.

**RPC yang dipanggil klien:** `reassign_wallet_transactions` (bulk-move
atomik, termasuk soft-deleted; collapse sumber=tujuan ditolak),
`soft_delete_transaction` / `restore_transaction` (mengembalikan jumlah
baris — 0 = bukan milik/tidak ada), `purge_deleted_transactions` (job
`pg_cron` harian 03:00 UTC; sebagai `postgres` membersihkan semua user,
sebagai `authenticated` terbatasi RLS), `current_month(tz)`,
`v_category_breakdown`, `v_analytics_series`, `analytics_overview`
(satu round-trip seluruh layar Analytics; `delta.*` null saat periode lalu
nol), `run_recurring_catchup` (plafon 12/rule/sesi, `ON CONFLICT DO NOTHING`).

**RLS:** deny-by-default di 100% tabel (tanpa `USING (true)`; `anon`
dicabut) + 4 policy `storage.objects` untuk bucket privat `avatars`
(2MB, PNG/JPG). Hardening: FK komposit
`transactions(wallet_id, user_id) → wallets(id, user_id)` dan pasangan
counterparty-nya; trigger `enforce_transaction_no_future` (23514).

**Edge Functions** (deploy tanpa Docker:
`npx supabase functions deploy <nama> --use-api`; `verify_jwt` tetap aktif;
`user_id` selalu dari JWT, tidak pernah dari body): `seed-user`
(idempotent), `export-csv`, `delete-account`.

---

## Pengujian

Empat lapis; setiap ticket menjalankan ulang seluruh suite (tanpa regresi):

| Lapis | Tool | Cakupan | Status |
|---|---|---|---|
| Unit domain | Jest, 26 suite | Format id-ID, validasi amount, threshold 79.9/80/99.9/100, boundary bulan tz, dedup alert, kalender, search, bulk, undo-window, reload pasca-login, tone warna, konektivitas, recurring, inbox | **340/340 hijau** |
| Unit RLS/SQL | pgTAP, 17 file | Isolasi antar-user semua tabel, constraint, limit 10 wallet, storage, trigger profil, kategori sistem, saldo, reassign, transaksi, analytics, budget, mutes, transfer, recurring, arsip, alert-read | **374 assertion hijau** |
| Live per fitur | `scripts/verify-*.mjs` | Alur nyata via anon client + Admin API (`provisionTestUser`): T5/T6/T7/T8/T9, transfer (V2), recurring (V3), arsip+undo (V4), inbox (A5), kontrak statis + mirror E2E (T11) | Hijau, self-cleanup |
| E2E device | Maestro | Login → 3 txn + alert → transfer → rule + catch-up → hapus + urungkan (`happy-path`); `smoke` read-only | Manual per gerbang |

Konvensi: skrip live butuh `SUPABASE_SERVICE_ROLE_KEY` via env sekali pakai
(konfirmasi email aktif di hosted membuat signup anon domain `.test`
ditolak — provisioning hanya via Admin API); user uji dibersihkan
(`delete from auth.users where email like …`), residu diverifikasi 0.
Uji scroll massal via `scripts/seed-bulk.mjs` (200 txn, cleanup `--cleanup`).
Akun E2E persisten via `scripts/provision-e2e.mjs` (selalu jalur login).

---

## Rilis & distribusi

Detail penuh: [docs/release-gate.md](docs/release-gate.md). Per rilis wajib:
Maestro hijau → event KPI (`screen_view`, `tx_created`,
`budget_threshold_reached`) → checklist visual → tanpa regresi → crash-free
tercatat → tag (`v1.0.0` di `492a117`, `v1.1.0` di HEAD gerbang).

- **EAS**: 3 profil (`development` / `preview` / `production`); kerja JS
  harian tetap di Expo Go, dev-client untuk fitur native.
- **OTA** (`expo-updates`, `runtimeVersion: appVersion`): update JS mengalir
  tanpa rebuild — **kecuali tiap modul native baru** (fingerprint mismatch →
  update ditolak diam-diam, tanpa crash). Pelajaran D4 (`netinfo`): satu
  modul baru = satu rebuild preview (~10 mnt). Rebuild gabungan berikutnya
  mencakup `expo-local-authentication` (B4) + `expo-localization` (C6).
- **CI** (`release-gate.yml`): lint → typecheck → Jest → `e2e:check` →
  `expo export`; matriks live penuh (`verify-t5/t6/t7/t8/t9/v2/v3/v4/t11`)
  saat push `main` dengan 2 secret, self-cleanup.
- **Sebelum TestFlight / Play Store** (`docs/store-submit.md`): kembalikan
  `auth.email.enable_confirmations` ke manual (hosted masih auto-confirm
  untuk dev); jangan `supabase config push` dari repo root (pakai workdir
  minimal per properti); bersihkan akun uji; hutang terbuka: email dukungan
  + screenshot HP.

---

## Desain

Sumber kebenaran visual adalah [DESIGN.md](DESIGN.md) ("Minimalist
Obsidian") — Stitch hanya referensi **layout**.

- Kanvas `#0A0A0A`, card `#1C1C1E`, elevated/border `#2C2C2E` /
  `#3A3A3C`, aksen gold `#D4AF37` (+ soft `#F3E5AB`), teks `#E5E5E5` /
  `#8E8E93`, error `#FFB4AB` (destruktif saja).
- Inter untuk struktural, **JetBrains Mono untuk semua nilai moneter**
  (diimpor per-weight, bukan root paket).
- Semantik nominal: income `#30D158`, expense `#FF6B62`, net gold, Total
  Saldo putih; persen ring budget bukan nominal — tetap putih.
- Spacing skala 4px, margin 20px, clearance nav ≥96px; radius 16/20/24/32/9999;
  button 52px, tap target min 44px; floating nav frosted + FAB 56px gradient gold.
- Divider hairline `colors.border`: Dashboard (ringkasan–Riwayat) + tiap grup
  hari kecuali pertama.
- **Hex literal hanya di `src/theme/theme.ts`** — ditegakkan lint;
  komponen mengonsumsi via alias `@/theme`.
- Drift Stitch yang diketahui (diabaikan): abu M3 `#131313`/`#1C1B1B`
  (API Stitch menurunkan token dari seed) dan Public Sans pada token currency.

---

## Keamanan & privasi

- RLS deny-by-default di 100% tabel + bucket avatar privat; `anon` dicabut;
  view agregasi `security_invoker` + grant minimal (tanpanya saldo user lain
  bocor — ditangkap pgTAP).
- Service role key hanya di Edge Functions / env sekali pakai. HTTPS wajib.
- **Tanpa data finansial di log** — client maupun server; scrubbing
  `amount`/`note` di sink observability + transport Sentry.
- Idempotency key per transaksi mencegah duplikasi saat retry.
- Hak pengguna: ekspor CSV (portabilitas) + hapus akun total (penghapusan).
- App lock biometric device-local (B4, #50): flag lokal, tanpa state server —
  ganti perangkat = opt-in ulang.
- Halaman privasi/ToS (EN) di GitHub Pages, URL sama untuk in-app dan store
  listing; versi Indonesia menyusul bersama i18n (C6, #51).

---

## Keputusan penting

Penuhnya di PRD §6.1 dan [docs/adr/](docs/adr/); yang paling memengaruhi kode:

- **R1** — Dedup `budget_alerts` per-user (kunci lama menabrak antar-user
  pada kategori sistem bersama).
- **R2** — `seed-user` hanya membuat dompet Cash; kategori default tidak
  dikopi per-user. Email auto-confirm selama dev.
- **R3/R4** — View saldo `security_invoker` + revoke anon; reassign via RPC
  atomik; `amount` selalu positif, arah dari `type`.
- **R5** — Riwayat hanya dari `v_transactions_feed`; hapus/pulih via RPC
  berperilaku hitung-baris; retensi 30 hari via `pg_cron`.
- **R6** — Scope v1.1 dibekukan (distribusi + transfer + recurring +
  kalender + undo + arsip); outbox offline & read cache ditunda ke v2.0.
- **R7/R8** — Transfer = satu baris tanpa kategori; recurring = catch-up RPC
  bulanan (bukan cron/pengingat); privasi di Pages; reset via deep link.
- **R9** — App lock device-local, grace 60 dtk, cold start selalu kunci
  (ADR-0007, menutup OPEN-3).
- **R10** — i18n ikut locale OS + kamus terpusat, satu pass termasuk legal
  ID (ADR-0008).
- Pola yang hanya boleh dilanggar dengan revisi PRD dulu: D1–D11.

---

## Roadmap

Katalog lengkap hidup di **[docs/roadmap.md](docs/roadmap.md)**.

- **v1.1.0** ✅ — V0 auth/legal + EAS/Sentry + transfer + recurring +
  kalender + undo + arsip (tag di HEAD gerbang).
- **v1.1.x** ✅ sebagian — transfer di CSV (Opsi B); tunda: email dukungan +
  screenshot HP + run Maestro device.
- **Pasca-1.1.0** ✅ selesai penuh — A6 (#45) → A3 (#46) → A4 (#47) → A5 (#48) →
  D4 (#49) → B4 (#50) → C6 (#51) → C2 (#53) → D5 (#54) → D3 (#52, tetap manual) +
  skeleton/preloader + Maestro device GREEN 2026-09-25.
- **v1.2.0** 🚧 direncanakan — S1 pintasan deep-link → S2 lampiran 30 hari →
  S3 OCR prefill → RLS gerbang + bump minor + polish final UI/UX + screenshot
  store (`specs/cashtrix-v1.2.md`, ADR-0009).
- **v2.0** 🧊 — offline outbox + read cache (satu paket konsistensi, jangan
  dicicil; spec sync mencakup `transaction_receipts` sebagai tipe antrean),
  lalu bank sync, multi-currency + kurs, AI insight.

Prinsip urutan (§6.4): menutup lubang > menambah permukaan; fondasi ada >
butuh keputusan (grill dulu, pola ADR); satu pass lintas-layar dikerjakan
sekaligus.

---

*Cashtrix — Tenang, cepat, privat. Melihat posisi keuangan dalam hitungan detik.*
