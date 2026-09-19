# Recurring Occurrences materialise on catch-up, not on a cron

A Recurring rule does not write anything by itself. On app open / foreground a
`security invoker` RPC inserts missed Occurrences whose due date is today or
earlier, each with `occurred_at` = that due date (not "now"). Cap: 12
Occurrences per Recurring rule per open; leftovers wait for the next open.
Future due dates stay unborn. Editing a Recurring rule (amount, Wallet,
Category, Due day) only affects unborn Occurrences — born ones are ordinary
Transactions. Identity: unique `(recurring_rule_id, occurred_on)` including
soft-deleted rows, so catch-up never twins a User's delete.

v1.1 frequency is monthly only, Due day 1–28 or "last day of month". Days
29–31 are not offered, so February cannot skip. A Recurring rule is income
or expense, never Transfer. Managed from Profile ("Transaksi berulang").
Required `starts_on` (month-1 in the Profile timezone, default = current
month); optional `ends_on`. Catch-up never writes before `starts_on` or
after `ends_on`. If `starts_on` is the current month and Due day already
passed, the first Occurrence is the **next** cycle — Catch-up does not
invent a past payment. User who already paid this month records it once
via Add Transaction. Cap 20 **active** Recurring rules per User; Jeda does not
count against the cap. **Jeda** stops catch-up and keeps born Occurrences;
**hapus** drops the Recurring rule and nulls `recurring_rule_id` on born
Occurrences (`ON DELETE SET NULL`) so history is not orphaned and not
cascade-deleted. Archiving the Recurring rule's Wallet auto-Jeda the rule
and shows a Profile banner.

An Occurrence is a normal Transaction: it moves Saldo, counts as Spent, and
can fire Alerts. Transfer picker only offers active Wallets; a later Archive
of a destination Wallet does not hide historical Transfers. Transfers reject
future dates, same as income/expense. Undo-delete is a ~5s snackbar calling
the existing `restore_transaction` RPC, including for Transfers.

**Considered**: `pg_cron` inserting as `postgres`. Rejected for v1.1 — there is
no server push, so punctual inserts are invisible until the User opens the app
anyway, and a cron write sits outside RLS. **Considered**: remind-only.
Rejected — that is a reminder, not Recurring. **Considered**: weekly/daily
and clamp-from-31. Rejected — persona is monthly salary/bills; clamp needs a
tz test matrix we do not want in v1.1. **Considered**: rewrite the current
month's unedited Occurrences on rule edit. Rejected — born Occurrences are
history.

OPEN-2 closed 2026-09-19. Frequency/cap/edit/identity closed 2026-09-19.
