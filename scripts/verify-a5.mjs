/**
 * A5 live verification — drives the real anon client against the hosted project
 * and asserts the inbox contract the `/notifications` screen depends on.
 *
 * It fires two alerts (the same upsert the app's `recordAlert` uses), then
 * checks the inbox listing (newest-first, category joined, `read_at` null =
 * unread), single mark-read (sibling untouched), mark-all-read, cross-user
 * isolation (list 0, foreign mark = silent no-op), and anon denial.
 *
 * Run from the repo root:
 *   node scripts/verify-a5.mjs
 *
 * Cleanup: with SUPABASE_SERVICE_ROLE_KEY set, the test users are deleted at
 * the end (cascade); otherwise clean up manually:
 *   delete from auth.users where email like 'a5-verify-%' or email like 'a5-other-%';
 */
import { createClient } from '@supabase/supabase-js';
import { readAnonKey } from './lib/keys.mjs';

import { provisionTestUser, requireAdminClient } from './lib/admin-confirm.mjs';

const SUPABASE_URL = 'https://bklriyyuglwiqczgbqgq.supabase.co';

const anonKey = readAnonKey();

const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const stamp = Date.now();
const email = `a5-verify-${stamp}@cashtrix.test`;
const otherEmail = `a5-other-${stamp}@cashtrix.test`;
const password = 'Cashtrix123';

let passed = 0;
let failed = 0;

function check(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  ok  ${label}`);
  } else {
    failed += 1;
    console.log(`  FAIL ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n== ${title}`);
}

const supabase = createClient(SUPABASE_URL, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const other = createClient(SUPABASE_URL, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// V0: konfirmasi email aktif di hosted — akun uji dikonfirmasi via Admin API.
const admin = requireAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE);

async function inbox(client) {
  const { data, error } = await client
    .from('budget_alerts')
    .select('id,threshold,fired_at,read_at,categories(name)')
    .order('fired_at', { ascending: false })
    .order('id', { ascending: false });
  if (error) throw error;
  return data;
}

async function main() {
  // -------------------------------------------------------------------------
  section('auth + seed');
  const userId = await provisionTestUser(admin, supabase, {
    email,
    password,
    check,
    tag: 'user uji',
  });

  const seed = await supabase.functions.invoke('seed-user', { method: 'POST' });
  check('seed-user sukses', !seed.error, seed.error?.message);

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, kind')
    .is('archived_at', null);
  const food = categories.find((c) => c.kind === 'expense' && c.name === 'Makanan');
  check('kategori sistem terbaca', Boolean(food?.id));

  const cm = await supabase.rpc('current_month', { tz: 'Asia/Jakarta' });
  check('current_month hari = 1', !cm.error && String(cm.data).endsWith('-01'), String(cm.data));
  const month = cm.data;

  // -------------------------------------------------------------------------
  section('fire + inbox listing');
  async function fire(client, uid, threshold) {
    const { data, error } = await client
      .from('budget_alerts')
      .upsert(
        { user_id: uid, category_id: food.id, month, threshold },
        { onConflict: 'user_id,category_id,month,threshold', ignoreDuplicates: true },
      )
      .select('id');
    if (error) throw error;
    return data.length > 0;
  }

  check('fire warning_80 (true)', (await fire(supabase, userId, 'warning_80')) === true);
  check('fire exceeded_100 (true)', (await fire(supabase, userId, 'exceeded_100')) === true);

  let rows = await inbox(supabase);
  check('inbox 2 baris', rows.length === 2, String(rows.length));
  check(
    'terbaru dulu (exceeded di atas)',
    rows[0]?.threshold === 'exceeded_100',
    JSON.stringify(rows.map((r) => r.threshold)),
  );
  check(
    'keduanya belum dibaca + nama kategori terjoin',
    rows.every((r) => r.read_at === null) && rows.every((r) => r.categories?.name === 'Makanan'),
    JSON.stringify(rows),
  );

  // -------------------------------------------------------------------------
  section('mark-read satu + tandai semua');
  const warningId = rows.find((r) => r.threshold === 'warning_80').id;
  const markOne = await supabase
    .from('budget_alerts')
    .update({ read_at: new Date().toISOString() })
    .eq('id', warningId);
  check('mark-read 1 baris sukses', !markOne.error, markOne.error?.message);

  rows = await inbox(supabase);
  check(
    'warning terbaca, exceeded tetap unread',
    rows.find((r) => r.threshold === 'warning_80').read_at !== null &&
      rows.find((r) => r.threshold === 'exceeded_100').read_at === null,
    JSON.stringify(rows.map((r) => [r.threshold, r.read_at])),
  );

  const unread = await supabase.from('budget_alerts').select('id').is('read_at', null);
  check('unread tinggal 1', unread.data?.length === 1, String(unread.data?.length));

  const markAll = await supabase
    .from('budget_alerts')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  check('mark-all sukses', !markAll.error, markAll.error?.message);

  const unreadAfter = await supabase.from('budget_alerts').select('id').is('read_at', null);
  check('unread 0 setelah mark-all', unreadAfter.data?.length === 0, String(unreadAfter.data?.length));

  // -------------------------------------------------------------------------
  section('isolasi antar-user');
  const otherUserId = await provisionTestUser(admin, other, {
    email: otherEmail,
    password,
    check,
    tag: 'user lain',
  });
  await other.functions.invoke('seed-user', { method: 'POST' });

  const otherRows = await inbox(other);
  check('user lain melihat 0 alert', otherRows.length === 0, String(otherRows.length));

  const foreignMark = await other
    .from('budget_alerts')
    .update({ read_at: null })
    .eq('id', warningId);
  check('mark milik orang = no-op sunyi', !foreignMark.error, foreignMark.error?.message);
  const mineAfter = await supabase.from('budget_alerts').select('read_at').eq('id', warningId).single();
  check('baris saya tidak tersentuh', mineAfter.data?.read_at !== null, JSON.stringify(mineAfter.data));

  // -------------------------------------------------------------------------
  section('anon (tanpa login)');
  const anon = createClient(SUPABASE_URL, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonRead = await anon.from('budget_alerts').select('id');
  check('anon tidak bisa membaca budget_alerts', Boolean(anonRead.error), anonRead.error?.code);
  const anonWrite = await anon.from('budget_alerts').update({ read_at: new Date().toISOString() }).eq('id', warningId);
  check('anon tidak bisa menandai dibaca', Boolean(anonWrite.error), anonWrite.error?.code);

  // -------------------------------------------------------------------------
  section('cleanup');
  for (const id of [userId, otherUserId]) {
    const { error } = await admin.auth.admin.deleteUser(id);
    check(`hapus user uji ${id.slice(0, 8)}`, !error, error?.message);
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nverification crashed:', error);
  process.exit(1);
});
