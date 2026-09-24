/**
 * Function rate-limit seam (D5, issue #54) — the pure Jest lock on the abuse
 * guard shared by the three Edge Functions.
 *
 * What is pinned here:
 * - ambang per user per 60 detik (seed-user 10 / export-csv 5 /
 *   delete-account 3) — nilai yang didokumentasikan di issue #54;
 * - bentuk penolakan 429 (status + header Retry-After + body
 *   `{ error: 'rate_limited', ... }` konsisten dengan shape error fungsi);
 * - keputusan `enforceRateLimit`: lolos → null, limit lewat → 429,
 *   fail-open saat RPC error/bentuk tak dikenal/fungsi tak dikenal (guard
 *   tidak boleh me-brick login/ekspor/hapus akun — lihat `_shared/rate-limit`).
 *
 * Perilaku RPC-nya sendiri (atomic increment, isolasi key, reset window)
 * dikunci pgTAP `17_function_rate_limits.sql`; flood end-to-end dikunci
 * `scripts/verify-d5.mjs`.
 */
import {
  enforceRateLimit,
  FUNCTION_RATE_LIMITS,
  RATE_LIMIT_WINDOW_SECONDS,
  rateLimitedResponse,
  type RpcCaller,
} from '../supabase/functions/_shared/rate-limit';

function stubRpc(
  data: unknown,
  error: { message: string } | null = null,
): RpcCaller & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data, error };
    },
  };
}

describe('rate-limit config — ambang issue #54', () => {
  it('window 60 detik', () => {
    expect(RATE_LIMIT_WINDOW_SECONDS).toBe(60);
  });

  it('seed-user 10, export-csv 5, delete-account 3', () => {
    expect(FUNCTION_RATE_LIMITS).toEqual({
      'seed-user': 10,
      'export-csv': 5,
      'delete-account': 3,
    });
  });
});

describe('rateLimitedResponse — bentuk penolakan 429', () => {
  it('status 429 + Retry-After + body konsisten', async () => {
    const res = rateLimitedResponse('seed-user', 10, 42);
    expect(res.status).toBe(429);
    expect(res.headers.get('Retry-After')).toBe('42');
    expect(res.headers.get('Content-Type')).toContain('application/json');
    expect(await res.json()).toEqual({
      error: 'rate_limited',
      function: 'seed-user',
      limit: 10,
      window_seconds: 60,
      retry_after_seconds: 42,
    });
  });
});

describe('enforceRateLimit — keputusan', () => {
  it('allowed → null dan memanggil RPC dengan argumen tepat', async () => {
    const admin = stubRpc([{ allowed: true, count: 1, retry_after_seconds: 0 }]);
    const out = await enforceRateLimit(admin, 'seed-user', 'user-1');
    expect(out).toBeNull();
    expect(admin.calls).toEqual([
      {
        fn: 'check_function_rate_limit',
        args: {
          p_function: 'seed-user',
          p_key: 'user-1',
          p_limit: 10,
          p_window_seconds: 60,
        },
      },
    ]);
  });

  it('menerima baris objek tunggal selain array', async () => {
    const admin = stubRpc({ allowed: true, count: 2, retry_after_seconds: 0 });
    expect(await enforceRateLimit(admin, 'export-csv', 'user-1')).toBeNull();
  });

  it('denied → 429 dengan retry dari server', async () => {
    const admin = stubRpc([{ allowed: false, count: 6, retry_after_seconds: 17 }]);
    const out = await enforceRateLimit(admin, 'export-csv', 'user-1');
    expect(out).not.toBeNull();
    expect(out!.status).toBe(429);
    expect(out!.headers.get('Retry-After')).toBe('17');
    expect(await out!.json()).toMatchObject({
      error: 'rate_limited',
      function: 'export-csv',
      limit: 5,
      retry_after_seconds: 17,
    });
  });

  it('fail-open saat RPC error (guard tidak me-brick request)', async () => {
    const admin = stubRpc(null, { message: 'connection reset' });
    expect(await enforceRateLimit(admin, 'seed-user', 'user-1')).toBeNull();
  });

  it('fail-open saat bentuk balikan tak dikenal', async () => {
    const admin = stubRpc([{ nope: true }]);
    expect(await enforceRateLimit(admin, 'seed-user', 'user-1')).toBeNull();
  });

  it('fungsi tak dikenal → null tanpa memanggil RPC', async () => {
    const admin = stubRpc([{ allowed: false, count: 99, retry_after_seconds: 1 }]);
    expect(await enforceRateLimit(admin, 'future-function', 'user-1')).toBeNull();
    expect(admin.calls).toEqual([]);
  });
});
