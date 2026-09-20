# AGENTS.md — Cashtrix

## Repo state

- **Expo + Expo Router app** (`app/`, `src/`) scaffolded by T1 (#3). Postgres schema/RLS/pgTAP lives in `supabase/` (T2, #2); auth + `seed-user` Edge Function in T3 (#4). Wallets + combined balance in T4 (#5); transactions + history in T5 (#6); analytics in T6 (#7). `PRD.md`, `DESIGN.md`, `AGENTS.md`, `specs/`, and `docs/agents/` remain the planning/binding docs.
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

- `src/features/transactions/`: `domain.ts` (pure — the Jest seam: `formatAmountInput` live id-ID grouping, `validateAmount` (`0 < amount ≤ 999_999_999_999`, max 2 decimals, no NaN/Infinity), `normalizeNote`, `isFutureDate`, `formatSignedAmount` (income gold tanpa prefix, expense putih muted + glyph `-` minus — konvensi dibalik di #26, sebelumnya income `+` / expense tanpa minus), `groupByDay`, `hasMoreAfter`, `newIdempotencyKey`, `PAGE_SIZE = 20`, `NOTE_MAX_LENGTH = 200`), `api.ts` (reads `v_transactions_feed`; `createTransaction` tolerates `23505` as an already-saved retry; `softDeleteTransaction`/`restoreTransaction` via RPC), `transactions-context.tsx` (`TransactionsProvider`/`useTransactions` — history pages + the form's category/wallet option lists + the two remembered prefs), `components/`.
- `TransactionsProvider` sits **inside** `WalletsProvider` in `app/_layout.tsx`. Saving a transaction refreshes both: history from the context, balances from `WalletsProvider.refresh()` — a balance only ever comes from `v_wallet_balances`.
- Screens: `/add-transaction` is the real form (create, and edit when `?id=` is present; delete lives in its header as a destructive sheet). The Dashboard renders the history via `TransactionHistoryList`, which groups by day with `label-uppercase` dividers and pages in on scroll end.
- **Never sync state in an effect here.** The form derives `type`/`walletId`/`categoryId` during render as `override ?? rememberedDefault ?? loaded row ?? first option`. The `react-hooks/set-state-in-effect` lint rule is on and will reject a `useEffect` that calls `setState` synchronously — that pattern also stomps the user's edits when the context refetches after a save.
- Form state gotcha: `type` seeds from the **persisted** preference (`cashtrix:last-transaction-type`), the wallet from the last transaction's wallet (`lastUsedWalletId()`), and a category pick is remembered across an Expense/Income toggle but ignored while it belongs to the other `kind`.
- The idempotency key is minted **once per form session** with `useRef`, so a re-render or a post-save refresh cannot change it (that is what makes the retry safe — AC #22).
- Deletes are **soft** (`deleted_at`) with a 30-day window; `v_transactions_feed` filters them out so the UI treats delete as final, and `restore_transaction` exists for undo/tests. Hard delete is the `purge_deleted_transactions` cron.
- `scripts/verify-t5.mjs` is the live end-to-end check (signup → seed → create/retry/list/soft-delete/restore → cross-user + anon denials); run it from the repo root with `node scripts/verify-t5.mjs`. It leaves its test users behind unless `SUPABASE_SERVICE_ROLE_KEY` is set, so clean up with `delete from auth.users where email like 't5-verify-%'` afterwards.

### Analytics (T6)

- `src/features/analytics/`: `domain.ts` (pure — the Jest seam: `resolveRange` presets `1M/3M/6M/1Y/ALL` → `[start, end)` + equal-length previous window, `toDonutSlices` (top-8 + "Other", drops arcs `< MIN_ARC_SHARE = 0.5%`), `toArcOffsets`, `donutSegmentSliceIndices` (the wheel's angle→slice map), `enumerateBuckets`/`toBars` (gap-filling, height normalisation, no divide-by-zero), `formatDelta`/`deltaTone` (`null` → `—`, never NaN/Infinity), `isEmptyRange`), `api.ts` (`fetchOverview` calls the single `analytics_overview` RPC; `listWalletFilters`; `fetchTimezone`), `analytics-context.tsx` (`AnalyticsProvider`/`useAnalytics` — range + wallet filter + one payload), `components/`.
- `AnalyticsProvider` sits **inside** `TransactionsProvider` in `app/_layout.tsx`. Screen: `app/(tabs)/analytics.tsx` renders KPI header → donut → bar chart → breakdown rows, or `AnalyticsEmptyState` when the range is empty (AC #7).
- **All money is server-aggregated.** The client never sums `amount` — every figure comes from `analytics_overview`, which returns totals + delta % + donut breakdown + bar series in **one round-trip** (that is how the p95 <300ms target is met on 10k transactions). `v_monthly_summary`, `v_category_breakdown(...)`, `v_analytics_series(...)` are also callable directly; all `security invoker`, so RLS scopes them to the caller.
- **No `react-native-svg`.** The donut and bar chart are composed from plain `View`s (a ring of rotated ticks, and gradient-filled columns). Adding a native chart module would force a dev-client rebuild — the same reasoning T5 used for the date picker. The wheel's geometry lives in `donutSegmentSliceIndices` precisely so it is unit-tested rather than eyeballed.
- `delete __tests__/.session-seed.json` before a Jest run (same as T4/T5).
- `scripts/verify-t6.mjs` is the live end-to-end check (signup → seed → cross-month transactions → `analytics_overview` totals/delta/breakdown/series → wallet filter → empty range → cross-user isolation → anon denial); run it from the repo root with `node scripts/verify-t6.mjs`, then clean up `delete from auth.users where email like 't6-verify-%' or email like 't6-other-%'`.

### Budgets (T7)

- `src/features/budgets/`: `domain.ts` (pure — the Jest seam: `stateForPercent` boundary-exact 79.9/80/99.9/100 mirroring the SQL `CASE`, `percentFor`, `thresholdForState` (`ok` → `null`, so refreshes never spam), `ringFillFor`, `validateBudget` (expense-only + 12-digit bound), `formatPercent`), `api.ts` (`listBudgetStatus` reads `v_budget_status`; `upsertBudget` on `(user_id, category_id, month)` so mid-month edits are the same call as creates; `recordAlert` upsert `ignoreDuplicates` returns fired-or-deduped; `fetchCurrentMonth` calls the T6 `current_month` RPC — the client never derives a month), `budgets-context.tsx` (`BudgetsProvider`/`useBudgets` — current month + rows + `evaluateAndAlert` + in-app `recentAlerts`), `notifications.ts` (expo-notifications wrapper: permission asked only on first budget, everything best-effort/never throws), `components/budget-ring.tsx` (48-tick `View` ring, no svg — same reasoning as the T6 donut).
- `BudgetsProvider` sits **inside** `TransactionsProvider` in `app/_layout.tsx`. Screens: `app/(tabs)/budgets.tsx` (month label, in-app alert banners, ring cards → `/budget-form?id=` edit, empty state explains auto-zero new months), `app/budget-form.tsx` (expense-only category grid reused from transactions + `AmountField`, destructive delete sheet).
- Alert evaluation runs in **two places** (PRD Epic E): right after a transaction commits (`app/add-transaction.tsx` → `refreshBudgets()` + `evaluateAndAlert()`, failures swallowed so a notification can never lose a save) and on the Budgets screen's own refresh. Edits/deletes only refresh (a lower percent can never cross upward; fired alerts are never cleared, so no double-fire). Concurrent runs are guarded by an `evaluating` ref.
- `delete __tests__/.session-seed.json` before a Jest run (same as T4/T5/T6).
- `scripts/verify-t7.mjs` is the live end-to-end check (signup → seed → expense-only guard 23514 → upsert-update → 40% ok / 80% warning / 110% exceeded → alert dedup true/false → soft-delete lowers spent without clearing alerts → per-user dedup for second user → anon denial); run it from the repo root with `node scripts/verify-t7.mjs`, then clean up `delete from auth.users where email like 't7-verify-%' or email like 't7-other-%'`.

### Profile (T8)

- `src/features/profile/`: `domain.ts` (pure — the Jest seam: `validateDisplayName` (60 char), `validateCategoryName` (40 char), `validateCategoryIcon` (must be in `ICON_CATALOG`, 24 Material Icons names), `validateCurrency` (`SUPPORTED_CURRENCIES`, default `IDR`, display-only — no conversion), `formatMoney`, `isCategoryVisible`/`visibleCategories` (archived custom + muted system hidden, stable name order), avatar contract `AVATAR_SIZE_PX = 512` / `AVATAR_MAX_BYTES = 2MB` / PNG-JPEG only), `api.ts` (profile CRUD; `updateProfile` scopes `.eq('id', session-user)` because PostgREST rejects UPDATE without WHERE even under RLS; `uploadAvatar` resizes via classic `manipulateAsync` 512×512 JPEG then upserts to `avatars/{userId}/avatar.jpg`; private bucket display via `createSignedUrl`), `profile-context.tsx` (`ProfileProvider`/`useProfile` — profile + merged categories + signed avatar URL; category writes also refresh `TransactionsProvider` option lists so the Add form never shows stale categories).
- `ProfileProvider` sits **inside** `AnalyticsProvider` (innermost) in `app/_layout.tsx` so it can call `useTransactions().refresh()`. Screens: `app/(tabs)/profile.tsx` (avatar + verified badge → name editor → currency chips → `/categories` row → sign out, DESIGN.md §6), `app/categories.tsx` (custom section with edit/archive/delete + system section mute-only), `app/category-form.tsx` (modal; kind segmented on create, locked on edit).
- Two archive sources, one rule: custom categories flip `archived_at`; system rows (`user_id null`, shared) can never be UPDATE/DELETE'd by a user (RLS no-op — pgTAP proves it), so archiving them inserts per-user `category_mutes(user_id, category_id)` (`20260922090000_profile_categories.sql`, RLS 4 policies + revoke anon). Deleting a custom category with history is refused by the FK (`23503`) — the UI offers archiving instead. `expo-image-picker` + `expo-image-manipulator` (~57.0.18, installed with `npm install --legacy-peer-deps` — plain install fails ERESOLVE on react-dom peer) are Expo Go modules, no dev-client rebuild. Router types `.expo/types/router.d.ts` need a dev-server run after adding routes (`expo export` does not regenerate them).
- `delete __tests__/.session-seed.json` before a Jest run (same as T4–T7).
- `scripts/verify-t8.mjs` is the live end-to-end check (signup → seed → default Pengguna/IDR/Asia_Jakarta → rename+USD → 60-char guard 23514 → custom CRUD + unique 23505 + is_system forgery 42501 + system delete no-op → archive/unarchive + mute/dedup/unmute → avatar upload/signed-URL/foreign-prefix denial → cross-user isolation + independent mute → anon denial); run it from the repo root with `node scripts/verify-t8.mjs`, then clean up `delete from auth.users where email like 't8-verify-%' or email like 't8-other-%'`.
- DB password was reset via Management API during T8 (`PATCH /v1/projects/{ref}/database/password`, bearer = `security find-generic-password -s "Supabase CLI" -w`); current value `cashtrix-t8-dev-2026` (same pattern as T4; lives outside the repo).

### Auth gate V0 (#29)

- Status ke-4 `unconfirmed` di `auth-context.tsx` (`email_confirmed_at === null`); `AuthGate` menahan di `/(auth)/check-email`, bukan tabs. Daftar rute auth di `(auth)/_layout.tsx` — jangan di root `_layout.tsx` (grup transparan di deep link: `cashtrix://check-email` → rute `(auth)/check-email`).
- `detectSessionInUrl: false`, jadi layar penerima menukar sendiri kredensial tautan email: parser murni `src/features/auth/deep-link.ts` (seam Jest: PKCE `?code=` + hash `#access_token&refresh_token` + `error`) + `exchangeAuthCallback()` di `api.ts`. `signUp`/`resend`/`resetPasswordForEmail` selalu membawa `emailRedirectTo`/`redirectTo` (`cashtrix://check-email`, `cashtrix://reset-password`).
- Seed pindah ke login pertama pasca-konfirmasi (`login.tsx` → `runSeedUser()` best-effort); register tanpa sesi → `router.push('/(auth)/check-email', {email})`. Login tak-terkonfirmasi → copy `emailNotConfirmed` + tombol kirim-ulang (deteksi `isEmailNotConfirmedError`, bukan pesan generik).
- Link legal eksternal wajib `Linking.openURL` — `router.push`/`Link` hanya untuk rute internal. `docs/legal/*.html` harus HTML valid (bukan markdown); deploy via `.github/workflows/pages.yml` (Settings → Pages → Source "GitHub Actions", sekali saja).
- Hosted flip (pola T3, workdir minimal + `config diff` "0 update"): `[auth.email] enable_confirmations=true` + `[auth] additional_redirect_urls=[cashtrix://check-email, cashtrix://reset-password]`.
- Verify scripts: anon signup domain `.test` ditolak (`email_address_invalid` — Supabase validasi deliverability hanya saat harus mengirim email) dan tiap anon signup membakar kuota email. Jadi `scripts/lib/admin-confirm.mjs` → `provisionTestUser()`: create unconfirmed → signin wajib gagal `email_not_confirmed` (assert gate live) → confirm → signin bersesi. `SUPABASE_SERVICE_ROLE_KEY` kini wajib. Akun Maestro via `scripts/provision-e2e.mjs` (pre-confirmed); flow Maestro selalu jalur login.
- `delete __tests__/.session-seed.json` sebelum Jest (sama). Gate tests menimpa seed via `sessionStorageSeed` (`email_confirmed_at: null`): unconfirmed → `/check-email` + email sesi tampil; confirmed → tabs.

### Transfer (V2)

- `src/features/transactions/`: `TRANSACTION_TYPES` = expense|income|transfer, tapi `Category.kind` tetap `CategoryKind` = expense|income (transfer tidak punya kategori — DB check; grid/budget/analytics tidak melebar). Seam Jest + baru: `validateTransfer` (keduanya terisi + beda), `transferFeedLabel` ("Transfer ke {nama}"), `TRANSFER_ICON = 'swap-horiz'`; `formatSignedAmount` transfer netral tanpa prefix (bukan income, bukan expense).
- `Transaction`: `categoryId: string | null`, `categoryName/Icon` fallback label/ikon transfer, + `counterpartyWalletId/Name: string | null`. `TransactionDraft`/`SaveInput`/`updateTransaction`: `categoryId` nullable + `counterpartyWalletId?`. Feed `FEED_COLUMNS` mencakup kedua kolom counterparty.
- Form (`app/add-transaction.tsx`): segmen ketiga; pilih Transfer → grid Category hilang, pemilih tujuan muncul (wallet aktif saja, sumber dikecualikan; default = wallet pertama ≠ sumber). Derivasi saat render seperti biasa (`destinationChoice ?? loaded?.counterpartyWalletId ?? first-non-source`); pilih tujuan TIDAK menimpa `last-wallet-id` (itu default sumber). Edit memuat counterparty dari `loaded`. `observability` `TransactionKind` mencakup transfer (coarse kind, bukan amount).
- Row: judul transfer = `transferFeedLabel(counterpartyWalletName)`, meta tetap `jam · {wallet sumber} · note`.
- DB (`supabase/migrations/20260923100000_transfer.sql`, sudah apply hosted via MCP `transfer_single_row` — isi identik): `counterparty_wallet_id` + FK komposit `(counterparty_wallet_id, user_id)` RESTRICT; `category_id` nullable; check `transactions_transfer_shape` + `transactions_transfer_wallets_differ`; trigger `enforce_transaction_no_future` (23514, toleransi 1 menit — CHECK tidak boleh pakai `now()`); `v_wallet_balances` sumber − / tujuan + / gabungan diam / count kedua sisi; `v_transactions_feed` LEFT JOIN kategori + `counterparty_wallet_name` (arsip tujuan tidak menghilangkan nama); `reassign` pindah KEDUA kolom + collapse sumber=tujuan → 23514 atomic. Analytics/budget tidak berubah (sudah filter income/expense).
- Gotcha migrasi: `CREATE OR REPLACE VIEW` menolak sisip kolom di tengah (42P16) — pola V2 = `DROP VIEW IF EXISTS` + `CREATE` + revoke/grant ulang (pgTAP 13 menegaskan grant bertahan).
- Gotcha fixture: trigger future-date membuat fixture T6/T7 `2026-10-01T00:30:00+07:00` (masa depan per 20 Sep) gagal insert — digeser ke `2025-10-01T00:30:00+07:00` (boundary WIB/UTC identik) + bulan budget Okt ikut `2025-10-01`. **Semua fixture tanggal di suite pgTAP wajib masa lalu.**
- pgTAP `supabase/tests/database/13_transfer.sql` (42 assertion: shape 7, saldo 7, feed 4, analytics/budget 5, RLS+reassign 12, hak 7). Breakdown sebagai postgres melihat SEMUA user di DB bersama — assertion agregatnya wajib di blok RLS alice, bukan postgres.
- `scripts/verify-v2-transfer.mjs` (pola verify-t5 + provisionTestUser; butuh `SUPABASE_SERVICE_ROLE_KEY`): shape 6 penolakan → saldo 750rb/1,25jt/gabungan 2jt → feed satu baris → analytics expense 0 → edit 300rb → hapus → reassign collapse 23514 → reassign BCA→GoPay pindah counterparty → cross-user 23503 + anon 42501. Cleanup `delete from auth.users where email like 'v2-verify-%' or email like 'v2-other-%'`.
- Akun auth TIDAK bisa dibuat via `insert into auth.users` manual (GoTrue butuh baris `auth.identities` + state internal — "Database error querying schema"); provisioning akun uji hanya via Admin API.

### Database

- Project Supabase: `Cashtrix` — ref `bklriyyuglwiqczgbqgq`, region `ap-southeast-2`. `supabase/config.toml` `project_id` sudah diisi ref tersebut.- `auth.email.enable_confirmations` **false** di hosted (auto-confirm, PRD §6.1 R2 — kembalikan ke konfirmasi manual sebelum rilis publik). **Jangan `supabase config push` dari repo root**: `config.toml` di repo masih berisi nilai template lokal, jadi push akan menimpa `site_url`, `otp_length`, MFA, Twilio milik project. Untuk mengubah satu properti saja, jalankan `supabase config push --workdir <dir>` dengan `config.toml` minimal yang hanya mendeklarasikan properti itu (butuh `supabase/.temp` disalin agar ref terbaca).
- Edge Functions: `seed-user` (T3). Deploy tanpa Docker: `npx supabase functions deploy seed-user --use-api`. Fungsi selalu mengambil `user_id` dari `getUser(JWT)` — tidak pernah dari body — dan idempotent lewat `upsert(..., onConflict: 'user_id,name', ignoreDuplicates: true)`. `verify_jwt` tetap aktif (request tanpa JWT ditolak 401 sebelum handler jalan).
- Migrations: `supabase/migrations/20260917090000_schema.sql` (6 tabel + RLS + bucket `avatars`), `20260917090001_seed_system_categories.sql` (12 kategori sistem, idempotent), `20260918090000_wallet_balances_and_reassign.sql` (T4: view saldo + RPC reassign), `20260919090000_transaction_history.sql` (T5: `v_transactions_feed`, `soft_delete_transaction`/`restore_transaction`/`purge_deleted_transactions`, job pg_cron harian), `20260920090000_analytics.sql` (T6: `current_month(tz)`, `v_monthly_summary`, `v_category_breakdown(...)`, `v_analytics_series(...)`, `analytics_overview(...)`), `20260921090000_budgets.sql` (T7: `v_budget_status` + trigger expense-only + revoke EXECUTE fungsi trigger), `20260922090000_profile_categories.sql` (T8: `category_mutes` per-user + RLS; tanpa view/RPC baru).
- `v_wallet_balances` **wajib `security_invoker = true`** — view tanpa itu dibaca sebagai owner sehingga RLS ter-bypass dan saldo wallet user lain bocor (pgTAP `07_wallet_balances.sql` menangkapnya). Karena Supabase memberi default privileges ke `anon`, view baru juga harus `revoke all ... from anon, public` lalu `grant select ... to authenticated`; tanpa revoke, anon bisa membaca view tanpa login.
- `reassign_wallet_transactions(from_wallet, to_wallet)` (T4) = satu-satunya jalur bulk-move transaksi antar wallet; fixed `search_path = ''`, `grant execute` hanya ke `authenticated`, dan memindahkan transaksi **soft-deleted juga** supaya pemulihan 30 hari tidak menabrak FK RESTRICT. Error: `22023` argumen invalid, `P0002` wallet tidak ditemukan/bukan milik pemanggil.
- Views/fungsi agregasi: `v_wallet_balances` sejak T4 (#5), `v_transactions_feed` sejak T5 (#6), `v_monthly_summary` + `v_category_breakdown(...)` + `v_analytics_series(...)` + `analytics_overview(...)` + `current_month(tz)` sejak T6 (#7), `v_budget_status` sejak T7 (#8). `current_month(tz)` dipakai T6 untuk rentang 1M dan T7 untuk `month` budget.
- `analytics_overview(range_start, range_end, prev_start, prev_end, tz, wallet_filter, daily)` mengembalikan seluruh payload layar Analytics sebagai `jsonb` dalam satu round-trip; `range_end`/`prev_end` **eksklusif**, `delta.*` `null` saat periode sebelumnya nol (klien merender `—`, bukan Infinity/NaN). Semuanya `security invoker` (bukan definer) sehingga RLS menjadi penjaga — sama seperti `v_wallet_balances`. Karena `security invoker` inilah pgTAP wajib berpindah ke role `authenticated` untuk menguji scoping per-user (sebagai `postgres` RLS di-bypass dan agregat melihat semua user).
- `v_transactions_feed` (T5) **wajib `security_invoker = true`** + `revoke all ... from anon, public` lalu `grant select ... to authenticated`, alasan yang sama dengan `v_wallet_balances`. Ia join `categories` dan `wallets` di server dan menyaring `deleted_at is null`, jadi klien tidak pernah merakit nama kategori/wallet sendiri dan tidak pernah bisa menampilkan transaksi terhapus.
- `soft_delete_transaction(id)` / `restore_transaction(id)` (T5) mengembalikan **jumlah baris** (0 = tidak ada / bukan milik pemanggil), sehingga perbedaan "sudah terhapus" vs "bukan milik saya" tidak butuh pesan error khusus. `purge_deleted_transactions()` sengaja **bukan** security definer: sebagai `postgres` (cron) ia membersihkan semua user, sebagai `authenticated` RLS membatasinya ke baris sendiri.
- `pg_cron` di-install di database `postgres` oleh migrasi T5 dan menjadwalkan job `cashtrix-purge-deleted-transactions` (`0 3 * * *`). Installasinya dibungkus guard `pg_available_extensions` supaya migrasi tetap jalan di Postgres polos tanpa ekstensi itu.
- State remote (sudah diverifikasi): 6 tabel, 24 policy public, 4 policy `avatars_*` di `storage.objects`, bucket privat 2MB PNG/JPG, 12 kategori sistem, 4 view (`v_wallet_balances`, `v_transactions_feed`, `v_monthly_summary`, `v_budget_status` — semuanya security_invoker) + 9 RPC (`reassign_wallet_transactions`, `soft_delete_transaction`, `restore_transaction`, `purge_deleted_transactions`, `current_month`, `v_category_breakdown`, `v_analytics_series`, `analytics_overview`), 1 job pg_cron, 225 assertion pgTAP hijau (dijalankan via `psql` karena mesin ini tanpa Docker).
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
- DB tests (pgTAP): `npm run db:test` (`supabase test db`). **Butuh Docker/Podman** — `supabase test db --linked` tetap menjalankan `pg_prove` di container. Suite di `supabase/tests/database/` (11 file, 188 assertion) dan bisa juga dijalankan langsung dengan `psql` terhadap DB mana pun (`00_setup.sql` dulu, lalu 01–10; `set role postgres` + `set search_path = public, extensions`).
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
