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
| V2 — Transfer satu baris | #31 | #29 | Segmen ketiga; Saldo dua Wallet; gabungan/donut/Spent diam; reassign collapse ditolak |
| V3 — Recurring catch-up | #32 | #29, #31 | Profile "Transaksi berulang"; Catch-up RPC; skip siklus pertama; plafon 12 |
| V4 — Undo snackbar + arsip Wallet | #33 | #31 | Snackbar ~5s Urungkan; Archive Wallet; riwayat Transfer tetap |
| V5 — Kalender penuh + pass istilah | #34 | #31 | Grid kalender `View`; "Dompet" konsisten |
| V6 — Gerbang rilis v1.1 | #35 | #30, #32, #33, #34 | Maestro + pgTAP + Jest; tag `v1.0.0` mundur + `v1.1.0` |

```
V0 #29 ─┬─ V1 #30 ──────────────┐
        ├─ V2 #31 ─┬─ V4 #33 ───┼─ V6 #35
        │          └─ V5 #34 ───┤
        └──────────── V3 #32 ───┘
                      (V3 blocked by V0+V2)
```

### Frontier

V0 (#29) closed via PR #36 (merged 2026-09-20). V1 (#30) closed via PR
#37 (merged 2026-09-20). Ticket tanpa blocker terbuka, belum di-assign:
**#31 (V2 — Transfer satu baris)**.

V3/V4/V5 menunggu V2. V6 menunggu V3+V4+V5 (V1 sudah closed).

### Aturan

- Jangan menutup atau mengubah issue #1 (spec MVP v1.0).
- Jangan menutup issue #28 (spec v1.1) sampai V6 lolos dan bukti terlampir.
- Ambil ticket dari frontier: semua blocker harus already closed.
- Istilah mengikuti `CONTEXT.md`. Keputusan keras: ADR-0001..0006, PRD R6–R8.
