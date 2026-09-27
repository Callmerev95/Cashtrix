# Offline outbox with blind last-writer-wins and degraded reads

Writes work offline by queueing on the device and flushing first-in-first-out,
one row at a time, when connectivity returns. The queue holds the user's
latest intent only: editing a queued row overwrites it, deleting drops it, and
undo of a queued row never touches the server. Conflicts resolve blindly, last
writer wins, single-device assumed; a delete is the strongest intent, so a
late edit arriving over a soft-deleted row is refused rather than resurrecting
it. Offline reads are degraded on purpose: lists and forms come from the local
cache, aggregation screens (Analytics, Budgets) stay online-only, so no server
aggregation logic is ever cloned into the client. Queue scope is transactions
(including widget splits) plus pending receipt uploads with OCR retry; budgets,
rules, categories, and wallets stay online-only.

**Considered**: multi-device merge with a conflict UI (rejected, full price
for a case that does not exist yet: the whole app already assumes one
device); atomic group flush (rejected, one bad photo would hold back money
that is already clear, against F1a); bulk flush in one request (rejected, rows
need individual outcomes for the pending indicator); silent background flush
with no UI (rejected, it breaks the PRD promise of clear communication during
outages); full offline reads including aggregations (rejected, cloned
aggregation drifts from server truth); queueing budget and rule edits (rejected,
conflict surface without matching value).

Cost: one native module (`expo-sqlite`, one preview rebuild) plus the queue
table and the pending strip UI. The queue key joins `LOCAL_STORAGE_KEYS` so
sign-out purges it; queues never move between devices. Idempotency keys are
minted when a queued row is created, not at flush, so a kill-and-restart
cannot double-post.
