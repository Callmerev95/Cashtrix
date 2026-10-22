# Spec: Cashtrix Savings v1 — Target Tabungan

Sumber: grill 2026-10-21, `PRD.md` D1–D11 + R15, `CONTEXT.md`, `DESIGN.md`,
`docs/roadmap.md` §6.11, ADR-0018. Istilah mengikuti `CONTEXT.md`; jangan drift
ke daftar `_Avoid_`.

Status: disetujui pemilik 2026-10-21. Rilis: **2.1.x OTA** (runtime 2.1.0,
tanpa modul native baru, tanpa bump versi). Tiket: SV1 → SV2 → SV3 → SV4.

Status implementasi: **SV1–SV4 selesai + commit di `main`** (2026-10-21);
`verify-savings.mjs` 44/44, pgTAP 29/29, OTA final grup `718599fe`
(runtime 2.1.0), device gate LULUS. PRD R16 menunggu approval per-baris
pemilik.

## Problem Statement

Dompet menjawab "uang saya ada di mana", bukan "uang ini sedang dikumpulkan
untuk apa". Evelyn menandai tujuan tabungan di catatan terpisah, lalu mencocokkan
saldo Dompet dengan target secara manual. Solusi envelope/ledger terpisah akan
menghitung uang yang sama dua kali dan membuat Transfer makin rumit: uang pindah
Dompet, tapi saldo tujuan tidak boleh ikut pindah dua kali. Yang dibutuhkan
bukan rekening baru, melainkan satu lapisan tujuan di atas Dompet yang sudah ada.

## Solution

**Target Tabungan** adalah metadata pada satu Dompet: nama opsional, nominal
target, dan tanggal target opsional. Progress-nya adalah **Saldo Dompet** dari
`v_wallet_balances` — bukan kolom saldo kedua, bukan alokasi virtual. Satu Dompet
memiliki paling banyak satu target. Menabung = Transfer ke Dompet itu; memakai
uang dari Dompet itu menurunkan progress. Tidak ada auto-save, auto-debit, atau
notifikasi target.

Permukaan v1:

- Kartu ringkas di Dashboard (setelah section Dompet, sebelum ringkasan bulan
  lalu) → `/savings`.
- Layar `/savings`: daftar target aktif + progress ring, status, tanggal,
  estimasi bulanan, dan aksi "Tambah dana".
- Form `/savings-form`: buat/edit/hapus target; Dompet terkunci saat edit.
- Tombol "Tambah dana" membuka form Transfer yang sudah ada dengan Dompet tujuan
  terisi — tanpa API setoran baru.

## User Stories

### S1: Membuat target

1. Sebagai pengguna, saya ingin memilih satu Dompet aktif dan menetapkan nominal
   target, agar tujuan tabungan menempel pada uang yang benar-benar sudah saya
   miliki.
2. Sebagai pengguna, saya ingin memberi nama target (opsional; default nama
   Dompet), agar "Liburan Bali" lebih mudah dikenali daripada "BCA".
3. Sebagai pengguna, saya ingin tanggal target opsional, agar target tanpa
   tenggat tetap bisa dibuat.
4. Sebagai pengguna, saya ingin tanggal target baru hanya boleh hari ini atau
   masa depan, agar tidak membuat tenggat yang sudah lewat sejak awal.
5. Sebagai pengguna, saya ingin satu Dompet hanya punya satu target, agar tidak
   ada dua progress yang mengklaim saldo yang sama.
6. Sebagai pengguna, saya ingin target memakai Dompet aktif yang belum punya
   target, agar target di Dompet arsip tidak menambah pilihan baru.

### S2: Melihat progress

7. Sebagai pengguna, saya ingin progress = Saldo Dompet saat ini, agar angka di
   target selalu sama dengan angka di Dompet — tanpa perhitungan kedua.
8. Sebagai pengguna, saya ingin progress otomatis berubah setelah Transfer,
   expense, income, atau edit saldo, karena semua jalur itu sudah me-refresh
   daftar Dompet.
9. Sebagai pengguna, saya ingin melihat ring progress, nominal saat ini, target,
   persen, dan status (`Tercapai` / `Lewat target`), agar posisi saya terbaca
   dalam sekali lihat.
10. Sebagai pengguna, saya ingin persen teks tetap jujur di atas 100% walau ring
    penuh, agar "120% dari target" tidak dipotong menjadi 100%.
