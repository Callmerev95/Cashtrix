# Savings goal attached to a wallet (progress = wallet balance)

A savings target is metadata on one Wallet: optional name, target amount and
optional target date. Its progress is the Wallet's Saldo from
`v_wallet_balances`; there is no second balance column and no allocation
ledger. One Wallet has at most one target.

**Considered**: an envelope/earmark ledger with its own balance (rejected —
the same money would be counted twice and every Transfer would need a second
allocation decision); a separate "savings account" entity (rejected — that is
already a Wallet, so the new entity would only add a parallel balance); a
percentage split of a Wallet balance (rejected — progress could not be spent
or verified against the real Saldo); auto-transfer on payday (rejected for v1 —
saving must stay an explicit Transfer, consistent with "no auto-write" in the
rest of the app).

**Decision**: `savings_goals` stores `(user_id, wallet_id, name,
target_amount, target_date)` with `unique(user_id, wallet_id)` and a composite
FK to `wallets(id, user_id)` on delete restrict. The client derives progress,
percent, status and the optional monthly estimate from the existing
`v_wallet_balances` row; all money still comes from Postgres. Adding funds is
the existing Transfer flow with the goal's Wallet as destination — no deposit
endpoint.

**Consequences**: progress can go down when the Wallet is spent, and an old
Wallet balance counts immediately (expected: the target describes money
already held). Archived Wallets hide their goals until unarchived, and a Wallet
with a goal cannot be deleted until the goal is removed (the UI guards before
reassign, the FK is the backstop). The 10-Wallet limit already caps targets at
10; no new quota trigger. Dashboard and `/savings` read one shared provider
placed inside `WalletsProvider`; transaction mutations need no savings wiring
because they already refresh Wallet balances. The ring is a new gold-only
component (a budget ring would imply amber/salmon budget states), and
balance-hidden mode masks the current amount, percent, estimate and status so
the target card cannot leak the Saldo. One additive table + RLS; no new view,
RPC, native module or rebuild — ships as a 2.1.x OTA.
