/**
 * Outbox store (OB1/OB2, issues #74/#75) — persistence only. Status
 * transitions are exposed without running them; `flush.ts` owns the network
 * pass so the queue can be tested and inspected without a server.
 */
import { openOutboxDb } from './db';
import {
  OUTBOX_CAP,
  OutboxFullError,
  isQueueFull,
  type OutboxDisplay,
  type OutboxEnqueueInput,
  type OutboxErrorKind,
  type OutboxPayload,
  type OutboxRow,
  type OutboxStatus,
} from './domain';

type OutboxSqlRow = {
  id: string;
  user_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  payload_json: string;
  display_json: string;
  receipt_paths_json: string;
  error_kind: string | null;
  error_message: string | null;
  idempotency_key: string;
};

const COLUMNS =
  'id, user_id, status, created_at, updated_at, payload_json, display_json, receipt_paths_json, error_kind, error_message, idempotency_key';

function isStatus(value: string): value is OutboxStatus {
  return value === 'waiting' || value === 'sending' || value === 'failed';
}

function isErrorKind(value: unknown): value is OutboxErrorKind {
  return value === 'network' || value === 'server' || value === null;
}

function parseRow(row: OutboxSqlRow): OutboxRow | null {
  try {
    const payload = JSON.parse(row.payload_json) as OutboxPayload;
    const display = JSON.parse(row.display_json) as OutboxDisplay;
    if (
      !payload ||
      typeof payload !== 'object' ||
      typeof payload.idempotencyKey !== 'string' ||
      !display ||
      typeof display !== 'object' ||
      typeof display.occurredAt !== 'string'
    ) {
      return null;
    }
    return {
      id: row.id,
      userId: row.user_id,
      status: isStatus(row.status) ? row.status : 'waiting',
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      payload: {
        ...payload,
        receiptIds: Array.isArray(payload.receiptIds)
          ? payload.receiptIds
          : [],
        receiptPaths: Array.isArray(payload.receiptPaths)
          ? payload.receiptPaths
          : [],
      },
      display,
      errorKind: isErrorKind(row.error_kind) ? row.error_kind : null,
      errorMessage: row.error_message,
    };
  } catch {
    // A corrupt row must never brick the queue (or the app). It is skipped;
    // the flush keeps running on the remaining rows.
    return null;
  }
}

export async function listOutbox(userId: string): Promise<OutboxRow[]> {
  const db = await openOutboxDb();
  const rows = await db.getAllAsync<OutboxSqlRow>(
    `SELECT ${COLUMNS} FROM outbox WHERE user_id = ? ORDER BY created_at ASC, id ASC`,
    [userId],
  );
  return rows.map(parseRow).filter((row): row is OutboxRow => row !== null);
}

export async function getOutboxRow(
  userId: string,
  id: string,
): Promise<OutboxRow | null> {
  const db = await openOutboxDb();
  const row = await db.getFirstAsync<OutboxSqlRow>(
    `SELECT ${COLUMNS} FROM outbox WHERE user_id = ? AND id = ?`,
    [userId, id],
  );
  return row ? parseRow(row) : null;
}

export async function countOutbox(userId: string): Promise<number> {
  const db = await openOutboxDb();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM outbox WHERE user_id = ?',
    [userId],
  );
  return Number(row?.count ?? 0);
}

/**
 * Persists one save. The idempotency key is the primary key, so a retried
 * submit (same form session) updates the existing row instead of duplicating
 * it. A full queue rejects only *new* rows.
 */
