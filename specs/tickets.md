# Ticket Map — Cashtrix

## MVP v1.0 — selesai

Spec: issue #1 (`spec: Cashtrix MVP v1.0`) · Sumber: `PRD.md` v1.0 + `DESIGN.md` + `specs/cashtrix-mvp.md`.

**Jangan menutup atau mengubah issue #1.**

| Ticket | Issue | Blocked by | Status |
|---|---|---|---|
| T1 — Scaffold app + theme tokens | #3 | — | closed |
| T2 — Skema DB + RLS + pgTAP | #2 | — | closed |
| T3 — Auth + seed idempotent | #4 | #3, #2 | closed |
| T4 — Wallets + saldo gabungan | #5 | #4 | closed |
| T5 — Add Transaction + riwayat | #6 | #5 | closed |
| T6 — Analytics | #7 | #6 | closed |
| T7 — Budget + alert dedup | #8 | #6 | closed |
| T8 — Profile + kategori kustom | #9 | #4 | closed |
| T9 — Data ownership | #10 | #6 | closed |
| T10 — Observability | #11 | #3 | closed |
| T11 — E2E Maestro + gerbang rilis | #12 | — | closed |
| UI Polish — Stitch fidelity | #26 | — | closed |

Selesai (squash ke `main`): T1 #3 PR #13 · T2 #2 PR #14 · T3 #4 PR #15 · T4 #5 PR #16 · T5 #6 PR #17 · T6 #7 PR #18 · T7 #8 PR #19 · T8 #9 PR #20 · T9 #10 PR #21 · T9 follow-up #22 PR #23 · T10 #11 PR #24 · T11 #12. UI Polish #26 langsung ke `main`.

---

## v1.1 — aktif

Spec: issue **#28** (`spec: Cashtrix v1.1`) · Sumber: `PRD.md` R6–R8 + `CONTEXT.md` + `docs/roadmap.md` + ADR-0001..0006 + `specs/cashtrix-v1.1.md`.

Semua ticket `ready-for-agent`. Blocking edges = native GitHub issue dependencies.

| Ticket | Issue | Blocked by | Deliverable |
|---|---|---|---|
| V0 — Konfirmasi email, reset password, legal EN | #29 | — | Auth gate "Cek email"; `cashtrix://reset-password`; GitHub Pages privasi/ToS EN — selesai (PR #36, merged) |
| V1 — EAS + Sentry + version 1.1.0 | #30 | #29 | `eas.json` 3 profil; Sentry via `configureTransport`; `app.json` 1.1.0 — selesai (PR #37, merged) |
| V2 — Transfer satu baris | #31 | #29 | Segmen ketiga; Saldo dua Wallet; gabungan/donut/Spent diam; reassign collapse ditolak — selesai (PR #38, merged) |
| V3 — Recurring catch-up | #32 | #29, #31 | Profile "Transaksi berulang"; Catch-up RPC; skip siklus pertama; plafon 12 — selesai (PR #39, merged) |
| V4 — Undo snackbar + arsip Wallet | #33 | #31 | Snackbar ~5s Urungkan; Archive Wallet; riwayat Transfer tetap — selesai (PR #40, merged) |
| V5 — Kalender penuh + pass istilah | #34 | #31 | Grid kalender `View`; "Dompet" konsisten — selesai (PR #41, merged) |
| V6 — Gerbang rilis v1.1 | #35 | #30, #32, #33, #34 | Maestro + pgTAP + Jest; tag `v1.0.0` + `v1.1.0` — selesai, closed 2026-09-22 |

```
V0 #29 ─┬─ V1 #30 ──────────────┐
        ├─ V2 #31 ─┬─ V4 #33 ───┼─ V6 #35
        │          └─ V5 #34 ───┤
        └──────────── V3 #32 ───┘
                      (V3 blocked by V0+V2)
```

### Frontier

