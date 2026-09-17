# AGENTS.md — Cashtrix

## Repo state

- **Expo + Expo Router app** (`app/`, `src/`) scaffolded by T1 (#3). Postgres schema/RLS/pgTAP lives in `supabase/` (T2, #2). `PRD.md`, `DESIGN.md`, `AGENTS.md`, `specs/`, and `docs/agents/` remain the planning/binding docs.
- Git repo on `main`, remote `https://github.com/Callmerev95/Cashtrix.git`. Only commit/push when the user explicitly asks.

### Database

- Project Supabase: `Cashtrix` — ref `bklriyyuglwiqczgbqgq`, region `ap-southeast-2`. `supabase/config.toml` `project_id` sudah diisi ref tersebut.
- Migrations: `supabase/migrations/20260917090000_schema.sql` (6 tabel + RLS + bucket `avatars`), `20260917090001_seed_system_categories.sql` (12 kategori sistem, idempotent).
- Views agregasi (`v_wallet_balances`, `v_monthly_summary`, `v_category_breakdown`, `v_budget_status`) dan `current_month(tz)` **belum ada** — milik T4/T6/T7 sesuai `specs/tickets.md`.
- RLS deny-by-default: 24 policy `to authenticated` (4 per tabel), tanpa `USING (true)`. `anon` dicabut. Bonus hardening: FK komposit `transactions(wallet_id, user_id) → wallets(id, user_id)`.
- `budget_alerts` dedup per-user: `unique(user_id, category_id, month, threshold)` — revisi PRD §6.1 R1 (kategori sistem dipakai bersama, kunci lama `(category_id, month, threshold)` menabrak antar-user).
- State remote (sudah diverifikasi): 6 tabel, 24 policy public, 4 policy `avatars_*` di `storage.objects`, bucket privat 2MB PNG/JPG, 12 kategori sistem, 87 assertion pgTAP hijau (dijalankan via `psql` karena mesin ini tanpa Docker).
- Catatan pgTAP portabilitas (semuanya sudah tercermin di `supabase/tests/database/`):
  - Setup ada di `00_setup.sql` **tanpa assertion** (pgTAP menjalankan semua `.sql` di folder; `\ir` akan menyuntik output setup ke dalam TAP file test).
  - `reset role` mengembalikan role ke session user dan me-reset `search_path` → sesudahnya perlu `set role postgres` + `set search_path = public, extensions` lagi.
  - Storage hosted: `path_tokens` = generated column (jangan diisi saat insert); `DELETE` langsung dari SQL ditolak trigger `storage.protect_delete()` (err 42501) untuk semua role; update objek milik user lain = no-op RLS (0 baris).

### Commands

- Install: `npm install`
- Lint: `npm run lint` (`eslint .`)
- Typecheck: `npm run typecheck` (`tsc --noEmit`)
- Test: `npm run test` (`jest`, jest-expo preset)
- DB migrations (canonical source: `supabase/migrations/*.sql`): apply via `supabase db push --linked` (atau MCP `apply_migration` dengan isi file identik — jangan divergen)
- DB tests (pgTAP): `npm run db:test` (`supabase test db`). **Butuh Docker/Podman** — `supabase test db --linked` tetap menjalankan `pg_prove` di container. Suite di `supabase/tests/database/` (7 file, 87 assertion) dan bisa juga dijalankan langsung dengan `psql` terhadap DB mana pun (`00_setup.sql` dulu, lalu 01–06; `set role postgres` + `set search_path = public, extensions`).
- Run app: `npm run ios` / `npm run android` / `npm run start`
- Bundle check (no device needed): `npx expo export --platform ios|android --output-dir /tmp/out`
- **No native folders are committed** — `ios/`/`android/` are generated; use Expo Go / dev builds.

## Binding documents

- `PRD.md` §0 ("Keputusan Terkunci", D1–D11) — locked product decisions. Do not re-litigate in code; propose a PRD revision first if a decision looks wrong.
- `design.md` — canonical design system ("Minimalist Obsidian"). It, not Stitch, is the source of truth for visuals.

## Design tokens — the traps

- **Never color-pick from Stitch screens.** Stitch renders M3-derived greys (`#131313` bg, `#1C1B1B` cards) because its API derives all named colors server-side from seeds — `namedColors` is read-only and writes are rejected. Canonical colors are `#0A0A0A` background, `#1C1C1E` cards, `#D4AF37` gold accent, `#E5E5E5` text (design.md §1).
- **Currency numerals = JetBrains Mono** (design.md §2). Stitch's design system v2 shows Public Sans on `currency-*` tokens — that is accepted drift (Stitch API rejected `JETBRAINS_MONO` for `labelFont`); ignore it.
- When code exists: hex literals are allowed only in the theme file (one `theme.ts`), not in components (PRD §4.5). **Enforced by lint**: `no-restricted-syntax` in `eslint.config.mjs` errors on hex literals everywhere except `src/theme/theme.ts` (and tests).
- Theme tokens are consumed via the `@/theme` alias (`src/theme/theme.ts` → `src/theme/index.ts`). `@/*` maps to `src/*` in both `tsconfig.json` and `jest.config.js`.
- Currency numerals load from `@expo-google-fonts/jetbrains-mono/<weight>` subpaths, not the package root — the root pulls every weight into the bundle.

## Implementation rules (from PRD §4, easy to violate)

- No mutable balance columns — balances come from SQL views (`opening_balance + Σ income − Σ expense`).
- All financial aggregation in Postgres views/RPC, never computed client-side.
- Budget months derive from `profiles.timezone` (default Asia/Jakarta), not UTC — one SQL function computes them; unit-test the WIB/UTC boundary.
- RLS on 100% of tables, deny-by-default; budget alert dedup relies on the `budget_alerts` unique constraint (`ON CONFLICT DO NOTHING`).

## External references

- Stitch project `Cashtrix` = `projects/16569655893689994`; design system asset `assets/4b61549b44c64e5f9f2b2ef2437c18dd` (v2). Screens are a **layout** reference only — see the mapping table in design.md §1.

## Agent skills

### Issue tracker

Issues live as GitHub issues in `Callmerev95/Cashtrix`, managed with the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context layout — one `CONTEXT.md` + `docs/adr/` at the repo root. See `docs/agents/domain.md`.