export async function enqueueOutbox(
  input: OutboxEnqueueInput,
): Promise<OutboxRow> {
  const db = await openOutboxDb();
  const id = input.idempotencyKey;
  const existing = await db.getFirstAsync<{ id: string }>(
    'SELECT id FROM outbox WHERE id = ? AND user_id = ?',
    [id, input.userId],
  );

  if (!existing) {
    const count = await countOutbox(input.userId);
    if (isQueueFull(count)) throw new OutboxFullError();
  }

  const now = new Date().toISOString();
  const payload: OutboxPayload = {
    userId: input.userId,
    walletId: input.walletId,
    categoryId: input.categoryId,
    counterpartyWalletId: input.counterpartyWalletId,
    type: input.type,
    amount: input.amount,
    occurredAt: input.occurredAt,
    note: input.note,
    idempotencyKey: id,
    receiptIds: input.receiptIds,
    receiptPaths: input.receiptPaths,
  };

  await db.runAsync(
    `INSERT INTO outbox (
      id, user_id, status, created_at, updated_at, payload_json,
      display_json, receipt_paths_json, error_kind, error_message,
      idempotency_key
    ) VALUES (?, ?, 'waiting', ?, ?, ?, ?, ?, NULL, NULL, ?)
    ON CONFLICT(id) DO UPDATE SET
      payload_json = excluded.payload_json,
      display_json = excluded.display_json,
      receipt_paths_json = excluded.receipt_paths_json,
      error_kind = NULL,
      error_message = NULL,
      updated_at = excluded.updated_at,
      status = CASE
        WHEN outbox.status = 'sending' THEN outbox.status
        ELSE 'waiting'
      END`,
    [
      id,
      input.userId,
      now,
      now,
      JSON.stringify(payload),
      JSON.stringify(input.display),
      JSON.stringify(input.receiptPaths),
      id,
    ],
  );

  return {
    id,
    userId: input.userId,
    status: 'waiting',
    createdAt: now,
    updatedAt: now,
    payload,
    display: input.display,
    errorKind: null,
    errorMessage: null,
  };
}

export async function updateOutboxStatus(input: {
  userId: string;
  id: string;
  status: OutboxStatus;
  errorKind?: OutboxErrorKind;
  errorMessage?: string | null;
}): Promise<void> {
  const db = await openOutboxDb();
  await db.runAsync(
    `UPDATE outbox
       SET status = ?, error_kind = ?, error_message = ?, updated_at = ?
     WHERE user_id = ? AND id = ?`,
    [
      input.status,
      input.errorKind ?? null,
      input.errorMessage ?? null,
      new Date().toISOString(),
      input.userId,
      input.id,
    ],
  );
}

export async function deleteOutboxRow(
  userId: string,
  id: string,
): Promise<void> {
  const db = await openOutboxDb();
  await db.runAsync('DELETE FROM outbox WHERE user_id = ? AND id = ?', [
    userId,
    id,
  ]);
}

/** Drops rows the server accepted — OB2 uses this after a successful flush. */
export async function deleteOutboxRows(
  userId: string,
  ids: string[],
): Promise<void> {
  if (ids.length === 0) return;
  const db = await openOutboxDb();
  for (const id of ids) {
    await db.runAsync('DELETE FROM outbox WHERE user_id = ? AND id = ?', [
      userId,
      id,
    ]);
  }
}

export async function clearOutbox(userId: string): Promise<void> {
  const db = await openOutboxDb();
  await db.runAsync('DELETE FROM outbox WHERE user_id = ?', [userId]);
}

/** Sign-out purge removes every user's queue (single-user device). */
export async function clearAllOutbox(): Promise<void> {
  const db = await openOutboxDb();
  await db.runAsync('DELETE FROM outbox', []);
}

export async function listOutboxReceiptPaths(
  userId: string,
): Promise<string[]> {
  const db = await openOutboxDb();
  const rows = await db.getAllAsync<{ receipt_paths_json: string }>(
    'SELECT receipt_paths_json FROM outbox WHERE user_id = ?',
    [userId],
  );
  return rows.flatMap((row) => {
    try {
      const parsed = JSON.parse(row.receipt_paths_json) as unknown;
      return Array.isArray(parsed)
        ? parsed.filter((item): item is string => typeof item === 'string')
        : [];
    } catch {
      return [];
    }
  });
}

export { OUTBOX_CAP };
