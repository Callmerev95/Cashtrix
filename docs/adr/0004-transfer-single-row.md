# Transfer is one row with a counterparty wallet

A Transfer is a single `transactions` row: `type=transfer`, `wallet_id` = source,
`counterparty_wallet_id` = destination, `amount` still positive. `category_id`
is null (check: transfer ↔ category null). Source Saldo falls, destination
Saldo rises, combined Saldo is unchanged. Analytics, Spent, and Alerts ignore
`type=transfer` (the v1.0 views already exclude it). Delete removes the one
row, so both sides vanish together. Edit of amount, date, note, or either
Wallet is allowed if both Wallets belong to the User and are not the same
Wallet. The Add form grows a third segment (Expense | Income | Transfer);
picking Transfer hides the Category grid and shows the destination Wallet
picker.

**Considered**: two paired rows with a `transfer_group_id`. Rejected — it forces
either a negative `amount` (against R4) or a new `direction` column, and makes
delete/edit a distributed transaction. **Considered**: a system Category
"Transfer" or letting the User pick a normal Category. Rejected — a third
`kind` infects every grid; a normal Category would pollute the donut.
**Considered**: a separate "Pindahkan" flow on the Wallets screen. Rejected —
one form, one idempotency key, one <20s path.

Reassign (existing RPC) updates both `wallet_id` and `counterparty_wallet_id`.
If that would make source = destination, reassign is **refused** — User picks a
third Wallet or deletes the Transfer first. Silent collapse or auto-deleting
the Transfer was rejected: one hides a money trail, the other makes delete-Wallet
harder than today.

OPEN-1 closed 2026-09-19. Category/form closed 2026-09-19. Reassign closed 2026-09-19.