11. Sebagai pengguna, saya ingin target yang sudah tercapai tetap terlihat dan
    bisa turun lagi bila saldo berkurang, tanpa auto-archive.
12. Sebagai pengguna, saya ingin target dengan tanggal lewat diberi label
    "Lewat target" yang netral, bukan alarm atau gagal.
13. Sebagai pengguna, saya ingin estimasi `≈ Rp X/bulan` hanya muncul bila
    tanggal target masih ≥30 hari dan target belum tercapai, agar angkanya
    berguna dan tidak menyesatkan.
14. Sebagai pengguna yang menyembunyikan saldo (eye), saya ingin progress target
    ikut disamarkan, agar nominal Dompet tidak bocor lewat target/estimasi.

### S3: Mengelola

15. Sebagai pengguna, saya ingin melihat semua target aktif di `/savings` dan
    target dengan tenggat terdekat di Dashboard, agar tidak perlu membuka satu
    per satu.
16. Sebagai pengguna, saya ingin edit nama, nominal, dan tanggal; Dompet tidak
    bisa diganti saat edit, agar identitas target tidak berpindah diam-diam.
17. Sebagai pengguna, saya ingin tanggal lama yang sudah lewat tetap tersimpan
    saat edit dan bisa dikosongkan, agar target lama tidak dipaksa berubah hanya
    karena dibuka.
18. Sebagai pengguna, saya ingin menghapus target tanpa menghapus Dompet atau
    transaksinya, agar salah target mudah dibatalkan.
19. Sebagai pengguna, saya ingin target di Dompet arsip disembunyikan dari
    daftar, dengan jumlahnya disebut, agar daftar tetap bersih tanpa menyembunyikan
    fakta.
20. Sebagai pengguna, saya ingin Dompet yang punya target tidak bisa dihapus
    sebelum targetnya dihapus, agar tidak ada target yatim dan reassign tidak
    berjalan setengah.

### S4: Menabung

21. Sebagai pengguna, saya ingin tombol "Tambah dana" membuka Transfer dengan
    Dompet tujuan terisi, agar menabung tetap satu alur yang sudah dikenal.
22. Sebagai pengguna, saya ingin sumber Transfer default ke Dompet aktif lain
    (bukan Dompet tujuan), agar tidak membuat Transfer ke diri sendiri.
23. Sebagai pengguna, saya ingin tombol "Tambah dana" nonaktif bila hanya ada
    satu Dompet aktif, agar tidak membuka form yang mustahil disimpan.

### Gerbang

24. Sebagai pemilik, saya ingin gate rilis (Jest, pgTAP, `verify-savings.mjs`,
    kontrak statis, legal, export Android, device gate) tanpa regresi.

## Implementation Decisions

**Terkunci:** PRD D1–D11 + R15, ADR-0018, `CONTEXT.md`, DESIGN.md §1/§5.
Nominal, saldo, dan progress tidak pernah dihitung dari daftar transaksi klien.

### Model data (SV1)

Tabel baru `public.savings_goals`:

```sql
create table public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  wallet_id uuid not null,
  name text,
  target_amount numeric(18,2) not null,
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, wallet_id),
  foreign key (wallet_id, user_id)
    references public.wallets (id, user_id) on delete restrict,
  check (target_amount > 0 and target_amount <= 999999999999),
  check (name is null or char_length(btrim(name)) between 1 and 60)
);
```

- `name` kosong disimpan sebagai `NULL`, bukan string kosong.
- `target_date` nullable; **tidak** ada check relatif `now()` (target lama harus
  tetap valid saat edit). Aturan "baru harus hari ini/masa depan" hidup di domain
  klien; DB hanya menjaga bentuk tanggal.
- FK komposit memakai `wallets(id, user_id)` yang sudah ada (pola Transfer/V2);
  `on delete restrict` adalah backstop untuk guard UI.
- Index tambahan `(wallet_id, user_id)` untuk sisi child FK; unique
  `(user_id, wallet_id)` melayani lookup per user.
- Trigger `savings_goals_set_updated_at` memakai `public.set_updated_at()`.
- Maksimum 10 target mengikuti batas 10 Dompet; **tanpa trigger kuota baru**
  (satu target per Dompet + Dompet maks 10).
- RLS aktif, 4 policy `to authenticated` (`select`/`insert`/`update`/`delete`
  dengan `user_id = (select auth.uid())`; update memakai `USING` + `WITH CHECK`).
