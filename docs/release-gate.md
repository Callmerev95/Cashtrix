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
| Dashboard | hero saldo → wallet → riwayat grup harian | income gold, expense `#E5E5E5` (tidak pernah merah) | list ≥96px + safe-area |
| Add Transaction | toggle → nominal Mono → grid 3 kolom → wallet chips → stepper tanggal | glyph `Rp` gold statis, error `#FFB4AB` destruktif saja | modal, tombol Simpan di atas nav |
| Analytics | KPI → donut → bar → breakdown, atau empty state (tanpa NaN) | donut dari `chartRamp` theme | scroll ≥96px |
| Budgets | label bulan → banner alert → ring cards | ring `ok/warning/exceeded`, hole = card | scroll ≥96px |
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

- [ ] `eas init` — `extra.eas.projectId` terisi (belum ada: repo belum ditautkan ke proyek EAS)
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
