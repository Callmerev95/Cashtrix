# Cashtrix — Personal Finance, Tenang & Privat

**Cashtrix** adalah aplikasi mobile personal finance (iOS & Android) dengan
estetika *private wealth* — obsidian + champagne gold. Input transaksi di bawah
20 detik, multi-wallet, analitik visual yang dihitung server-side, dan budget
per kategori dengan alert ambang batas anti-spam. Semua data milik pengguna
(RLS-scoped per akun).

> **Status: MVP v1.0 selesai.** Seluruh 11 ticket tracer-bullet (T1–T11) sudah
> di-merge ke `main` — lihat [Ticket Map](specs/tickets.md). Dokumen ini adalah
> dokumentasi rilis v1.0.

**Dokumen perencanaan (mengikat):**

| Dokumen | Isi |
|---|---|
| [PRD.md](PRD.md) | Keputusan produk terkunci (D1–D11), KPI, Epic A–F, risiko, revisi R1–R5 |
| [DESIGN.md](DESIGN.md) | Design system kanonik "Minimalist Obsidian" (sumber kebenaran visual) |
| [specs/cashtrix-mvp.md](specs/cashtrix-mvp.md) | Spec MVP v1.0 (user stories, keputusan implementasi, testing) |
| [specs/tickets.md](specs/tickets.md) | Peta ticket T1–T11 + status merge |
| [docs/release-gate.md](docs/release-gate.md) | Gerbang rilis: bukti E2E, KPI, checklist visual, pra-store |

---

## Daftar isi