- `revoke all on public.savings_goals from anon, public`;
  `grant select, insert, update, delete ... to authenticated`;
  `grant all ... to service_role`. Tanpa view/RPC baru.

Migrasi: `supabase/migrations/20261021090000_savings_goals.sql`.
pgTAP: `supabase/tests/database/21_savings_goals.sql` (next setelah 20).

### Domain murni (SV2)

`src/features/savings/domain.ts` adalah seam Jest:

- `SavingsGoal` + `SavingsGoalView` (goal + nama/flag arsip Dompet + Saldo).
- `NAME_MAX_LENGTH = 60`; batas nominal memakai `AMOUNT_MAX` yang sudah ada.
- `progressPercent(targetAmount, balance)`: 0 bila target ≤0 atau saldo ≤0;
  tidak pernah `NaN`/`Infinity`; boleh >100.
- `ringFillFor(percent)`: clamp 0..1.
- `savingsStatus(goal, balance, today)`: `achieved` bila saldo ≥ target;
  `overdue` bila belum tercapai dan `target_date < today`; selain itu `active`.
- `remainingAmount`, `daysUntil`, `formatTargetDate`, `dateLabel` (hari ini /
  N hari lagi / lewat target), `estimatePerMonth`:
  - hanya untuk `active` dengan `target_date` dan `daysUntil >= 30`;
  - `remaining = target − balance`; null bila ≤0;
  - `ceil((remaining / (daysUntil / 30)) / 1000) * 1000`;
  - presentasi saja, bukan jadwal transfer.
- `validateSavingsGoal(input, { today, originalDate })`:
  - Dompet wajib (create); nominal wajib, >0, ≤`AMOUNT_MAX`;
  - nama trim, ≤60; kosong → `null`;
  - tanggal kosong → `null`; tanggal baru < hari ini ditolak; tanggal yang sama
    dengan `originalDate` saat edit tetap diterima walau sudah lewat.
- `sortSavingsGoals` (tanggal terdekat dulu, null terakhir, lalu `created_at`).
- `pickDashboardGoal` (hasil sort pertama), `hiddenGoalCount` (goal pada Dompet
  arsip), `availableWallets` (aktif dan belum punya goal).
- `MASKED_SAVINGS_PERCENT = '••%'`; saldo memakai `MASKED_BALANCE_ROW` dari
  `wallets/visibility.ts`.

### API + provider (SV2)

`src/features/savings/api.ts`:

- `listSavingsGoals()` — `savings_goals` milik user, order `created_at`.
- `createSavingsGoal({ walletId, name, targetAmount, targetDate })`.
- `updateSavingsGoal(id, patch)` — scope `.eq('id').eq('user_id', session)` karena
  PostgREST menolak UPDATE tanpa WHERE (pola T8).
- `deleteSavingsGoal(id)`.
- `23505` pada create/update → pesan "Dompet ini sudah punya target" (bukan
  error mentah).

`src/features/savings/savings-context.tsx`:

- `SavingsProvider` **di dalam `WalletsProvider`**, **di luar
  `TransactionsProvider`**. Butuh `useWallets()` saja.
- Menyimpan raw goal rows; derive `goals` (hanya Dompet aktif) dan
  `hiddenGoalCount` saat render dari `wallets` + `archivedWallets`; **tanpa
  `setState` di effect**. `goalForWallet` mencakup Dompet arsip untuk guard hapus.
- Expose `goals`, `hiddenGoalCount`, `goalForWallet`, `availableWallets`,
  `loading`, `error`, `refresh`. Refresh memakai in-flight guard (pola
  wallets/transactions). Purge in-memory lewat `onLocalDataPurge`.
- Tanpa Supabase Realtime: progress ikut berubah karena setiap mutasi transaksi
  sudah memanggil `refreshWallets()`.

Urutan provider final:
`Wallets > Savings > Transactions > Budgets > Analytics > Recurring > Profile > Mfa`.

### Ring (SV3)

`SavingsRing` baru di `src/features/savings/components/savings-ring.tsx`.

- **Jangan reuse `BudgetRing`**: warna state budget (gold/amber/salmon) akan
  menyalahartikan target sebagai anggaran. Geometri sama (stroked `<Circle>`,
  mulai dari atas, track `surfaceElevated`, cap membulat), tetapi satu warna
  **gold statis** `colors.accent`.
- Ukuran: Dashboard 56–64px; `/savings` 72–84px. `react-native-svg` sudah ada
  di binary (ADR-0017) — tanpa rebuild.
