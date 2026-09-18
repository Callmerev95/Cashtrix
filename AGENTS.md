# AGENTS.md — Cashtrix

## Repo state

- **Expo + Expo Router app** (`app/`, `src/`) scaffolded by T1 (#3). Postgres schema/RLS/pgTAP lives in `supabase/` (T2, #2); auth + `seed-user` Edge Function in T3 (#4). Wallets + combined balance in T4 (#5); transactions + history in T5 (#6). `PRD.md`, `DESIGN.md`, `AGENTS.md`, `specs/`, and `docs/agents/` remain the planning/binding docs.
- Git repo on `main`, remote `https://github.com/Callmerev95/Cashtrix.git`. Only commit/push when the user explicitly asks.

### App architecture (T3)

- `app/_layout.tsx` is the **auth gate**: it restores the persisted session before first paint (splash is held), then keeps the user in `(auth)` or `(tabs)`. It is the only place that navigates on auth state — screen-level redirects would fight it.
- Auth lives in `src/features/auth/`: `validation.ts` (pure, no bridge — the Jest seam: locked copy from PRD §2.3 Epic A, `validateRegister`, `loginErrorMessage`), `api.ts` (sign in/up/out, `runSeedUser`), `auth-context.tsx` (`AuthProvider`/`useAuth`). Components reach Supabase only through `src/supabase/client.ts`.
- `src/supabase/client.ts` = the single Supabase client: `react-native-url-polyfill/auto` must be imported **before** supabase-js, session persisted in AsyncStorage. It also owns sign-out purging — `LOCAL_STORAGE_KEYS` + `onLocalDataPurge()` are the registration points for T5's SQLite cache.
- Env: `EXPO_PUBLIC_SUPABASE_ANON_KEY` (publishable key, safe in the bundle — RLS is the guard). Copy `.env.example` → `.env`; `.env` is gitignored. Jest cannot see Expo's build-time inlining, so `__tests__/setup.ts` sets a dummy value.

### Wallets (T4)

- `src/features/wallets/`: `domain.ts` (pure — the Jest seam: `parseAmountInput`, `formatAmount`/`formatCurrency`, `validateWallet`, `MAX_WALLETS`, `walletTypeMeta`), `api.ts` (`listWallets` reads `v_wallet_balances`; create/update/delete; `reassignAndDeleteWallet` calls the RPC then deletes), `wallets-context.tsx` (`WalletsProvider`/`useWallets` — one shared read + `refresh()`, cleared on sign-out).
- `WalletsProvider` sits inside `AuthProvider` in `app/_layout.tsx`, so every signed-in screen shares one wallet list. Screens: Dashboard hero card (`app/(tabs)/index.tsx`), `/wallets` (manage, delete, reassign sheet), `/wallet-form` (create/edit modal, `?id=` = edit).
- Balances are **never** computed client-side: `balance` comes from the view, `opening_balance` is the only writable money field. Deleting a wallet with transactions is refused by the FK — the UI always offers reassignment first (`reassign_wallet_transactions`).
- Deleting `__tests__/.session-seed.json` before a Jest run is required; it is a *written* cache of the fake session (`__tests__/setup.ts` recreates it). A stale `auth.users` row in the hosted DB is not involved. (Note: `__tests__/.session-seed.json` is currently untracked — do not commit it.)
- Jest gotcha: supabase-js reads its stored session synchronously at client construction, so `__tests__/mocks/async-storage.js` is pre-seeded with a fake session. `renderRouter` in `__tests__/navigation.test.tsx` takes an explicit route map (the auth group is outside the tab layout, and a directory string would not include it).

### Transactions (T5)

- `src/features/transactions/`: `domain.ts` (pure — the Jest seam: `formatAmountInput` live id-ID grouping, `validateAmount` (`0 < amount ≤ 999_999_999_999`, max 2 decimals, no NaN/Infinity), `normalizeNote`, `isFutureDate`, `formatSignedAmount` (income `+`, expense never red/never minus), `groupByDay`, `hasMoreAfter`, `newIdempotencyKey`, `PAGE_SIZE = 20`, `NOTE_MAX_LENGTH = 200`), `api.ts` (reads `v_transactions_feed`; `createTransaction` tolerates `23505` as an already-saved retry; `softDeleteTransaction`/`restoreTransaction` via RPC), `transactions-context.tsx` (`TransactionsProvider`/`useTransactions` — history pages + the form's category/wallet option lists + the two remembered prefs), `components/`.
- `TransactionsProvider` sits **inside** `WalletsProvider` in `app/_layout.tsx`. Saving a transaction refreshes both: history from the context, balances from `WalletsProvider.refresh()` — a balance only ever comes from `v_wallet_balances`.
- Screens: `/add-transaction` is the real form (create, and edit when `?id=` is present; delete lives in its header as a destructive sheet). The Dashboard renders the history via `TransactionHistoryList`, which groups by day with `label-uppercase` dividers and pages in on scroll end.
- **Never sync state in an effect here.** The form derives `type`/`walletId`/`categoryId` during render as `override ?? rememberedDefault ?? loaded row ?? first option`. The `react-hooks/set-state-in-effect` lint rule is on and will reject a `useEffect` that calls `setState` synchronously — that pattern also stomps the user's edits when the context refetches after a save.
- Form state gotcha: `type` seeds from the **persisted** preference (`cashtrix:last-transaction-type`), the wallet from the last transaction's wallet (`lastUsedWalletId()`), and a category pick is remembered across an Expense/Income toggle but ignored while it belongs to the other `kind`.
- The idempotency key is minted **once per form session** with `useRef`, so a re-render or a post-save refresh cannot change it (that is what makes the retry safe — AC #22).
- Deletes are **soft** (`deleted_at`) with a 30-day window; `v_transactions_feed` filters them out so the UI treats delete as final, and `restore_transaction` exists for undo/tests. Hard delete is the `purge_deleted_transactions` cron.
- `scripts/verify-t5.mjs` is the live end-to-end check (signup → seed → create/retry/list/soft-delete/restore → cross-user + anon denials); run it from the repo root with `node scripts/verify-t5.mjs`. It leaves its test users behind unless `SUPABASE_SERVICE_ROLE_KEY` is set, so clean up with `delete from auth.users where email like 't5-verify-%'` afterwards.

### Database

- Project Supabase: `Cashtrix` — ref `bklriyyuglwiqczgbqgq`, region `ap-southeast-2`. `supabase/config.toml` `project_id` sudah diisi ref tersebut.
- `auth.email.enable_confirmations` **false** di hosted (auto-confirm, PRD §6.1 R2 — kembalikan ke konfirmasi manual sebelum rilis publik). **Jangan `supabase config push` dari repo root**: `config.toml` di repo masih berisi nilai template lokal, jadi push akan menimpa `site_url`, `otp_length`, MFA, Twilio milik project. Untuk mengubah satu properti saja, jalankan `supabase config push --workdir <dir>` dengan `config.toml` minimal yang hanya mendeklarasikan properti itu (butuh `supabase/.temp` disalin agar ref terbaca).
- Edge Functions: `seed-user` (T3). Deploy tanpa Docker: `npx supabase functions deploy seed-user --use-api`. Fungsi selalu mengambil `user_id` dari `getUser(JWT)` — tidak pernah dari body — dan idempotent lewat `upsert(..., onConflict: 'user_id,name', ignoreDuplicates: true)`. `verify_jwt` tetap aktif (request tanpa JWT ditolak 401 sebelum handler jalan).
- Migrations: `supabase/migrations/20260917090000_schema.sql` (6 tabel + RLS + bucket `avatars`), `20260917090001_seed_system_categories.sql` (12 kategori sistem, idempotent), `20260918090000_wallet_balances_and_reassign.sql` (T4: view saldo + RPC reassign), `20260919090000_transaction_history.sql` (T5: `v_transactions_feed`, `soft_delete_transaction`/`restore_transaction`/`purge_deleted_transactions`, job pg_cron harian).
- `v_wallet_balances` **wajib `security_invoker = true`** — view tanpa itu dibaca sebagai owner sehingga RLS ter-bypass dan saldo wallet user lain bocor (pgTAP `07_wallet_balances.sql` menangkapnya). Karena Supabase memberi default privileges ke `anon`, view baru juga harus `revoke all ... from anon, public` lalu `grant select ... to authenticated`; tanpa revoke, anon bisa membaca view tanpa login.
- `reassign_wallet_transactions(from_wallet, to_wallet)` (T4) = satu-satunya jalur bulk-move transaksi antar wallet; fixed `search_path = ''`, `grant execute` hanya ke `authenticated`, dan memindahkan transaksi **soft-deleted juga** supaya pemulihan 30 hari tidak menabrak FK RESTRICT. Error: `22023` argumen invalid, `P0002` wallet tidak ditemukan/bukan milik pemanggil.
- Views agregasi: `v_wallet_balances` ada sejak T4 (#5), `v_transactions_feed` sejak T5 (#6). `v_monthly_summary`, `v_category_breakdown`, `v_budget_status`, dan `current_month(tz)` **belum ada** — milik T6/T7 sesuai `specs/tickets.md`.
- `v_transactions_feed` (T5) **wajib `security_invoker = true`** + `revoke all ... from anon, public` lalu `grant select ... to authenticated`, alasan yang sama dengan `v_wallet_balances`. Ia join `categories` dan `wallets` di server dan menyaring `deleted_at is null`, jadi klien tidak pernah merakit nama kategori/wallet sendiri dan tidak pernah bisa menampilkan transaksi terhapus.
- `soft_delete_transaction(id)` / `restore_transaction(id)` (T5) mengembalikan **jumlah baris** (0 = tidak ada / bukan milik pemanggil), sehingga perbedaan "sudah terhapus" vs "bukan milik saya" tidak butuh pesan error khusus. `purge_deleted_transactions()` sengaja **bukan** security definer: sebagai `postgres` (cron) ia membersihkan semua user, sebagai `authenticated` RLS membatasinya ke baris sendiri.
- `pg_cron` di-install di database `postgres` oleh migrasi T5 dan menjadwalkan job `cashtrix-purge-deleted-transactions` (`0 3 * * *`). Installasinya dibungkus guard `pg_available_extensions` supaya migrasi tetap jalan di Postgres polos tanpa ekstensi itu.
- State remote (sudah diverifikasi): 6 tabel, 24 policy public, 4 policy `avatars_*` di `storage.objects`, bucket privat 2MB PNG/JPG, 12 kategori sistem, 2 view (`v_wallet_balances`, `v_transactions_feed` — keduanya security_invoker) + 4 RPC (`reassign_wallet_transactions`, `soft_delete_transaction`, `restore_transaction`, `purge_deleted_transactions`), 1 job pg_cron, 145 assertion pgTAP hijau (dijalankan via `psql` karena mesin ini tanpa Docker).
- RLS deny-by-default: 24 policy `to authenticated` (4 per tabel), tanpa `USING (true)`. `anon` dicabut. Bonus hardening: FK komposit `transactions(wallet_id, user_id) → wallets(id, user_id)`.
- `budget_alerts` dedup per-user: `unique(user_id, category_id, month, threshold)` — revisi PRD §6.1 R1 (kategori sistem dipakai bersama, kunci lama `(category_id, month, threshold)` menabrak antar-user).
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
- DB tests (pgTAP): `npm run db:test` (`supabase test db`). **Butuh Docker/Podman** — `supabase test db --linked` tetap menjalankan `pg_prove` di container. Suite di `supabase/tests/database/` (10 file, 145 assertion) dan bisa juga dijalankan langsung dengan `psql` terhadap DB mana pun (`00_setup.sql` dulu, lalu 01–09; `set role postgres` + `set search_path = public, extensions`).
- Password DB hosted direset T4 lewat Management API (`PATCH /v1/projects/{ref}/database/password`, bearer = `security find-generic-password -s "Supabase CLI" -w`); password disimpan di luar repo. Pooler URL di `supabase/.temp/pooler-url` tidak memuat password, jadi `psql` butuh `PGPASSWORD`.
- Verifikasi state DB tanpa Docker (pola T3/T4/T5): uji end-to-end lewat klien anon (signup → `seed-user` → baca lewat RLS) lalu periksa hasilnya via MCP `execute_sql` / `psql`. T5 membungkusnya sebagai `node scripts/verify-t5.mjs` (33 check). Selalu bersihkan user uji (`delete from auth.users where email like 't3-%@cashtrix.test'` / `'t4-%@cashtrix.test'` / `'t5-verify-%@cashtrix.test'` / `'t5-other-%@cashtrix.test'`) — cascade menghapus profile + wallet + transaksinya, dan verifikasi 0 residu setelahnya.
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
