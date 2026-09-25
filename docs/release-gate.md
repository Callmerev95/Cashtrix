# Gerbang Rilis — Cashtrix MVP (T11, issue #12)

Satu perjalanan end-to-end terbukti otomatis berjalan di perangkat, plus
checklist bahwa yang dikirim sesuai `DESIGN.md` dan siap masuk TestFlight +
Play Store. Ticket ini adalah frontier terakhir: semua blocker (#7, #8, #9,
#10, #11) sudah closed.

## 1. AC → bukti

| # | Acceptance criteria | Dibuktikan oleh |
|---|---|---|
| 1 | Maestro happy path hijau: register → 3 transaksi → Dashboard & Analytics → set budget → trigger alert | `.maestro/flows/happy-path.yaml` di emulator/simulator + `node scripts/verify-t11.mjs` (mirror API-level, jalan tanpa device) |
| 2 | Instrumentasi KPI §1 terbukti mengirim event selama run E2E | Grep log perangkat untuk `[analytics]` selama run (T10 sink log ke console pada dev build) + cek statis `verify-t11.mjs --static-only` |
| 3 | Checklist visual per layar: layout vs Stitch, warna token kanonik, clearance nav ≥96px | §4 di bawah, manual per rilis |
| 4 | Tidak ada regresi pgTAP + Jest | `npm run test`, `npm run db:test`, `node scripts/verify-t5..t9.mjs` |
| 5 | Crash-free session tercatat selama sesi uji manual | Sesi uji manual + (pasca-rilis) Sentry; T10 sink tidak pernah throw |

## 2. Menjalankan Maestro

Prasyarat: [Maestro CLI](https://maestro.mobile.dev) + dev build di
simulator/emulator (`npx expo run:android` / `npx expo run:ios` — E2E butuh
build yang bisa diinstal, bukan Expo Go).

```sh
# Smoke dulu (read-only, aman di akun apa pun):
maestro test .maestro/flows/smoke.yaml

# Gerbang penuh (menulis: 4 transaksi + 1 budget di akun e2e@cashtrix.test):
maestro test .maestro/flows/happy-path.yaml
```

Konvensi selektor (jangan dilanggar saat menambah layar):

- `id:` = `testID` statis. Semua layar baru wajib memberi `testID` pada
  tiap kontrol yang disentuh flow.
- Sel dengan id dinamis (`category-<uuid>`, `budget-alert-<categoryId>`,
  `tab-<route>`) disapa lewat teks / `accessibilityLabel`
  (`tapOn: "Makanan"`, `assertVisible: "Budget Makanan terlampaui"`).
- `node scripts/verify-t11.mjs --static-only` memverifikasi kontrak ini
  tanpa device dan tanpa DB — dijalankan CI pada setiap push (lihat §5).
  Ceknya ketat: prefix kosong dibuang agar tidak lolos vakum, dan ada
  kontrol negatif (id palsu harus gagal).

Akun E2E: `e2e@cashtrix.test` / `Cashtrix123`. V0: akun harus sudah ada dan
terkonfirmasi (Maestro tidak bisa mengetuk email) — provisi sekali jalan:
`SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/provision-e2e.mjs`
(ulangi setiap habis cleanup `'%cashtrix.test'`). Flow selalu jalur login;
register baru mendarat di Check Email by design (diliput Jest gate +
verify-*.mjs, bukan Maestro).

## 3. Bukti event KPI (AC #2)

Dev build mencatat tiap event observability via `console.info('[analytics]',
name, params)` (`src/features/observability/observability.ts`). Selama
`happy-path.yaml` berjalan, saring log perangkat:

```sh
# Android:
adb logcat | grep '\[analytics\]'
# iOS: Console.app, saring proses app + "[analytics]"
```

Wajib muncul ketiganya, sesuai langkah flow:

| Event | Dipicu oleh |
|---|---|
| `screen_view` | tiap tab (auth gate, T10) |
| `tx_created` `{type, has_note}` | tiap save di add-transaction (tanpa amount/note — PRD §4.4) |
| `budget_threshold_reached` `{threshold: 100, …}` | transaksi 150rb yang menembus budget Makanan |

## 4. Checklist visual per layar (AC #3, manual per rilis)

Stitch hanya referensi **layout**; warna selalu dari token kanonik
(PRD D10, `DESIGN.md` §1). Jangan color-pick dari render Stitch
(abu M3 `#131313`/`#1C1B1B` = drift yang diketahui).

| Layar | Layout vs Stitch | Token | Clearance |
|---|---|---|---|
| Login / Register | stack tengah, card + CTA 52px | bg `#0A0A0A`, card `#1C1C1E`, gold `#D4AF37` | keyboard tidak menutup CTA |
| Dashboard | hero saldo → dompet → riwayat grup harian | income `#30D158`, expense `#FF6B62`, net gold (amandemen DESIGN.md §1, PR #42) | list ≥96px + safe-area |
| Add Transaction | toggle → nominal Mono → grid 3 kolom → dompet chips → grid kalender | glyph `Rp` gold statis, error `#FFB4AB` destruktif saja | modal, tombol Simpan di atas nav |
| Analytics | KPI → donut → bar → breakdown, atau empty state (tanpa NaN) | donut dari `chartRamp` theme | scroll ≥96px |
| Budgets | label bulan → banner alert → ring cards | ring `ok/warning/exceeded`, hole = card | scroll ≥96px |
| Recurring (v1.1) | header Otomatisasi → banner jeda → kartu aturan → CTA Buat aturan | chip aktif gold, teks meta `#8E8E93` | scroll ≥96px |
| Dompet / arsip (v1.1) | Total Saldo → daftar aktif → seksi Arsip | arsip redup, bukan hilang | scroll ≥96px |
| Profile | avatar 40px + badge → nama → currency chips → rows | destruktif `#FFB4AB` hanya Ekspor/Hapus | scroll ≥96px |
| Floating nav | bar frosted + FAB 56px gold gradient | ikon aktif gold, idle `#8E8E93` | bar 64 + overhang 16 + gap 16 = 96 |

## 5. Gerbang otomatis (CI)

`.github/workflows/release-gate.yml` berjalan tiap push/PR ke `main`:

1. `npm run lint` + `npm run typecheck` — 0 error.
2. `npm run test` — Jest, seluruh suite hijau.
3. `node scripts/verify-t11.mjs --static-only` — kontrak selektor Maestro.
4. `expo export --platform android` — bundle check tanpa device.
5. `verify-t11` penuh — hanya di push ke `main`: membuat satu user uji,
   me-replay happy path via API, lalu menghapus dirinya via
   `delete-account` (tanpa secret, tanpa residu).

Yang tetap manual (butuh perangkat): run Maestro hijau + checklist §4 +
sesi crash-free.

## 7. V1.1 — EAS + Sentry + kepatuhan store (issue #30)

Jalur distribusi dan crash yang terukur. `app.json` version `1.1.0`;
`/ios` dan `/android` tetap gitignored (CNG — verifikasi:
`git check-ignore ios android`).

### 7.1 Profil build (`eas.json`)

| Profil | Kegunaan | Distribusi |
|---|---|---|
| `development` | Dev client + modul native (Sentry) di simulator/perangkat | internal (`developmentClient: true`) |
| `preview` | TestFlight internal / Play internal testing | internal |
| `production` | Kandidat store (`autoIncrement` build number) | store |

Dev client gratis tanpa kuota EAS: `npx expo run:ios` / `npx expo run:android`
(prebuild lokal). EAS Free: 15 build iOS + 15 Android/bulan. Kerja JS harian
tetap boleh Expo Go — tanpa DSN (lihat §7.2) app memakai buffer lokal T10.

### 7.2 Sentry via `configureTransport`

- Modul: `src/features/observability/sentry.ts` — `createSentryTransport(client)`
  di belakang seam `configureTransport` yang sudah ada; `app/_layout.tsx`
  memanggil `initSentry()` sebelum `initObservability()`.
- Analytics (`screen_view`, `tx_created`, `budget_threshold_reached`) dikirim
  sebagai Sentry **breadcrumbs** (menempel di laporan crash berikutnya), bukan
  event tersendiri — tanpa biaya kuota.
- Jaminan scrub (PRD §4.4) tiga lapis: builder domain hanya membawa fakta
  kasar → `trackEvent`/`captureError` scrub defensif → transport scrub ulang
  + `beforeSend`/`beforeBreadcrumb` untuk crash native yang mem-bypass keduanya.
- Test: `__tests__/observability-sentry-transport.test.ts` — event berisi
  `amount`/`note` yang diselundupkan tiba di Sentry sebagai `[redacted]`;
  `initSentry` tanpa DSN = no-op (buffer lokal tetap).
- DSN (`EXPO_PUBLIC_SENTRY_DSN`): kosong di `.env` untuk Expo Go harian; diisi
  via `.env` untuk dev-client lokal, via EAS secret untuk remote build:
  `eas env:create --name EXPO_PUBLIC_SENTRY_DSN --value <dsn> --visibility secret --scope project`.

### 7.3 Data Safety (Play) — draf jawaban, konfirmasi saat submit

| Pertanyaan | Jawaban draf |
|---|---|
| Data dikumpulkan | Email (login), info keuangan yang diketik user (transaksi, budget), log crash |
| Dibagikan ke pihak ketiga | Tidak (Supabase = prosesor penyimpanan, Sentry = prosesor crash — bukan bagi-data) |
| Iklan / penjualan data | Tidak ada iklan, tidak ada penjualan |
| Enkripsi transit | Ya (HTTPS/TLS ke Supabase + Sentry) |
| Penghapusan akun | Ya, in-app (`delete-account` → cascade) |
| Target anak | Tidak |

### 7.4 Privacy Manifest (Apple) — draf, konfirmasi saat submit

- `NSPrivacyTracking` = **false**; tidak ada domain tracking. Endpoint yang
  dihubungi hanya Supabase (fungsionalitas app) dan Sentry (crash) —
  keduanya untuk tujuan app, bukan pelacakan lintas-app.
- Required-reason API: yang dipakai tidak langsung oleh kode app melainkan
  lewat Expo SDK/AsyncStorage (`UserDefaults`, file timestamps). Manifest
  final digabung otomatis oleh EAS prebuild dari manifest tiap paket Expo;
  verifikasi sebelum submit: `npx expo prebuild --clean`, periksa
  `ios/<App>/PrivacyInfo.xcprivacy`, cocokkan dengan App Store Connect.

### 7.5 Checklist submit (diisi saat V6)

- [x] `eas init` — `extra.eas.projectId` terisi (`5f8b79b8-2bb3-4fe4-bad8-a970ee18283e`, repo sudah ditautkan)
- [ ] Secret `EXPO_PUBLIC_SENTRY_DSN` (scope project) + `EXPO_PUBLIC_SUPABASE_ANON_KEY` untuk remote build
- [ ] Crash-free rate terpantau di dashboard Sentry pasca-preview
- [ ] §7.3 + §7.4 disalin ke listing Play / App Store Connect apa adanya

## 6. Sebelum naik ke TestFlight / Play Store

- [ ] `auth.email.enable_confirmations` dikembalikan ke konfirmasi manual
  (PRD §6.1 R2 — hosted masih auto-confirm untuk dev).
- [ ] Jangan `supabase config push` dari repo root (AGENTS.md — timpa
  `site_url`/OTP/MFA/Twilio); pakai workdir minimal per properti.
- [ ] Akun uji `e2e@` / `t11-verify-` dibersihkan:
  `delete from auth.users where email like '%cashtrix.test';`
- [ ] Catat versi + tanggal di PR rilis; tutup #12 dengan ringkasan bukti
  (log Maestro, screenshot `t11-happy-path-alert`, angka regresi).

## 8. Gerbang v1.1 (V6, issue #35)

Perluasan §1–§6 untuk rilis store v1.1. Spec induk #28 tetap terbuka sampai
semua bukti di bawah terlampir; #1 tidak disentuh.

### 8.1 AC → bukti

| # | Acceptance criteria (#35) | Dibuktikan oleh |
|---|---|---|
| 1 | Maestro: login → … → Transfer → Recurring catch-up → undo hapus | `.maestro/flows/happy-path.yaml` (bagian V6) di emulator/simulator + `verify-t11.mjs` (mirror API) |
| 2 | `lint` + `typecheck` + `test` hijau | CI `static` job + run lokal pra-tag |
| 3 | pgTAP hijau termasuk suite Transfer + Recurring | `supabase/tests/database/13_transfer.sql` (42) + `14_recurring.sql` (43) + `15_wallet_archive.sql` + 00–12 tanpa regresi |
| 4 | `verify-t5`..`t11` + Transfer/Recurring/undo/auth-confirm hijau | CI `live` job: `verify-t5/t6/t7/t8/t9/v2/v3/v4/t11` berurutan; tiap skrip memprovisi user via Admin API (bukti gate V0: login pre-konfirmasi ditolak `email_not_confirmed`) |
| 5 | Checklist visual (layout vs Stitch, token kanonik, clearance) | §4 (di-refresh untuk warna PR #42 + kalender V5 + layar Recurring/Arsip), manual per rilis |
| 6 | Tag `v1.0.0` mundur + `v1.1.0` | §8.4 |
| 7 | #28 bisa ditutup setelah bukti terlampir | komentar bukti di #35, lalu tutup #28 (jangan sentuh #1) |

### 8.2 Yang berubah dari gerbang T11 (alasan tiap diff)

- **Happy path +3 babak** (`happy-path.yaml`): Tx1 men-tap kind eksplisit
  (`type-option-expense`) agar re-run tahan terhadap `lastType` yang
  tertinggal; Transfer memakai default deterministik (sumber = Cash
  last-used, tujuan = satu-satunya dompet lain) tanpa tap nama dompet —
  nama dompet dinamis per akun dan muncul dua kali di layar Transfer
  (daftar sumber + tujuan); Recurring memakai due `recurring-due-1`
  (tidak pernah future) + tap teks `Bank` (muncul tepat sekali di layar
  itu); relaunch `clearState: false` memicu catch-up AppState; undo
  menghapus baris Makanan teratas lalu `Urungkan` via snackbar.
  Bukti API per langkah: `verify-v2/v3/v4` (CI `live`).
- **Undo bisa dijangkau dari UI** (`app/add-transaction.tsx`): hapus dari
  form edit tidak lagi `dismissUndo()` — itu membuat snackbar V4 tidak
  pernah tampil dari satu-satunya jalur hapus di app. Sheet konfirmasi
  tetap mencegah salah tekan; snackbar menampung sesal sesudahnya.
  Posisi: di atas floating nav (`layout.navClearance + spacing.xl` —
  `bottom: spacing.xl` menaruhnya di zona yang ditimpa tab bar:
  state benar, 0 piksel terlihat). Durasi 10 detik (permintaan pemilik).
- **pgTAP tahan data riil** (`09_transactions.sql`): count pra-purge dan
  nilai balik `purge_deleted_transactions()` di-scope ke fixture alice /
  dilonggarkan ke `>= 1` — DB hosted kini menampung soft-delete user riil
  dan count global goyah karenanya. Konvensi baru: assertion agregat
  sebagai `postgres` wajib ter-scope ke UUID fixture (lih. pelajaran
  T4/T5 di AGENTS.md).
- **Kontrak statis +2 suffix** (`verify-t11.mjs`): `-confirm`/`-cancel`
  komposisi runtime `DeleteConfirmSheet`, sejajar aturan `-action` yang
  sudah ada — base (`delete-confirm`) tetap statis.
- **CI `live` = matriks penuh** (`.github/workflows/release-gate.yml`):
  `verify-t5/t6/t7/t8/t9/v2-transfer/v3-recurring/v4/t11` berurutan,
  tiap skrip self-cleanup (tanpa residu, tanpa secret tambahan selain dua
  yang sudah ada).
- **`provision-e2e.mjs`**: memastikan dompet `Bank`, buka-arsip bila perlu,
  dan membersihkan recurring rules e2e (titik reset antar-run; tiap run
  menambah tepat satu aturan, plafon 20 aktif).
- **Alert budget menyala** (temuan device pasca-V6, `budgets-context.tsx`):
  evaluasi tanpa rows kini baca ulang server (bukan cache pra-commit), plus
  evaluasi setelah save budget, catch-up menulis baris, dan undo-restore.
  Warning 80% (`hampir habis`) + exceeded 100% (`terlampaui`) tiba sebagai
  banner in-app (selalu) + push lokal (bila izin diberikan). Hapus transaksi
  tetap tidak mengevaluasi.

### 8.3 Sisa manual (butuh perangkat)

1. `SUPABASE_SERVICE_ROLE_KEY=<key> node scripts/provision-e2e.mjs`
   (sekali, dan setiap habis cleanup `'%cashtrix.test'`).
2. `maestro test .maestro/flows/smoke.yaml` lalu
   `maestro test .maestro/flows/happy-path.yaml` di dev build.
3. Selama run: `adb logcat | grep '\[analytics\]'` memuat
   `screen_view` + `tx_created` + `budget_threshold_reached`.
4. Checklist §4 per layar + screenshot `v6-happy-path-undo`.
5. Sesi crash-free + Sentry: tanpa DSN app memakai buffer lokal;
   crash-free rate dibaca di dashboard Sentry pasca-preview (§7.5).

### 8.4 Tag

- `v1.0.0` mundur di commit rilis MVP (`492a117` — README MVP v1.0):
  `git tag -a v1.0.0 492a117 -m "Cashtrix v1.0.0 (MVP internal)"`.
- `v1.1.0` di commit gerbang ini (HEAD setelah merge PR V6):
  `git tag -a v1.1.0 <sha> -m "Cashtrix v1.1.0 (rilis store)"`.
- Push tag hanya saat rilis disetujui pemilik: `git push origin v1.0.0 v1.1.0`.
