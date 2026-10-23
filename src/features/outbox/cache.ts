/**
 * Read-through cache (OB1, issue #74) — the last successful feed/categories/
 * wallets payloads, so an offline launch has something honest to show.
 *
 * Only rows the app already loaded are stored (no prefetch). The caller caps
 * the feed at `READ_CACHE_LIMIT`; this module owns serialization only.
 */
import { openOutboxDb } from './db';

export type CacheKey = 'feed' | 'categories' | 'wallet-options' | 'wallets';

export type CachedPayload<T> = {
  data: T;
  /** ISO timestamp of the write that produced this data. */
  fetchedAt: string;
};

export async function readCache<T>(
  userId: string,
  key: CacheKey,
): Promise<CachedPayload<T> | null> {
  try {
    const db = await openOutboxDb();
    const row = await db.getFirstAsync<{
      payload_json: string;
      fetched_at: string;
    }>(
      'SELECT payload_json, fetched_at FROM read_cache WHERE user_id = ? AND cache_key = ?',
      [userId, key],
    );
    if (!row) return null;
    return {
      data: JSON.parse(row.payload_json) as T,
      fetchedAt: row.fetched_at,
    };
  } catch {
    // A corrupt/unavailable cache is a miss, never a screen error.
    return null;
  }
}

export async function writeCache<T>(
  userId: string,
  key: CacheKey,
  data: T,
): Promise<void> {
  try {
    const db = await openOutboxDb();
    await db.runAsync(
      `INSERT INTO read_cache (user_id, cache_key, payload_json, fetched_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, cache_key) DO UPDATE SET
         payload_json = excluded.payload_json,
         fetched_at = excluded.fetched_at`,
      [userId, key, JSON.stringify(data), new Date().toISOString()],
    );
  } catch {
    // Best-effort: a cache write must never fail a live read.
  }
}

export async function clearCache(userId: string): Promise<void> {
  try {
    const db = await openOutboxDb();
    await db.runAsync('DELETE FROM read_cache WHERE user_id = ?', [userId]);
  } catch {
    // Purge is best-effort; the next sign-in overwrites stale rows.
  }
}

/** Sign-out purge removes every cached payload (single-user device). */
export async function clearAllCache(): Promise<void> {
  try {
    const db = await openOutboxDb();
    await db.runAsync('DELETE FROM read_cache', []);
  } catch {
    // best-effort
  }
}
