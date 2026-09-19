# Offline write outbox waits for v2.0

v1.0 writes require a connection; on downtime the app is read-only and the write
is refused (PRD §5.2). An outbox (queue locally, flush later) looks like the
obvious next step and was listed in original §5.1, but it inverts that rule,
touches every screen, and needs a conflict story the rest of the model does not
have (idempotency keys cover retries of the same form session, not two devices
editing the same row offline). Read-through `expo-sqlite` is the same job: one
consistency model, not a side cache. Both land together in v2.0.

**Considered**: ship a write queue in v1.1 "just for Add Transaction". Rejected —
partial outbox is still an outbox, and the first conflict will be a support
incident, not a ticket.