- Fill = `ringFillFor(percent)`; persen teks memakai `formatRingPercent` dan
  boleh >100%; ring tetap penuh pada 100%.
- Center ring: persen. Status/tanggal/nominal berada di luar ring (tidak
  dijejalkan ke dalam hole).
- Eye hidden: fill 0 (track saja), persen `MASKED_SAVINGS_PERCENT`, nominal
  saat ini `MASKED_BALANCE_ROW`, estimator dan status disembunyikan. Target
  tetap terlihat karena itu rencana, bukan Saldo.
- A11y: `accessibilityRole="progressbar"`, label
  "{nama target}: Rp X dari Rp Y, Z%" (atau "progress disembunyikan" tanpa
  nominal saat eye aktif). TestID aditif `savings-ring`, `savings-ring-fill`,
  `savings-ring-percent`.

### Dashboard (SV3)

- Sisipkan kartu `dashboard-savings` **setelah section Dompet** dan **sebelum**
  `MonthlySummaryCard` di `app/(tabs)/index.tsx`.
- Isi: ring + nama target prioritas (`pickDashboardGoal`) + Dompet + nominal
  saat ini/target + status/tanggal/estimasi + "N target lain" bila >1.
- Bila belum ada target: kartu empty dengan CTA "Buat target" → `/savings-form`
  (bukan menghilang diam-diam, karena ini pintu discover fitur).
- Tap kartu → `/savings`.
- Eye hidden mengikuti aturan ring di atas.

### Layar `/savings` (SV3)

- Route stack root (bukan tab baru), `Screen` + header kembali.
- Daftar kartu target aktif, urut `sortSavingsGoals`; pull-to-refresh memanggil
  `refreshWallets()` + `refreshSavings()`.
- Kartu: ring, nama, nama Dompet, nominal/target, persen, status, tanggal +
  label hari, estimasi, tombol "Tambah dana". Tap kartu → `/savings-form?id=`.
- `hiddenGoalCount > 0` → catatan "N target di Dompet arsip" (tanpa membuka
  target; unarchive dulu lewat `/wallets`).
- Empty: ajakan membuat target; bila semua Dompet aktif sudah punya target,
  tombol create nonaktif + hint.
- Error → `ErrorStateCard`; loading → skeleton baris (pola list yang ada).

### Form `/savings-form` (SV3)

- Modal root; `?id=` = edit. Create: picker Dompet aktif tanpa target; edit:
  Dompet read-only.
- Field: Dompet, nama (opsional, placeholder nama Dompet), nominal
  (`AmountField` + `formatAmountInput`), tanggal opsional.
- Tanggal: toggle "Punya tanggal target" + `CalendarGrid`; create future-only
  (`disablePast`), edit menampilkan tanggal lama (termasuk yang lewat) dan bisa
  dikosongkan. `CalendarGrid` mendapat prop aditif `disablePast` (default
  `false`, form Add bit-identik).
- Simpan → create/update → `refreshSavings()` → `router.back()`.
- Hapus (edit) → destructive confirm sheet (pola budget/transaction); tidak
  menyentuh Dompet/transaksi.
- Copy error inline; `23505` ramah; copy lewat kamus `savings`.

### Tambah dana (SV3)

- `app/(tabs)/savings` → `router.push('/add-transaction?type=transfer&to=<walletId>')`.
- `app/add-transaction.tsx` menerima param `to`; param hanya prefill tujuan,
  bukan menyimpan otomatis. Sumber default = Dompet aktif pertama selain tujuan;
  bila sumber yang diingat sama dengan tujuan, fallback ke Dompet lain.
- Tombol nonaktif + hint bila hanya satu Dompet aktif (tidak ada sumber) atau
  Dompet target diarsip.
- Setelah Transfer save, `refreshWallets()` yang sudah ada membuat progress
  target ikut segar; tanpa wiring baru.

### Dompet arsip / hapus (SV3)

- Target pada Dompet arsip tidak tampil di daftar/Dashboard; `hiddenGoalCount`
  menyebut jumlahnya. Unarchive → target muncul lagi.
- `/wallets` delete flow: **cek `goalForWallet(walletId)` sebelum reassign**.
  Bila ada, tampilkan Alert "Dompet ini punya target tabungan. Hapus target
  dulu." dengan aksi ke `/savings` (atau `/wallets` bila target tersembunyi);
  jangan panggil `reassignAndDeleteWallet` sama sekali. FK `restrict` adalah
  backstop, bukan alur utama.

