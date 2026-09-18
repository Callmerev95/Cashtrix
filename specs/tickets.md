# Ticket Map — Cashtrix MVP

Spec: issue #1 (`spec: Cashtrix MVP v1.0`) · Sumber: `PRD.md` v1.0 + `DESIGN.md` + `specs/cashtrix-mvp.md`.

Semua ticket diterbitkan sebagai GitHub issue dengan label `ready-for-agent`. Blocking edges di-set sebagai native GitHub issue dependencies.

| Ticket | Issue | Blocked by | Deliverable |
|---|---|---|---|
| T1 — Scaffold app + theme tokens | #3 | — | Expo + Expo Router shell, `theme.ts` lengkap, Jest, screen wrapper |
| T2 — Skema DB + RLS + pgTAP | #2 | — | 6 tabel + RLS deny-by-default + bucket avatar + suite pgTAP |
| T3 — Auth + seed idempotent | #4 | #3, #2 | Register → verifikasi → login → `seed-user` → sesi persisten → sign out |
| T4 — Wallets + saldo gabungan | #5 | #4 | CRUD wallet (maks 10), `v_wallet_balances`, saldo total Dashboard |
| T5 — Add Transaction + riwayat | #6 | #5 | Form lengkap + idempotency + soft-delete + list infinite scroll |
| T6 — Analytics | #7 | #6 | Range pills, KPI + delta, donut, bar chart, filter wallet |
| T7 — Budget + alert dedup | #8 | #6 | Budget per kategori, `current_month(tz)`, ring state, push sekali |
| T8 — Profile + kategori kustom | #9 | #4 | Nama/avatar, CRUD kategori kustom, setting currency |
| T9 — Data ownership | #10 | #6 | `export-csv` + `delete-account` |
| T10 — Observability | #11 | #3 | Sentry + scrubbing, `screen_view`/`tx_created`/`budget_threshold_reached` |
| T11 — E2E Maestro + gerbang rilis | #12 | #7, #8, #9, #10, #11 | Maestro happy path, KPI terverifikasi, checklist visual |

## Frontier

Ticket tanpa blocker yang belum selesai: tidak ada — frontier berikutnya adalah **#12 (T11 — E2E Maestro)** setelah blockernya closed.

Selesai (di-merge ke `main`, squash): T1 — #3 via PR #13 · T2 — #2 via PR #14 · T3 — #4 via PR #15 · T4 — #5 via PR #16 (squash `cb3b9df`) · T5 — #6 via PR #17 (squash `492b8f2`) · T6 — #7 via PR #18 (squash `c688a41`) · T7 — #8 via PR #19 (squash `160f71c`) · T8 — #9 via PR #20 (squash `7d1fb0e`) · T9 — #10 via PR #21 (squash `38343db`) · T9 follow-up wiring — #22 via PR #23 (squash `f478fd9`) · T10 — #11 via PR #24 (squash `c524f30`).

Frontier: **#12 (T11 — E2E Maestro + gerbang rilis)** — seluruh blocker (#8, #9, #10, #11) sudah closed.

## Aturan

- Jangan menutup atau mengubah issue #1 (parent spec) selama eksekusi ticket.
- Ambil ticket dari frontier: semua blocker harus sudah closed.
