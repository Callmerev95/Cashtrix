/**
 * In-memory stand-in for the OB1 SQLite surface. It implements only the SQL
 * shapes the outbox/cache stores issue, so a typo in a query fails loudly
 * instead of silently passing against a generic mock.
 */
import type { OutboxDatabase } from '@/features/outbox/db';

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

type CacheSqlRow = {
  payload_json: string;
  fetched_at: string;
};

function normalize(sql: string): string {
  return sql.replace(/\s+/g, ' ').trim();
}

export function createMemoryOutboxDb(): OutboxDatabase {
  const outbox = new Map<string, OutboxSqlRow>();
  const cache = new Map<string, CacheSqlRow>();
  const cacheKey = (userId: string, key: string) => `${userId}\u0000${key}`;

  return {
    async execAsync() {
      // Schema/migration statements are irrelevant to the in-memory store.
    },

    async runAsync(source, params) {
      const sql = normalize(source);

      if (sql.startsWith('INSERT INTO outbox')) {
        const [
          id,
          userId,
          createdAt,
          updatedAt,
          payloadJson,
          displayJson,
          receiptPathsJson,
          idempotencyKey,
        ] = params as [
          string,
          string,
          string,
          string,
          string,
          string,
          string,
          string,
        ];
        const previous = outbox.get(id);
        outbox.set(id, {
          id,
          user_id: userId,
          status: previous?.status === 'sending' ? 'sending' : 'waiting',
          created_at: previous?.created_at ?? createdAt,
          updated_at: updatedAt,
          payload_json: payloadJson,
          display_json: displayJson,
          receipt_paths_json: receiptPathsJson,
          error_kind: null,
          error_message: null,
          idempotency_key: idempotencyKey,
        });
        return { changes: 1 };
      }

      if (sql.startsWith('UPDATE outbox')) {
        const [status, errorKind, errorMessage, updatedAt, userId, id] =
          params as [string, string | null, string | null, string, string, string];
        const row = outbox.get(id);
        if (row && row.user_id === userId) {
          outbox.set(id, {
            ...row,
            status,
            error_kind: errorKind,
            error_message: errorMessage,
            updated_at: updatedAt,
          });
        }
        return { changes: row ? 1 : 0 };
      }

      if (sql.startsWith('DELETE FROM outbox WHERE user_id = ? AND id = ?')) {
        const [userId, id] = params as [string, string];
        const row = outbox.get(id);
        if (row?.user_id === userId) outbox.delete(id);
        return { changes: row ? 1 : 0 };
      }

      if (sql.startsWith('DELETE FROM outbox WHERE user_id = ?')) {
        const [userId] = params as [string];
        for (const [id, row] of outbox) {
          if (row.user_id === userId) outbox.delete(id);
        }
        return { changes: 1 };
      }

      if (sql === 'DELETE FROM outbox') {
        outbox.clear();
        return { changes: 1 };
      }

      if (sql.startsWith('INSERT INTO read_cache')) {
        const [userId, key, payloadJson, fetchedAt] = params as [
          string,
          string,
          string,
          string,
        ];
        cache.set(cacheKey(userId, key), {
          payload_json: payloadJson,
          fetched_at: fetchedAt,
        });
        return { changes: 1 };
      }

      if (sql.startsWith('DELETE FROM read_cache WHERE user_id = ?')) {
        const [userId] = params as [string];
        for (const key of cache.keys()) {
          if (key.startsWith(`${userId}\u0000`)) cache.delete(key);
        }
        return { changes: 1 };
      }

      if (sql === 'DELETE FROM read_cache') {
        cache.clear();
        return { changes: 1 };
      }

      throw new Error(`unsupported runAsync: ${sql}`);
    },

    async getAllAsync<T>(source: string, params: unknown[]) {
      const sql = normalize(source);

      if (sql.startsWith('SELECT id, user_id, status')) {
        const [userId] = params as [string];
        return [...outbox.values()]
          .filter((row) => row.user_id === userId)
          .sort((a, b) => {
            const delta = a.created_at.localeCompare(b.created_at);
            return delta !== 0 ? delta : a.id.localeCompare(b.id);
          }) as unknown as T[];
      }

      if (sql.startsWith('SELECT receipt_paths_json FROM outbox')) {
        const [userId] = params as [string];
        return [...outbox.values()]
          .filter((row) => row.user_id === userId)
          .map((row) => ({ receipt_paths_json: row.receipt_paths_json })) as T[];
      }

      throw new Error(`unsupported getAllAsync: ${sql}`);
    },

    async getFirstAsync<T>(source: string, params: unknown[]): Promise<T | null> {
      const sql = normalize(source);

      if (sql === 'PRAGMA user_version') {
        return { user_version: 1 } as T;
      }

      if (sql.startsWith('SELECT id FROM outbox WHERE id = ? AND user_id = ?')) {
        const [id, userId] = params as [string, string];
        const row = outbox.get(id);
        return (row?.user_id === userId ? { id } : null) as T | null;
      }

      if (
        sql.startsWith('SELECT id, user_id, status') &&
        sql.includes('WHERE user_id = ? AND id = ?')
      ) {
        const [userId, id] = params as [string, string];
        const row = outbox.get(id);
        return (row?.user_id === userId ? row : null) as T | null;
      }

      if (sql.startsWith('SELECT COUNT(*) AS count FROM outbox')) {
        const [userId] = params as [string];
        const count = [...outbox.values()].filter(
          (row) => row.user_id === userId,
        ).length;
        return { count } as T;
      }

      if (sql.startsWith('SELECT payload_json, fetched_at FROM read_cache')) {
        const [userId, key] = params as [string, string];
        return (cache.get(cacheKey(userId, key)) ?? null) as T | null;
      }

      throw new Error(`unsupported getFirstAsync: ${sql}`);
    },
  };
}