### i18n + a11y (SV3)

Namespace `savings` di `src/i18n/{id,en}.ts` (paritas dikunci
`i18n-dictionary.test.ts`): judul, empty, status, tanggal, estimasi, form,
validasi, hidden, Tambah dana, a11y ring/kartu. Semua nominal/ tanggal memakai
helper bahasa aktif; leaf domain tidak impor komponen. Tanpa kunci baru di
luar `savings` kecuali `common` yang sudah ada.

### Gate (SV4)

- pgTAP 21; live `scripts/verify-savings.mjs` masuk matriks CI `live` setelah
  `verify-v4.mjs`.
- Tanpa flow Maestro baru; kontrak statis tetap 112 id / 10 teks / 3 KPI.
- Device gate manual: create, Dashboard, add funds, ring, eye, archive, delete
  guard, edit tanggal lewat, EN.

## Testing Decisions

**Database (SV1).** pgTAP `21_savings_goals.sql`: bentuk tabel/kolom; unique
`(user_id, wallet_id)`; FK komposit menolak Dompet user lain; `on delete
restrict` menolak hapus Dompet bertarget; check nominal 0/negatif/>batas; nama
61 karakter; RLS alice/bob (select/insert/update/delete) + no-op sunyi;
anon tanpa hak; cascade saat user dihapus. Fixture tanggal masa lalu, UUID hex,
`begin … rollback`.

**Domain (SV2).** Jest `savings-domain.test.ts`: percent 0/50/100/120; status
achieved/overdue/active; boundary hari 29/30; estimasi pembulatan ke atas per
1000 dan null saat achieved/lewat; validasi create vs edit tanggal lewat;
nama trim/60; sorting + hidden count + available wallets; mask.
`SavingsProvider` test: derive active/archived, `goalForWallet` arsip, purge,
refresh in-flight.

**UI (SV3).** Jest:
- Dashboard card empty/terisi, prioritas tenggat, "N target lain", eye mask.
- `/savings` list/empty/error, tap → form, Tambah dana → route dengan `to`.
- Form create/edit: Dompet terkunci saat edit, validasi, tanggal lewat
  dipertahankan, hapus confirm.
- `/wallets` guard: goal menghalangi reassign/delete sebelum RPC.
- `CalendarGrid` `disablePast` tanpa mengubah form Add.

**Live (SV4).** `verify-savings.mjs` (pola `verify-t5` + `provisionTestUser`,
butuh `SUPABASE_SERVICE_ROLE_KEY`): signup/seed → create goal → list → update →
unique 23505 → check nominal/nama → cross-user read/update/delete 0 → anon
42501 → delete Dompet bertarget 23503 → delete goal → Dompet bisa dihapus →
cleanup user uji. Assertion progress memakai `v_wallet_balances` setelah
Transfer, bukan menjumlah transaksi di script.

**Gate commands.** `npm run lint`; `npm run typecheck`; `rm -f
__tests__/.session-seed.json && npx jest --maxWorkers=2`;
`node scripts/verify-t11.mjs --static-only`; `node scripts/verify-legal.mjs`;
export Android tanpa sourcemap; OTA preview; device gate manual.

## Out of Scope

- Envelope/ledger saldo terpisah, alokasi virtual, atau kolom "saved amount".
- Auto-debit, auto-save, auto-transfer, atau pengingat/notifikasi target.
- Bunga, return, investasi, atau rekonsiliasi bank.
- Target bersama (shared) atau multi-user.
- Lebih dari satu target per Dompet.
- Target pada Dompet arsip untuk create baru.
- Laporan/analytics khusus tabungan, filter target di Analytics, atau kategori
  "Tabungan".
- Multi-currency (OPEN-4) dan konversi kurs.
- Perubahan PRD. R16 disiapkan setelah spec dan butuh approval per-baris.

## Further Notes

- ADR: `docs/adr/0018-savings-goal-tied-to-wallet.md`.
- Roadmap: `docs/roadmap.md` §6.12; tiket: `specs/tickets.md` SV1–SV4.
- Rilis 2.1.x OTA; tanpa rebuild, tanpa bump `appVersion`. Tag/bump 2.2.0
  ditunda sampai ada perubahan native/arsitektur.
- Setelah merge: update `AGENTS.md` section Savings, `CONTEXT.md`, roadmap,
  tickets, dan graphify.