- [Fitur](#fitur)
- [Teknologi](#teknologi)
- [Struktur repo](#struktur-repo)
- [Memulai](#memulai)
- [Database](#database)
- [Pengujian](#pengujian)
- [Gerbang rilis](#gerbang-rilis)
- [Desain](#desain)
- [Keamanan & privasi](#keamanan--privasi)
- [Keputusan penting](#keputusan-penting)
- [Roadmap](#roadmap)

---

## Fitur

### Auth (Epic A)

- Register email + password dengan validasi inline (format email, ≥8 karakter,
  ≥1 huruf + ≥1 angka).
- Login gagal menampilkan pesan generik "Email atau password salah".
- Login pertama otomatis di-seed 1 wallet **Cash** via Edge Function
  `seed-user` (idempotent); 12 kategori sistem langsung tersedia untuk semua
  akun.
- Sesi persisten (refresh token) — buka ulang app langsung ke Dashboard.
- Sign out menghapus sesi + seluruh storage lokal aplikasi.

### Wallets (Epic B)

- CRUD wallet: nama, tipe (`bank` / `ewallet` / `cash` / `card`), opening
  balance, warna/ikon dari token desain. Maksimal **10 wallet per akun**.
- Saldo gabungan semua wallet di Dashboard — selalu dihitung dari SQL view,
  tidak pernah disimpan di kolom mutable.
- Hapus wallet berisi transaksi ditolak FK — UI menawarkan **reassign massal**
  ke wallet lain (satu transaksi DB via RPC, termasuk transaksi soft-deleted).

### Transaksi (Epic C)

- Form <20 detik: toggle Expense/Income (mengingat pilihan terakhir),
  keyboard numerik kustom + live-format `id-ID` (glyph `Rp` gold statis),
  grid kategori sesuai tipe, stepper tanggal (default sekarang, future date
  ditolak), catatan opsional maks 200 karakter.
- Wallet default = wallet pada transaksi terakhir.
- Idempotency key (UUID v4 per sesi form) — retry jaringan tidak menduplikasi.
- Edit + hapus (konfirmasi destructive). Hapus = **soft-delete**, retensi
  30 hari via job `pg_cron` harian, lalu hard-delete otomatis.
- Riwayat infinite scroll 20/halaman, grup per tanggal. Income gold `+`,
  expense putih muted (tidak pernah merah).

### Analytics (Epic D)

- Rentang `1B` / `3B` / `6B` / `1T` / `Semua` + filter per wallet.
- KPI header (Total Expense, Total Income, Net) dengan delta % vs periode
  sebelumnya yang sama panjang (`—` bila periode lalu nol, bukan NaN).
- Donut top-8 kategori expense + "Other" (arc <0,5% tidak dirender), bar chart
  harian (≤1B) / bulanan (>1B), empty state yang jelas.
- **Satu round-trip**: RPC `analytics_overview` mengembalikan totals + delta +
  breakdown + series (target p95 <300ms pada 10k transaksi). Klien tidak pernah
  menghitung agregat finansial.

### Budget & Alert (Epic E)

- Satu budget per kategori expense per bulan; edit limit bulan berjalan =
  upsert yang sama dengan create.
- Ring progres `ok` → `warning` (≥80%) → `exceeded` (≥100%), boundary-exact.
- Local push tepat setelah commit transaksi yang melewati threshold — **sekali
  per budget per bulan per threshold**, via `ON CONFLICT DO NOTHING`
  (dedup per-user). Edit/hapus yang menurunkan % tidak menghapus alert yang
  sudah fired (tidak ada double-fire saat naik lagi).
- Bulan budget dihitung dari `profiles.timezone` (default `Asia/Jakarta`) oleh
  satu fungsi SQL. Bulan baru otomatis "kosong" tanpa cron.
- Izin push hanya diminta saat budget pertama dibuat; ring in-app tetap jalan
  bila izin ditolak.

### Profile & Settings (Epic F)

- Nama (maks 60 char), avatar (≤2MB PNG/JPG, di-resize 512×512 sebelum upload
  ke bucket privat), currency display (default `IDR`, tanpa konversi).
- Kategori kustom: create/edit/arsip/hapus (nama + ikon katalog Material
  Icons). Kategori sistem hanya bisa **diarsipkan per-user** (via
  `category_mutes`), tidak bisa dihapus — histori tetap valid.
- **Ekspor CSV** (date, type, category, wallet, amount, currency, note) via
  share sheet. **Hapus akun** dua langkah (ketik `HAPUS` + konfirmasi) —
  menghapus seluruh data + avatar + auth user.

### Observabilitas (T10, non-fungsional)

- Event analytics minimal: `screen_view`, `tx_created`,
  `budget_threshold_reached` (hanya fakta kasar — tanpa amount/note, PRD §4.4).
- Sink crash reporting dengan **scrubbing rekursif** field finansial + buffer
  lokal + transport injeksi untuk Sentry kelak. Tanpa modul native (tetap
  kompatibel Expo Go).

---

## Teknologi

| Lapisan | Pilihan |
|---|---|
| App | React Native + Expo SDK 57, Expo Router (4 tab + FAB tengah) |
| Bahasa | TypeScript (strict, `tsc --noEmit`) |
| Backend | Supabase: Postgres + Auth + RLS + Storage + Edge Functions |
| State server | Context per fitur di atas Supabase client tunggal (`src/supabase/`) |
| Chart | `View` polos (donut = ring tick terotasi, bar = kolom gradient) — tanpa `react-native-svg`, tanpa dev-client rebuild |
| Notifikasi | `expo-notifications` (local push), izin on-demand |
| Unit test | Jest (preset `jest-expo`) — fungsi domain murni |
| DB test | pgTAP (`supabase/tests/database/`, 13 file, 258 assertion) |
| E2E | Maestro (gerbang rilis, bukan driver desain) |
| CI | GitHub Actions — `.github/workflows/release-gate.yml` |

**Keputusan terkunci (PRD §0, D1–D11):** React Native + Expo, Supabase, manual
entry, single currency IDR (skema multi-ready), personal maks 10 wallet, budget
per kategori reset tiap tanggal 1, alert in-app + local push, warna & font dari
`DESIGN.md` — bukan dari layar Stitch.

---

## Struktur repo

```
Cashtrix/
├── app/                    # Expo Router: (auth)/, (tabs)/ + modal & layar stack
│   ├── (auth)/             #   login, register (di luar tab = auth gate)
│   ├── (tabs)/             #   index (Dashboard), analytics, budgets, profile
│   ├── add-transaction.tsx #   form transaksi (create + edit ?id=)
│   ├── budget-form.tsx     #   form budget (create + edit ?id=)
│   ├── wallets.tsx / wallet-form.tsx
│   ├── categories.tsx / category-form.tsx
│   └── delete-account.tsx
├── src/
│   ├── features/           # 8 modul: auth, wallets, transactions, analytics,
│   │                        # budgets, profile, data-ownership, observability
│   │                        # tiap modul: domain.ts (pure, Jest seam) + api.ts
│   │                        # + *-context.tsx + components/
│   ├── components/         # komponen bersama (Card, Button, Screen, …)
│   ├── theme/              # theme.ts = SATU-SATUNYA tempat hex literal
│   └── supabase/           # client tunggal (persist AsyncStorage)
├── supabase/
│   ├── migrations/         # 8 migrasi (skema → wallets → tx → analytics →
│   │                        # budgets → profile/mutes → icon dashes)
│   ├── functions/          # seed-user, export-csv, delete-account
│   └── tests/database/     # suite pgTAP (00_setup + 01–12)
├── __tests__/              # suite Jest (13 file, 218 test)
├── scripts/                # verify-t5..t9, verify-t11 (verifikasi live)
├── .maestro/flows/         # happy-path.yaml (gerbang) + smoke.yaml
├── .github/workflows/      # release-gate.yml (CI pertama repo)
└── docs/                   # release-gate.md + docs/agents/
```

**Aturan implementasi yang mudah dilanggar (PRD §4):**

- Tidak ada kolom saldo mutable — saldo hanya dari view
  (`opening_balance + Σ income − Σ expense`).
- Semua agregasi finansial di Postgres (view/RPC), tidak pernah di klien.
- Bulan budget dari `profiles.timezone`, bukan UTC — satu fungsi SQL.
- RLS di 100% tabel, deny-by-default; dedup alert via unique constraint.

---

## Memulai

### Prasyarat

- Node 22, npm
- Expo Go (development) atau Maestro CLI + simulator/emulator (E2E)
- Docker/Podman — hanya untuk `npm run db:test` (pgTAP via container)
- Project Supabase hosted `Cashtrix` (`ap-southeast-2`) untuk verifikasi live

### 1. Install & env

```sh
npm install
cp .env.example .env   # isi EXPO_PUBLIC_SUPABASE_ANON_KEY (publishable key,
                       # aman di bundle — RLS yang menjaga)
```

> Service role key **tidak pernah** masuk bundle — hanya di Edge Functions
> (PRD §4.4).

### 2. Database

Sumber kanonis: `supabase/migrations/*.sql`. Terapkan via:

```sh
supabase db push --linked
```

atau MCP `apply_migration` dengan isi file identik (jangan divergen).

### 3. Jalan

```sh
npm run ios        # / android / start
npx expo export --platform android --output-dir /tmp/out   # bundle check tanpa device
```

`ios/` dan `android/` tidak di-commit (generated, Expo managed).

### Perintah

| Perintah | Fungsi |
|---|---|
| `npm run lint` | ESLint (termasuk larangan hex di luar `theme.ts`) |
| `npm run typecheck` | `tsc --noEmit`, 0 error |
| `npm run test` | Jest — hapus `__tests__/.session-seed.json` dulu bila stale |
| `npm run db:test` | pgTAP — butuh Docker; alternatif tanpa Docker: `psql` per AGENTS.md |
| `npm run e2e:check` | Kontrak statis selektor Maestro (tanpa device/DB — jalan di CI) |
| `npm run e2e:verify` | Mirror API-level happy path (membuat + menghapus user uji sendiri) |

---

## Database

**7 tabel:** `profiles` (id = auth.uid, timezone default `Asia/Jakarta`,
currency default `IDR`), `wallets` (enum `bank/ewallet/cash/card`,
`unique(user_id, name)`, batas 10 via trigger), `categories` (`user_id`
nullable = kategori sistem; `kind` income/expense), `transactions`
(`amount > 0`, `type` income/expense + `transfer` reserved v1.1, note ≤200
char, `unique(user_id, idempotency_key)`, soft-delete `deleted_at`),
`budgets` (`unique(user_id, category_id, month)`), `budget_alerts`
(`unique(user_id, category_id, month, threshold)` — dedup **per-user**),
`category_mutes` (arsip per-user atas kategori sistem).

**4 view** (semua `security_invoker = true`, `revoke` dari `anon`/`public`,
`grant select` ke `authenticated`): `v_wallet_balances`,
`v_transactions_feed`, `v_monthly_summary`, `v_budget_status`.

**RPC utama:** `reassign_wallet_transactions`, `soft_delete_transaction` /
`restore_transaction` / `purge_deleted_transactions` (job `pg_cron` harian
03:00 UTC), `current_month(tz)`, `v_category_breakdown`,
`v_analytics_series`, `analytics_overview`.

**RLS:** 32 policy deny-by-default (4 per tabel × 7 tabel + 4
`storage.objects` untuk bucket privat `avatars`, 2MB, PNG/JPG). Tanpa
`USING (true)`. Hardening bonus: FK komposit
`transactions(wallet_id, user_id) → wallets(id, user_id)`.

**Edge Functions** (deploy tanpa Docker:
`npx supabase functions deploy <nama> --use-api`): `seed-user` (idempotent,
mengambil `user_id` dari JWT — tidak pernah dari body), `export-csv`,
`delete-account`.

---

## Pengujian

Tiga lapis, sesuai `specs/cashtrix-mvp.md` § Testing Decisions:

| Lapis | Tool | Cakupan | Status v1.0 |
|---|---|---|---|
| Unit domain | Jest, 13 suite | Format `id-ID`, validasi amount, boundary threshold 79.9/80/99.9/100, boundary bulan tz, dedup alert, scrubbing | **218/218 hijau** |
| Unit RLS/SQL | pgTAP, 13 file | Matriks antar-user 100% tabel, constraint, limit 10 wallet, storage, trigger profil, kategori sistem, saldo, reassign, transaksi, analytics, budget, mutes | **258 assertion hijau** |
| Live per fitur | `scripts/verify-t*.mjs` | Alur nyata via anon client: T5 (33 check), T6, T7, T8, T9 (termasuk `delete-account` tanpa residu) | Hijau |
| E2E gerbang | Maestro + `verify-t11.mjs` | Register → 3 tx → Dashboard & Analytics → budget → trigger alert (22 check: mirror API + kontrak selektor + cleanup mandiri) | Hijau (device run manual) |

Konvensi: tidak ada regresi pada suite ticket sebelumnya — setiap ticket
menjalankan ulang seluruh suite. `verify-t*.mjs` meninggalkan user uji
kecuali T9/T11 yang menghapus dirinya sendiri; sisanya dibersihkan manual
(`delete from auth.users where email like 't%-verify-%'`).

---

## Gerbang rilis

Detail penuh: [docs/release-gate.md](docs/release-gate.md). Ringkasnya,
per rilis wajib:

1. **Maestro hijau** — `.maestro/flows/happy-path.yaml` di emulator/simulator
   (butuh dev build + akun `e2e@cashtrix.test`); `smoke.yaml` untuk iterasi
   cepat read-only.
2. **Event KPI terbukti** — saring log perangkat untuk `[analytics]` selama
   run: `screen_view`, `tx_created`, `budget_threshold_reached` ketiganya
   wajib muncul.
3. **Checklist visual 7 layar** — layout vs Stitch (referensi saja), warna
   selalu token kanonik, clearance nav ≥96px.
4. **Tanpa regresi** — Jest + pgTAP + skrip verify hijau.
5. **Crash-free** tercatat selama sesi uji manual.

**CI** (`release-gate.yml`, tiap push/PR ke `main`): lint → typecheck → Jest
→ `e2e:check` → `expo export`. Job live (`e2e:verify`) hanya saat push ke
`main` — tanpa secret, tanpa residu.

**Sebelum TestFlight / Play Store:**

- Kembalikan `auth.email.enable_confirmations` ke konfirmasi manual (hosted
  masih auto-confirm untuk dev — PRD §6.1 R2).
- Jangan `supabase config push` dari repo root (menimpa `site_url`/OTP/MFA/
  Twilio) — pakai workdir minimal per properti.
- Bersihkan akun uji (`email like '%cashtrix.test'`).

---

## Desain

Sumber kebenaran visual adalah [DESIGN.md](DESIGN.md) ("Minimalist
Obsidian") — Stitch hanya referensi **layout**.

- Kanvas `#0A0A0A`, card `#1C1C1E`, elevated/border `#2C2C2E` /
  `#3A3A3C`, aksen gold `#D4AF37` (+ soft `#F3E5AB`), teks `#E5E5E5` /
  `#8E8E93`, error `#FFB4AB` (destruktif saja).
- Inter untuk teks struktural, **JetBrains Mono untuk semua nilai moneter**.
- Expense = putih muted (tidak pernah merah); income = gold `+`.
- Spacing skala 4px, margin 20px, clearance nav ≥96px; radius 16/20/24/32/9999;
  button 52px, tap target min 44px; floating nav frosted + FAB 56px gradient gold.
- **Hex literal hanya di `src/theme/theme.ts`** — ditegakkan lint
  (`no-restricted-syntax`); komponen mengonsumsi via alias `@/theme`.
- Drift Stitch yang diketahui (diabaikan): abu M3 `#131313`/`#1C1B1B`
  (API Stitch menurunkan token dari seed — tidak bisa menyimpan kanonik) dan
  Public Sans pada token currency.

---

## Keamanan & privasi

- RLS deny-by-default di 100% tabel + bucket avatar privat (`user_id =
  auth.uid()`); `anon` dicabut.
- Service role key hanya di Edge Functions. HTTPS wajib (default supabase-js).
- **Tanpa data finansial di log** — client maupun server; scrubbing
  `amount`/`note`/kawan-kawannya di sink observability.
- Idempotency key per transaksi mencegah duplikasi saat retry.
- Hak pengguna: ekspor CSV (portabilitas, F2) + hapus akun total
  (penghapusan, F3).

---

## Keputusan penting

Penuhnya di PRD §6.1; yang paling memengaruhi kode:

- **R1** — Dedup `budget_alerts` per-user `unique(user_id, category_id, month,
  threshold)` (kunci lama tanpa `user_id` menabrak antar-user pada kategori
  sistem bersama).
- **R2** — `seed-user` hanya membuat wallet Cash; kategori default tidak
  dikopi per-user (12 kategori sistem sudah terlihat semua akun). Verifikasi
  email auto-confirm selama dev.
- **R3/R4** — View saldo `security_invoker = true` + revoke anon; reassign
  via RPC atomik; `amount` selalu positif dengan `type` sebagai arah —
  agregasi wajib memakai `type`.
- **R5** — Riwayat hanya dari `v_transactions_feed`; hapus/pulih via RPC yang
  mengembalikan jumlah baris; retensi 30 hari via `pg_cron`; stepper tanggal
  (tanpa date picker native agar tetap Expo Go).

---

## Roadmap

- **v1.1** — Transfer antar-wallet, recurring transactions, offline outbox,
  biometric app lock, CSV import. Kandidat: notification inbox
  (`budget_alerts` sudah punya `fired_at` + indeks user/month, belum ada flag
  read).
- **v2.0** — Agregasi bank via aggregator (Open Finance), multi-currency +
  kurs historis, smart insights. Compliance review sebelum rilis.

---

*Cashtrix MVP v1.0 — Tenang, cepat, privat. Melihat posisi keuangan dalam
hitungan detik.*
