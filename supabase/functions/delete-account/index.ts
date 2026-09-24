/**
 * Edge Function `delete-account` (T9 / #10, PRD §2.3 Epic F — F3).
 *
 * Menghapus permanen seluruh data milik pemanggil: avatar di bucket `avatars`,
 * baris di `transactions` (termasuk soft-deleted), `budget_alerts`, `budgets`,
 * `wallets`, `categories` milik sendiri (kategori sistem `user_id null` tidak
 * tersentuh), `profiles`, lalu Auth user via Admin API. **Tidak reversible.**
 *
 * Konfirmasi dua langkah (ketik "HAPUS") dicek di CLIENT/UI — lihat
 * `isDeleteConfirmation()` di `src/features/data-ownership/domain.ts`. Function
 * ini hanya mensyaratkan JWT valid; tanpa itu ditolak 401.
 *
 * Urutan hapus eksplisit penting: `transactions` menunjuk `wallets` dan
 * `categories` dengan `ON DELETE RESTRICT`, jadi transaksi harus hilang dulu
 * sebelum wallet/kategori bisa dihapus.
 */
import { createClient } from '@supabase/supabase-js';

import { enforceRateLimit } from '../_shared/rate-limit.ts';

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

  // D5 (#54): abuse guard — setelah auth valid, sebelum hapus apa pun.
  const limited = await enforceRateLimit(admin, 'delete-account', userId);
  if (limited) return limited;

  // Avatar: best-effort — kegagalan storage tidak boleh menggagalkan hapus
  // akun (flag dilaporkan agar klien tahu), karena baris DB + Auth user yang
  // menentukan "tidak ada baris user tersisa" (AC #5).
  let avatarDeleted = true;
  try {
    const { data: objects, error: listError } = await admin.storage
      .from('avatars')
      .list(userId);
    if (listError) throw listError;
    const paths = (objects ?? []).map((obj) => `${userId}/${obj.name}`);
    if (paths.length > 0) {
      const { error: removeError } = await admin.storage
        .from('avatars')
        .remove(paths);
      if (removeError) throw removeError;
    }
  } catch (error) {
    console.error('delete-account avatar cleanup failed', error);
    avatarDeleted = false;
  }

  // Transaksi dulu (FK RESTRICT ke wallets + categories), lalu sisanya.
  const deletions = [
    admin.from('transactions').delete().eq('user_id', userId),
    admin.from('budget_alerts').delete().eq('user_id', userId),
    admin.from('budgets').delete().eq('user_id', userId),
    admin.from('wallets').delete().eq('user_id', userId),
    admin.from('categories').delete().eq('user_id', userId),
    admin.from('profiles').delete().eq('id', userId),
  ];
  const removed: Record<string, number> = {};
  const tables = [
    'transactions',
    'budget_alerts',
    'budgets',
    'wallets',
    'categories',
    'profiles',
  ];
  for (let i = 0; i < deletions.length; i += 1) {
    const { data, error } = await deletions[i];
    if (error) {
      console.error(`delete-account ${tables[i]} failed`, error.code);
      return json({ error: 'delete_failed', table: tables[i] }, 500);
    }
    removed[tables[i]] = Array.isArray(data) ? data.length : 0;
  }

  const { error: deleteUserError } =
    await admin.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    console.error('delete-account auth user failed');
    return json({ error: 'delete_user_failed' }, 500);
  }

  return json({ deleted: true, avatarDeleted, removed }, 200);
});
