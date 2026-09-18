/**
 * Edge Function `export-csv` (T9 / #10, PRD §2.3 Epic F — F2).
 *
 * Mengembalikan seluruh transaksi milik pemanggil sebagai CSV:
 *   date,type,category,wallet,amount,currency,note
 * diurut `occurred_at` desc, tanpa baris soft-deleted (`deleted_at is null`).
 *
 * Generasi dilakukan di server (PRD §2.3 AC F2) agar tidak membebani memori
 * client — T8 tinggal men-share string yang dikembalikan API client
 * (`src/features/data-ownership/api.ts` → `exportCsv()`) via share sheet.
 *
 * Keamanan: pola yang sama dengan `seed-user` — service role key (bypass RLS)
 * tetapi `user_id` selalu diambil dari `auth.getUser()` terhadap JWT pemanggil,
 * bukan dari body, lalu dipakai sebagai filter eksplisit. Tanpa JWT valid
 * request ditolak 401 sebelum query apa pun jalan.
 */
import { createClient } from '@supabase/supabase-js';

export const CSV_HEADER = 'date,type,category,wallet,amount,currency,note';

/** Baris transaksi mentah dari join server (kolom persis sesuai AC). */
export type CsvSourceRow = {
  occurred_at: string;
  type: string;
  category_name: string | null;
  wallet_name: string | null;
  amount: number | string;
  currency_code: string;
  note: string | null;
};

/**
 * RFC 4180 field escaping: bungkus dengan quotes bila mengandung koma, quote,
 * atau newline; gandakan quote di dalam field.
 */
export function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function toCsvRow(row: CsvSourceRow): string {
  return [
    row.occurred_at,
    row.type,
    row.category_name ?? '',
    row.wallet_name ?? '',
    String(row.amount),
    row.currency_code,
    row.note ?? '',
  ]
    .map(escapeCsvField)
    .join(',');
}

export function buildCsv(rows: CsvSourceRow[]): string {
  return [CSV_HEADER, ...rows.map(toCsvRow)].join('\n');
}

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const PAGE_SIZE = 1000;

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return json({ error: 'missing_authorization' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json({ error: 'server_misconfigured' }, 500);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await admin.auth.getUser(
    authHeader.slice('Bearer '.length),
  );
  if (userError || !userData.user) {
    return json({ error: 'invalid_token' }, 401);
  }
  const userId = userData.user.id;

  // Pagination eksplisit: `max_rows` API membatasi satu request di 1000 baris,
  // jadi loop sampai halaman terakhir agar ekspor lengkap berapa pun datanya.
  const rows: CsvSourceRow[] = [];
  let page = 0;
  for (;;) {
    const from = page * PAGE_SIZE;
    const { data, error } = await admin
      .from('transactions')
      .select(
        'occurred_at, type, amount, currency_code, note, categories!inner(name), wallets!inner(name)',
      )
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('occurred_at', { ascending: false })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      console.error('export-csv query failed', error.code);
      return json({ error: 'export_failed' }, 500);
    }

    const batch = (data ?? []) as {
      occurred_at: string;
      type: string;
      amount: number | string;
      currency_code: string;
      note: string | null;
      categories: { name: string } | { name: string }[];
      wallets: { name: string } | { name: string }[];
    }[];
    for (const item of batch) {
      const category = Array.isArray(item.categories)
        ? item.categories[0]
        : item.categories;
      const wallet = Array.isArray(item.wallets)
        ? item.wallets[0]
        : item.wallets;
      rows.push({
        occurred_at: item.occurred_at,
        type: item.type,
        category_name: category?.name ?? null,
        wallet_name: wallet?.name ?? null,
        amount: item.amount,
        currency_code: item.currency_code,
        note: item.note,
      });
    }

    if (batch.length < PAGE_SIZE) break;
    page += 1;
  }

  return new Response(buildCsv(rows), {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="cashtrix-export.csv"',
    },
  });
});
