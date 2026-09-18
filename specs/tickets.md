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

Ticket tanpa blocker yang belum selesai: **#9 (T8 — Profile + kategori kustom)** dan **#11 (T10 — Observability)** — keduanya dapat dikerjakan paralel.

**#6 (T5 — Add Transaction + riwayat)** dinyatakan selesai di branch `feat/t5-add-transaction-history` (PR menunggu review). Membuka antrean berikutnya begitu PR di-merge: #7 (T6 — Analytics), #8 (T7 — Budget + alert), #10 (T9 — Data ownership) — ketiganya hanya menunggu #6.

Selesai (di-merge ke `main`, squash): T1 — #3 via PR #13 · T2 — #2 via PR #14 · T3 — #4 via PR #15 · T4 — #5 via PR #16 (squash `cb3b9df`).

Ticket berikutnya tetap berantai: #12 (T11) menunggu #7/#8/#9/#10/#11.

## Aturan

- Jangan menutup atau mengubah issue #1 (parent spec) selama eksekusi ticket.
- Ambil ticket dari frontier: semua blocker harus sudah closed.
