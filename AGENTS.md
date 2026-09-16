# AGENTS.md — Cashtrix

## Repo state

- **Expo + Expo Router app** (`app/`, `src/`) scaffolded by T1 (#3). `PRD.md`, `DESIGN.md`, `AGENTS.md`, `specs/`, and `docs/agents/` remain the planning/binding docs.
- Git repo on `main`, remote `https://github.com/Callmerev95/Cashtrix.git`. Only commit/push when the user explicitly asks.

### Commands

- Install: `npm install`
- Lint: `npm run lint` (`eslint .`)
- Typecheck: `npm run typecheck` (`tsc --noEmit`)
- Test: `npm run test` (`jest`, jest-expo preset)
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