V0 (#29) closed via PR #36 (merged 2026-09-20). V1 (#30) closed via PR
#37 (merged 2026-09-20). V2 (#31) closed via PR #38 (merged 2026-09-20).
V3 (#32) closed via PR #39 (merged 2026-09-20).
V4 (#33) closed via PR #40 (merged 2026-09-21).
V5 (#34) closed via PR #41 (merged 2026-09-21).
Ticket tanpa blocker terbuka, belum di-assign:
**#35 (V6 — Gerbang rilis v1.1)**.

V6 tanpa blocker tersisa (V1+V2+V3+V4+V5 sudah closed).

**#35 (V6) — gate otomatis selesai 2026-09-21** (kerja di working tree,
belum PR): lint/typecheck bersih; Jest 284/284; pgTAP 358/358 (00–15);
matriks live `verify-t5/t6/t7/t8/t9/v2/v3/v4/t11` hijau (t9 sempat merah —
`export-csv` 500 sejak V2, diperbaiki + redeploy); kontrak statis Maestro
74 selector/8 tap/3 event; `provision-e2e` menyiapkan dompet Bank; tag
`v1.0.0` lokal di `492a117` (`v1.1.0` menyusul di commit merge).
Verifikasi device pemilik 2026-09-22: snackbar Urungkan lolos (setelah fix
posisi atas-nav + durasi 10 detik), warna nominal lolos, **notifikasi budget
lolos** (setelah fix evaluasi baca-server — warning 80% + exceeded 100%
banner + push benar).
Run Maestro device ditunda jadi follow-up pasca-v1.1 (opsi B — flow +
kontrak statis + cermin API siap). v1.1.0 di-tag di HEAD; tidak ada lagi
perubahan untuk versi ini (konfirmasi pemilik 2026-09-22).

### Review follow-up (di luar ticket map, sudah merged ke `main`)

Hasil review preview build Android + Expo Go oleh owner, diverifikasi di HP:

- PR #42 — reload data pasca-login (`DataProviders key=user.id`), override warna nominal (amandemen DESIGN.md §1: income `#30D158`, expense `#FF6B62`, net gold), tombol hapus budget setengah lebar, guard in-flight refresh.
- PR #43 — refresh Insight pasca-tulis (save/delete/undo/catch-up/reassign; `AnalyticsProvider` di atas `RecurringProvider`).
- PR #44 — virtualisasi riwayat (`SectionList` + sticky header; uji 200 txn via `scripts/seed-bulk.mjs`, user uji dibersihkan).
- Chore: sinkron lockfile v1.1.0 + `.npmrc`, link proyek EAS, `SENTRY_DISABLE_AUTO_UPLOAD` di profil preview, timeout suite navigasi 15 detik (flake CI).

### Setelah V6 (catatan pasca-V6)

1. **Preloader + skeleton** — **SELESAI + ter-commit 2026-09-24 di `main`, tanpa ticket**: `c87a34a` (`DESIGN.md` §8 Motion + `src/components/skeleton.tsx` (`Skeleton`/`SkeletonBlock`/`SkeletonRow`/`SkeletonList`, pulse opacity View-only, reduce-motion) + skeleton per permukaan (hero, riwayat, dompet, KPI/donut/bar, ring budget, search, notifikasi, recurring, kategori)) + `e00ef76` (cold-open fade §8). Gate: lint/typecheck/Jest 393/393/`verify-t11 --static-only` 3/3/bundle Android hijau; device gate smoke + happy-path hijau 2026-09-25 di atas kode ini.
2. Mock network Supabase di test navigasi (ganti ketergantungan kecepatan runner; paket dengan assert state error/empty) — prasyarat sinyal gate yang kredibel, bagian dari V6 bila sempat.

### Aturan

- Jangan menutup atau mengubah issue #1 (spec MVP v1.0).
- Jangan menutup issue #28 (spec v1.1) sampai V6 lolos dan bukti terlampir.
- Ambil ticket dari frontier: semua blocker harus already closed.
- Istilah mengikuti `CONTEXT.md`. Keputusan keras: ADR-0001..0006, PRD R6–R8.

---

## v1.2 batch 1 — nilai user langsung, risiko kecil

Sumber: `docs/roadmap.md` §6.2. Urutan mengikat: A6 → A3 → A4 → A5 → D4.
Semua ticket `ready-for-agent`. Tanpa DDL baru sejauh view/RPC yang ada mencukupi.

| Ticket | Issue | Blocked by | Deliverable |
|---|---|---|---|
| A6 — Ringkasan bulan lalu di Dashboard | #45 | — | Kartu Dashboard dari `v_monthly_summary` (bulan berjalan vs bulan lalu, delta %, tap → Analytics) — implementasi di working tree, lolos review device 2026-09-22 |
| A3 — Cari & filter riwayat | #46 | #45 | Layar `/search`: teks (note+kategori+dompet) + segmen jenis, pola query untuk A4 |
| A4 — Bulk edit kategori | #47 | #46 | Mode pilih di `/search` + ubah kategori bulk (sejenis terkunci, transfer nonaktif) |
| A5 — Inbox notifikasi | #48 | #47 | `read_at` di `budget_alerts` + layar `/notifications` (bel → inbox, tap baca + ke Budgets) — kode selesai, migrasi siap apply, menunggu apply sebelum review device |
| D4 — Error handling terlihat | #49 | #48 | Banner offline + auto-refresh + `ErrorStateCard` retry seragam |

---

## v1.2 batch 2 — butuh keputusan / setup native

Sumber: `docs/roadmap.md` §6.3. Syarat mulai per item mengikat; urutan tidak seketat batch 1.

| Ticket | Issue | Blocked by | Deliverable |
|---|---|---|---|
| B4 — Biometric app lock (device-local) | #50 | — | Flag lokal + toggle Profile opt-in + overlay penuh pola auth gate (grace 60 dtk, cold start selalu kunci); rebuild preview DITUNDA, degrade gracefully di Expo Go — keputusan terkunci R9 + ADR-0007 (OPEN-3 closed via grill 2026-09-23) — selesai, closed 2026-09-23 (HEAD `405c580`, `b937fb2` + `405c580` di main, release-gate run 55 hijau) |
| C6 — i18n ID/EN + pass terminologi | #51 | — | Bahasa ikut OS via `expo-localization` + kamus terpusat `src/i18n/{id,en}.ts` (fallback ID, Jest kelengkapan); cakupan UI + notifikasi + legal ID; kategori sistem mapping client-side; format ikut bahasa; `expo-localization` gabung rebuild tertunda B4 — keputusan terkunci R10 + ADR-0008 (grill 2026-09-23) — selesai, closed 2026-09-23 (HEAD `5046d1f`) |

Frontier batch 2: kosong — B4 (#50) + C6 (#51) sudah closed (batch 2 selesai 2026-09-23).

---

## Antre kode roadmap §6.3 — C2 → D5 → D3 (urutan mengikat, edge native)

Sumber: `docs/roadmap.md` §6.3. Scope beku di body issue masing-masing (tanpa spec-doc baru — item kecil, bentuk diketahui). Semua ticket `ready-for-agent`.

| Ticket | Issue | Blocked by | Deliverable |
|---|---|---|---|
| C2 — 2FA (TOTP) | #53 | — | Toggle Profile + enroll (secret + otpauth-link, tanpa QR) + login challenge + unenroll; recovery = reset email — **selesai + device lolos, closed 2026-09-24** (`b91d889`, OTA preview `0b850a31`) |
| D5 — Rate limiting Edge Functions | #54 | #53 | Counter tabel in-function + guard `seed-user`/`export-csv`/`delete-account` (10/5/3 per user per 60 dtk, tolak 429 ber-body) — **selesai + live probe 29/29, closed 2026-09-24** |
| D3 — Maestro di CI (riset time-box) | #52 | #54 | **selesai 2026-09-24** — keputusan: **tetap manual** (Cloud: tanpa harga publik + signup di luar time-box; emulator Actions: viable tapi rantai EAS-build + secrets + AVD tidak muat satu sesi). Fallback dikerjakan: mock test navigasi diperkuat — 5 rute sekunder (search/notifications/recurring/categories/delete-account) kini direach dari entry row + marker mount, Jest 426/426 |

B5 CSV import **drop** 2026-09-24 (roadmap §6.3) — tanpa ticket.

Frontier: **kosong** — C2/D5/D3 semua selesai. Berikutnya per roadmap: v1.2 selesai penuh; item berikut menunggu keputusan pemilik (v2.0 paket arsitektur, atau rilis store).
