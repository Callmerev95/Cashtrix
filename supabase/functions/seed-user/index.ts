/**
 * Edge Function `seed-user` (T3 / #4).
 *
 * Dipanggil klien dengan JWT user setelah login. Membuat wallet "Cash"
 * (type `cash`, opening 0) bila belum ada.
 *
 * Idempotent by construction: `upsert ... ignoreDuplicates` terhadap
 * `unique(user_id, name)` di `public.wallets` — aman diulang, termasuk saat
 * balapan antar dua request.
 *
 * Kategori default TIDAK dibuat di sini — 12 kategori sistem sudah ada dari
 * migrasi T2 dan terlihat semua akun lewat policy
 * `categories_select_own_or_system` (PRD §6.1 R2).
 *
 * Keamanan: service role key (bypass RLS) tetapi `user_id` selalu diambil
 * dari `auth.getUser()` terhadap JWT pemanggil, bukan dari body — tidak ada
 * cara menulis data milik akun lain.
 */
import { createClient } from '@supabase/supabase-js';

import { enforceRateLimit } from '../_shared/rate-limit.ts';

const CASH_WALLET_NAME = 'Cash';

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

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

  // D5 (#54): abuse guard — setelah auth valid, sebelum kerja apa pun.
  const limited = await enforceRateLimit(admin, 'seed-user', userId);
  if (limited) return limited;

  const { data: created, error: seedError } = await admin
    .from('wallets')
    .upsert(
      {
        user_id: userId,
        name: CASH_WALLET_NAME,
        type: 'cash',
        opening_balance: 0,
      },
      { onConflict: 'user_id,name', ignoreDuplicates: true },
    )
    .select('id')
    .maybeSingle();

  if (seedError) {
    console.error('seed-user upsert failed', seedError.code);
    return json({ error: 'seed_failed' }, 500);
  }

  if (created) {
    return json({ created: true, walletId: created.id }, 200);
  }

  const { data: wallet, error: readError } = await admin
    .from('wallets')
    .select('id')
    .eq('user_id', userId)
    .eq('name', CASH_WALLET_NAME)
    .maybeSingle();

  if (readError) {
    console.error('seed-user read failed', readError.code);
    return json({ error: 'seed_failed' }, 500);
  }

  return json({ created: false, walletId: wallet?.id ?? null }, 200);
});
