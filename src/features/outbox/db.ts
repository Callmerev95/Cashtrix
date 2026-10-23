/**
 * SQLite seam for the offline outbox (OB1, issue #74).
 *
 * `expo-sqlite` is a native module — absent in Jest and unavailable on a
 * device whose binary predates the OB1 rebuild. Every access goes through
 * `openOutboxDb`, which fails open: the caller catches and keeps the online
 * path intact. The structural adapter type also gives tests an in-memory
 * implementation without mocking the native package.
 */

/** The small surface the outbox/cache stores need. */
export type OutboxDatabase = {
  execAsync(source: string): Promise<void>;
  runAsync(source: string, params: unknown[]): Promise<unknown>;
  getAllAsync<T>(source: string, params: unknown[]): Promise<T[]>;
  getFirstAsync<T>(source: string, params: unknown[]): Promise<T | null>;
};

const DATABASE_NAME = 'cashtrix.db';
const SCHEMA_VERSION = 1;

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS outbox (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'sending', 'failed')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  display_json TEXT NOT NULL,
  receipt_paths_json TEXT NOT NULL DEFAULT '[]',
  error_kind TEXT,
  error_message TEXT,
  idempotency_key TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS outbox_user_idempotency
  ON outbox (user_id, idempotency_key);

CREATE INDEX IF NOT EXISTS outbox_user_status_created
  ON outbox (user_id, status, created_at);

CREATE TABLE IF NOT EXISTS read_cache (
  user_id TEXT NOT NULL,
  cache_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  fetched_at TEXT NOT NULL,
  PRIMARY KEY (user_id, cache_key)
);

PRAGMA user_version = ${SCHEMA_VERSION};
`;

// `undefined` = production, `null` = tests forcing the unavailable path.
let testDatabase: OutboxDatabase | null | undefined;
let dbPromise: Promise<OutboxDatabase> | null = null;

async function migrate(db: OutboxDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
  const row = await db.getFirstAsync<{ user_version?: number }>(
    'PRAGMA user_version',
    [],
  );
  if ((row?.user_version ?? 0) >= SCHEMA_VERSION) return;
  await db.execAsync(SCHEMA_SQL);
}

/**
 * Opens (once) and migrates `cashtrix.db`. The promise is cached so concurrent
 * callers share one open; a rejection clears the cache so a later attempt can
 * retry instead of pinning the app to a transient failure.
 */
export function openOutboxDb(): Promise<OutboxDatabase> {
  if (testDatabase !== undefined) {
    return testDatabase === null
      ? Promise.reject(new Error('outbox database unavailable'))
      : Promise.resolve(testDatabase);
  }

  if (!dbPromise) {
    dbPromise = (async () => {
      // Lazy require: importing the native module at module scope would break
      // Jest (and any binary that predates the OB1 rebuild) even when the
      // queue is never used.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const expo = require('expo-sqlite') as {
        openDatabaseAsync: (name: string) => Promise<unknown>;
      };
      const db = (await expo.openDatabaseAsync(
        DATABASE_NAME,
      )) as unknown as OutboxDatabase;
      await migrate(db);
      return db;
    })().catch((cause: unknown) => {
      dbPromise = null;
      throw cause;
    });
  }

  return dbPromise;
}

export async function isOutboxDbAvailable(): Promise<boolean> {
  try {
    await openOutboxDb();
    return true;
  } catch {
    return false;
  }
}

/** Test seam: an in-memory adapter, or `null` to force the unavailable path. */
export function setOutboxDatabaseForTests(
  db: OutboxDatabase | null,
): void {
  testDatabase = db;
  dbPromise = null;
}

/** Restores the production lazy-open path (tests only). */
export function resetOutboxDatabaseForTests(): void {
  testDatabase = undefined;
  dbPromise = null;
}
