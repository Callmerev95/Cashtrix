# C6 migration notes (i18n ID/EN, #51) — working doc, delete on ticket close

Decisions locked: R10 + ADR-0008. Foundation commit: `1ea5f00`. This unit:
auth (5 screens + validation lang) + dashboard + `dictionaries.ts` leaf split.

## Proven pattern (copy verbatim for every screen)

1. Read the screen file; collect user-visible Indonesian literals (skip
   testIDs, route strings, icon names, `console`, placeholders that are
   already valid English/examples like `nama@email.com`).
2. Append namespace to `src/i18n/id.ts` (ID VERBATIM — never reword) +
   mirror in `src/i18n/en.ts` (same keys, same `{param}` sets; `Dictionary`
   type enforces compile-time parity, `i18n-dictionary.test.ts` at runtime).
3. Screen: `const language = useLanguage(); const t = dictionaryFor(language);`
   from `@/i18n`; replace literals with `t.…`; interpolate with `fill`.
   Pure modules import leafs only (`@/i18n/id`, `@/i18n/dictionaries`,
   `type … from @/i18n/locale`) — never `@/i18n` (pulls React via the hook).
4. New pure helpers take `lang: Language = 'id'` (old callers/tests green).
   Effects using `t`: `t` is mount-stable, safe in deps.
5. Gate per chunk: `npm run lint && npm run typecheck` + Jest
   (delete `__tests__/.session-seed.json` first) + `verify-t11 --static-only`
   at the end (tap texts stay literal via `id.ts` in `src/` — contract-safe).

## Done

`auth.{validation,legal,login,register,checkEmail,forgot,reset}`,
`budgets.{state,alert,inbox}`, `categories.{expense,income}` (12 system
names; twins `investasi`/`lainnya` keyed per kind),
`connectivity.offline`, `dashboard.{greeting,notif,wallets,history}`,
`common.{cancel,save,delete,retry}`. Wired: `alertCopy`,
`inboxAlertTitle`, `budgetStateLabel`, `authMessages`, `OFFLINE_MESSAGE`,
banner, `translateSystemCategory(kind, dbName, lang)`. Dashboard date kicker
uses `localeTagFor(language)` (first R10 formatting live).

## Remaining catalog (from full audit: ~235 unique strings, ~230 keys)

- **wallets** (~40): `wallets.validation.*`, `wallets.type.{bank,ewallet,cash,card}`
  (`Tunai` lives in `wallets/domain.ts:166` — verify verbatim), list kicker/
  title/total/count/empty/add/max-6/archive/move/toast strings in
  `app/(tabs)/index.tsx` (done), `app/wallets.tsx`, `app/wallet-form.tsx`,
  `TotalBalanceCard` (`N dompet`), `WalletRow`.
- **transactions** (~55, biggest): `transactions.validation.*`,
  `transfer.*` (incl. `Transfer ke {nama}` + `TRANSFER_ICON` untouched),
  `type.*`, form strings in `app/add-transaction.tsx` (`Tanggal tidak boleh
  di masa depan`, source/dest pickers, note placeholder), `undo-snackbar`
  (`Urungkan penghapusan`), history list, `calendar-grid` (weekday labels —
  audit flags hardcoded month/day names in `transactions/domain.ts:240-241,
  444-455`; replace with `Intl.DateTimeFormat(localeTag)` per R10, no static
  lists), `formatSignedAmount` untouched (glyphs, not words).
- **search** (~20, `app/search.tsx`): placeholder `Cari catatan, kategori,
  dompet…`, `Transfer tidak punya kategori.`, `Tidak ada hasil untuk "…"`,
  kind chips, bulk-mode toolbar/grid/confirm strings.
- **analytics** (~20): `analytics.range.*` (`1B/3B/6B/1T/Semua` — verify;
  range labels may stay symbolic), `kpi.*`, `section.*` (`Distribusi
  Pengeluaran`, `Tren Harian/Bulanan`), `empty.*` (`Belum ada data`),
  `monthly.*` (reuse for dashboard card), `formatMonthTitle`
  (`analytics/domain.ts:501` hardcodes `'id-ID'` → `localeTagFor`).
- **budgets screens** (~40): `budgets.screen.*`, `budgets.form.*`,
  `budgets.validation.*` in `app/(tabs)/budgets.tsx`, `app/budget-form.tsx`;
  month-name array `budgets.tsx:40-51` → `Intl` (same as calendar).
- **profile** (~55): `profile.screen.*` (`Mata uang tampilan`, `Contoh: …,
  tanpa konversi kurs.`, `Kelola kategori`, export/delete/sign-out/photo
  strings), `profile.validation.*`, `categories.screen.*`,
  `categoryForm.*` in `app/(tabs)/profile.tsx`, `app/categories.tsx`,
  `app/category-form.tsx`. `formatMoney` default locale (`profile/domain.ts`)
  → thread language (see numbers below).
- **recurring** (~45): `recurring.validation.*`, `recurring.status.*`
  (`Jeda`), `recurring.due.lastDay` (`Akhir bulan`),
  `recurring.screen.*`, `recurring.form.*` in `app/recurring.tsx`,
  `app/recurring-form.tsx`; month names `recurring/domain.ts:91-102` → `Intl`.
- **notifications inbox** (~10, `app/notifications.tsx`): `Tandai semua
  dibaca`, `Alert budget muncul di sini saat pengeluaran menyentuh 80% atau
  100%.`, `Lihat Budget`, loading/back.
- **data-ownership** (~11): `Bagikan data Cashtrix` (`share.ts:31`),
  `Hapus akun permanen?`, `Ketik HAPUS untuk melanjutkan.` — the `HAPUS`
  confirm word stays a literal gate (one key, do NOT translate the gate
  itself), `app/delete-account.tsx` strings.
- **numbers** (R10): `formatCurrency` (`wallets/domain.ts:78`), `formatMoney`
  (`profile/domain.ts`), `formatPercent` decimal comma
  (`budgets/domain.ts`), grouped `formatGrouped` — thread `lang` (default
  `'id'`) and switch `Intl` locale via `localeTagFor`. Tests asserting
  `id-ID` output keep defaults green; add `'en'` cases.
- **legal ID**: `docs/legal/` privacy+terms in Indonesian (hutang v1.1);
  same URLs pattern as EN (ADR-0006); in-app links unchanged.
- **B4 strings** (#50) must be written through the dictionary from the
  start — implement C6 first, or the dictionary before B4 copy.

## Explicitly out of dictionary

Brand/kicker `Cashtrix`, `Welcome Back` (already EN), `Email`/`Password`
labels + `nama@email.com`/`••••••••` placeholders (valid in both),
`CSV_HEADER`, icon names, route strings, `en-CA` technical date keys
(`analytics/domain.ts:311`), observability debug strings, `HAPUS` gate.
