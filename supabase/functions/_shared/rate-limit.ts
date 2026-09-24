/**
 * Shared abuse guard for Edge Functions (D5 / #54).
 *
 * DB-backed fixed window: tiap function memanggil `enforceRateLimit()` tepat
 * setelah JWT terbukti valid (sebelum kerja apa pun) dengan `bucket_key` =
 * `user_id`. Tanpa JWT tetap 401 sebelum sampai sini — tidak ada key berbasis
 * IP. Penolakan = 429 + header `Retry-After` + body `{ error: 'rate_limited' }`
 * yang konsisten dengan shape error ketiga fungsi.
 *
 * Fail-open by design: bila RPC gagal (mis. hiccup DB), request diteruskan
 * dan error dicatat — guard abuse tidak boleh me-brick login/ekspor/hapus
 * akun. Kegagalan DB yang sesungguhnya tetap menggagalkan kerja utama
 * sesudahnya dengan 500 seperti biasa.
 *
 * File ini murni (tanpa global Deno saat import) supaya bisa diimpor Jest
 * sebagai seam (`__tests__/function-rate-limit.test.ts`); pemanggil
 * menyuntik client yang punya `.rpc()` (supabase-js admin, struktural cocok).
 */

export const RATE_LIMIT_WINDOW_SECONDS = 60;

/** Ambang per user_id per 60 detik (didokumentasikan di issue #54). */
export const FUNCTION_RATE_LIMITS: Record<string, number> = {
  'seed-user': 10,
  'export-csv': 5,
  'delete-account': 3,
};

export type RateLimitRow = {
  allowed: boolean;
  count: number;
  retry_after_seconds: number;
};

export type RpcCaller = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

function parseRow(data: unknown): RateLimitRow | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (
    row === null ||
    typeof row !== 'object' ||
    typeof (row as RateLimitRow).allowed !== 'boolean' ||
    typeof (row as RateLimitRow).count !== 'number' ||
    typeof (row as RateLimitRow).retry_after_seconds !== 'number'
  ) {
    return null;
  }
  return row as RateLimitRow;
}

/** Respons 429 yang sopan: header Retry-After + body konsisten `{error}`. */
export function rateLimitedResponse(
  functionName: string,
  limit: number,
  retryAfterSeconds: number,
): Response {
  return new Response(
    JSON.stringify({
      error: 'rate_limited',
      function: functionName,
      limit,
      window_seconds: RATE_LIMIT_WINDOW_SECONDS,
      retry_after_seconds: retryAfterSeconds,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(retryAfterSeconds),
      },
    },
  );
}

/**
 * Cek guard untuk satu request. Mengembalikan `Response` 429 bila limit
 * terlampaui, atau `null` bila request boleh lanjut (termasuk saat fungsi
 * tak dikenal atau RPC gagal — fail-open, lihat catatan file).
 */
export async function enforceRateLimit(
  admin: RpcCaller,
  functionName: string,
  bucketKey: string,
): Promise<Response | null> {
  const limit = FUNCTION_RATE_LIMITS[functionName];
  if (limit === undefined) return null;

  const { data, error } = await admin.rpc('check_function_rate_limit', {
    p_function: functionName,
    p_key: bucketKey,
    p_limit: limit,
    p_window_seconds: RATE_LIMIT_WINDOW_SECONDS,
  });
  if (error) {
    console.error(`${functionName} rate check failed`, error.message);
    return null;
  }

  const row = parseRow(data);
  if (!row) {
    console.error(`${functionName} rate check returned unexpected shape`);
    return null;
  }
  if (row.allowed) return null;
  return rateLimitedResponse(functionName, limit, row.retry_after_seconds);
}
