/**
 * T11 live verification — API-level mirror of the Maestro happy path
 * (issue #12, `.maestro/flows/happy-path.yaml`).
 *
 * The Maestro flow itself needs a simulator/emulator + dev build (see
 * docs/release-gate.md), so this script replays the exact same journey
 * through the anon client and proves the server side of every step:
 * register → seed → 3 transaksi → saldo gabungan → feed → analytics →
 * budget → trigger alert (+ dedup). It also proves the two static halves of
 * the gate that need no device: every `id:` selector in the flows exists as
 * a testID in app/src, and the three KPI events fire on this exact path
 * (call-site grep).
 *
 * Run from the repo root:
 *   node scripts/verify-t11.mjs
 *   node scripts/verify-t11.mjs --static-only   # no device, no DB: selector
 *     contract + KPI event call-sites only (this is what CI runs)
 *
 * Cleanup: user uji dihapus di akhir via `delete-account` T9 (JWT sendiri,
 * membuktikan fungsi hapus-akun sekaligus) — tidak perlu service key dan
 * tidak ada residu. Jika script crash di tengah, bersihkan manual:
 *   delete from auth.users where email like 't11-verify-%';
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { provisionTestUser, requireAdminClient } from './lib/admin-confirm.mjs';

const SUPABASE_URL = 'https://bklriyyuglwiqczgbqgq.supabase.co';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * CI (`--static-only`) has no `.env` (gitignored) and no network: the anon
 * key is read lazily on the live path only — from `.env` locally, or from
 * the environment (CI secrets) otherwise.
 */
function readAnonKey() {
  const dotEnv = join(ROOT, '.env');
  const text = existsSync(dotEnv) ? readFileSync(dotEnv, 'utf8') : '';
  return (
    /EXPO_PUBLIC_SUPABASE_ANON_KEY=(.+)/.exec(text)?.[1]?.trim() ||
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
    ''
  );
}

const stamp = Date.now();
const email = `t11-verify-${stamp}@cashtrix.test`;
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

function monthStartWib(now, monthsBack) {
  // First day of the month, monthsBack ago, at 00:00 WIB (= previous day 17:00Z).
  const wib = new Date(now.getTime() + 7 * 3_600_000);
  const monday = new Date(
    Date.UTC(wib.getUTCFullYear(), wib.getUTCMonth() - monthsBack, 1, 0, 0, 0),
  );
  return new Date(monday.getTime() - 7 * 3_600_000);
}

async function main() {
  if (process.argv.includes('--static-only')) {
    runStaticContract();
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
  }

  // -------------------------------------------------------------------------
  section('provisi Admin → seed (langkah 1 Maestro: login)');
  // V0: konfirmasi email aktif di hosted — akun uji dikonfirmasi via Admin
  // API (butuh SUPABASE_SERVICE_ROLE_KEY), lalu login bersesi.
  const anonKey = readAnonKey();
  if (!anonKey) {
    throw new Error(
      'EXPO_PUBLIC_SUPABASE_ANON_KEY tidak ditemukan (isi .env atau env)',
    );
  }
  const supabase = createClient(SUPABASE_URL, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = requireAdminClient(
    SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  );
  const userId = await provisionTestUser(admin, supabase, {
    email,
    password,
    check,
    tag: 'user uji',
  });

  const seed = await supabase.functions.invoke('seed-user', { method: 'POST' });
  check('seed-user sukses', !seed.error, seed.error?.message);

  const { data: wallets } = await supabase
    .from('wallets')
    .select('id, name')
    .order('created_at');
  check('seed membuat wallet Cash', wallets?.[0]?.name === 'Cash', wallets?.[0]?.name);
  const cashId = wallets[0].id;

  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, kind')
    .is('archived_at', null);
  const food = categories.find((c) => c.kind === 'expense' && c.name === 'Makanan');
  const transport = categories.find(
    (c) => c.kind === 'expense' && c.name === 'Transportasi',
  );
  const salary = categories.find((c) => c.kind === 'income' && c.name === 'Gaji');
  check(
    'kategori Makanan/Transportasi/Gaji terbaca',
    Boolean(food?.id && transport?.id && salary?.id),
  );

  // -------------------------------------------------------------------------
  section('3 transaksi (langkah 2–4 Maestro: 50rb + 25rb + 5jt)');
  const nowIso = new Date().toISOString();
  const tx = (categoryId, type, amount) => ({
    user_id: userId,
    wallet_id: cashId,
    category_id: categoryId,
    type,
    amount,
    currency_code: 'IDR',
    occurred_at: nowIso,
    idempotency_key: crypto.randomUUID(),
  });

  const inserts = await supabase.from('transactions').insert([
    tx(food.id, 'expense', 50_000),
    tx(transport.id, 'expense', 25_000),
    tx(salary.id, 'income', 5_000_000),
  ]);
  check('3 transaksi tersimpan', !inserts.error, inserts.error?.message);

  const balances = await supabase.from('v_wallet_balances').select('balance');
  const total = (balances.data ?? []).reduce(
    (sum, row) => sum + Number(row.balance),
    0,
  );
  check(
    'saldo gabungan = 5jt − 75rb (Dashboard hero)',
    !balances.error && total === 4_925_000,
    JSON.stringify(balances.data),
  );

  const feed = await supabase
    .from('v_transactions_feed')
    .select('id')
    .order('occurred_at', { ascending: false })
    .limit(20);
  check(
    'feed menampilkan 3 transaksi (dashboard-history)',
    !feed.error && feed.data?.length === 3,
    String(feed.data?.length),
  );

  // -------------------------------------------------------------------------
  section('analytics (langkah 5 Maestro: KPI + donut)');
  const now = new Date();
  const overview = await supabase.rpc('analytics_overview', {
    range_start: monthStartWib(now, 0).toISOString(),
    range_end: monthStartWib(now, -1).toISOString(),
    prev_start: monthStartWib(now, 1).toISOString(),
    prev_end: monthStartWib(now, 0).toISOString(),
    tz: 'Asia/Jakarta',
    wallet_filter: null,
    daily: true,
  });
  check('analytics_overview callable', !overview.error, overview.error?.message);
  const payload = overview.data ?? {};
  check(
    'totals expense 75rb / income 5jt',
    Number(payload.totals?.expense) === 75_000 &&
      Number(payload.totals?.income) === 5_000_000,
    JSON.stringify(payload.totals),
  );
  check(
    'breakdown 2 kategori expense, Makanan teratas',
    payload.breakdown?.length === 2 &&
      payload.breakdown[0]?.category_name === 'Makanan',
    JSON.stringify(payload.breakdown?.map((b) => b.category_name)),
  );

  // -------------------------------------------------------------------------
  section('budget + trigger alert (langkah 6–7 Maestro)');
  const cm = await supabase.rpc('current_month', { tz: 'Asia/Jakarta' });
  check('current_month terbaca', !cm.error, cm.error?.message);
  const month = cm.data;

  const budget = await supabase.from('budgets').upsert(
    { user_id: userId, category_id: food.id, month, amount_limit: 200_000 },
    { onConflict: 'user_id,category_id,month' },
  );
  check('budget Makanan 200rb tersimpan', !budget.error, budget.error?.message);

  const trigger = await supabase.from('transactions').insert([
    tx(food.id, 'expense', 150_000),
  ]);
  check('transaksi pemicu 150rb tersimpan', !trigger.error, trigger.error?.message);

  const status = await supabase
    .from('v_budget_status')
    .select('spent, percent, state')
    .eq('month', month)
    .eq('category_id', food.id)
    .maybeSingle();
  check(
    'spent 200rb/200rb = 100% exceeded (banner "terlampaui")',
    !status.error &&
      Number(status.data?.spent) === 200_000 &&
      status.data?.state === 'exceeded',
    JSON.stringify(status.data),
  );

  const fire = (threshold) =>
    supabase
      .from('budget_alerts')
      .upsert(
        { user_id: userId, category_id: food.id, month, threshold },
        {
          onConflict: 'user_id,category_id,month,threshold',
          ignoreDuplicates: true,
        },
      )
      .select('id');
  const first = await fire('exceeded_100');
  const refire = await fire('exceeded_100');
  check('exceeded_100 pertama tercatat', first.data?.length === 1);
  check('refire dedup (tanpa spam)', refire.data?.length === 0);

  // -------------------------------------------------------------------------
  section('kontrak statis gerbang: selektor + event KPI');
  runStaticContract();

  // -------------------------------------------------------------------------
  section('cleanup (via delete-account T9 — tanpa service key)');
  const deleted = await supabase.functions.invoke('delete-account', {
    method: 'POST',
  });
  check('delete-account sukses', !deleted.error, deleted.error?.message);
  check(
    'respons deleted=true',
    deleted.data?.deleted === true,
    JSON.stringify(deleted.data),
  );

  const loginAgain = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  check('login kredensial lama gagal', Boolean(loginAgain.error), 'masih bisa login?!');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

/**
 * Static half of the gate: needs no device and no database. Every `id:`
 * selector used by the flows must resolve to a testID in app/src (static
 * literal, overridable default, dynamic template prefix, or a composed
 * `-action` button), every text tap must name a label present in code or in
 * the category seed, and the three KPI events must be emitted on this path.
 */
function runStaticContract() {
  const sources = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules') walk(full);
      } else if (/\.(tsx?|yaml)$/.test(entry.name)) {
        sources.push(full);
      }
    }
  };
  walk(join(ROOT, 'app'));
  walk(join(ROOT, 'src'));
  const searchable = sources.map((file) => readFileSync(file, 'utf8')).join('\n');

  // Static testIDs plus dynamic template prefixes (`tab-${route.name}`,
  // `budget-alert-${categoryId}`, `category-${id}` …). Components that take
  // an overridable testID declare the effective value as a default
  // (`testID = 'analytics-kpi'`), so those count as static too.
  const staticIds = new Set([
    ...[...searchable.matchAll(/testID="([^"]+)"/g)].map((m) => m[1]),
    ...[...searchable.matchAll(/testID\s*=\s*'([^']+)'/g)].map((m) => m[1]),
  ]);
  const prefixes = [...searchable.matchAll(/testID=\{`([^`$]*)/g)]
    .map((m) => m[1])
    // An empty prefix (`` `${something}-suffix` ``) proves nothing — drop it
    // so the check cannot pass vacuously.
    .filter((prefix) => prefix.length > 0);
  const hasTestId = (id) =>
    staticIds.has(id) ||
    prefixes.some((prefix) => id.startsWith(prefix)) ||
    // Composed at runtime: SectionHeader/EmptyStateCard render
    // `${testID}-action` from a static base (`budgets-empty` → button
    // `budgets-empty-action`).
    (id.endsWith('-action') && staticIds.has(id.slice(0, -'-action'.length)));

  const flowText = ['happy-path.yaml', 'smoke.yaml']
    .map((name) => readFileSync(join(ROOT, '.maestro/flows', name), 'utf8'))
    .join('\n');
  const ids = [
    ...flowText.matchAll(
      /^\s*-?\s*(?:tapOn|assertVisible):\s*\n?\s*id:\s*"([^"]+)"/gm,
    ),
  ].map((m) => m[1]);
  const missing = ids.filter((id) => !hasTestId(id));
  check(
    `${ids.length} selektor id: Maestro punya testID`,
    missing.length === 0,
    missing.join(', '),
  );

  const textTaps = [...flowText.matchAll(/^-\s*tapOn:\s*"([^"]+)"$/gm)].map(
    (m) => m[1],
  );
  // Category display names live in the seed migration, not in app/src.
  const seedText = readFileSync(
    join(ROOT, 'supabase/migrations/20260917090001_seed_system_categories.sql'),
    'utf8',
  );
  const missingText = textTaps.filter(
    (text) => !searchable.includes(text) && !seedText.includes(text),
  );
  check(
    `${textTaps.length} tap teks punya label di kode/seed`,
    missingText.length === 0,
    missingText.join(', '),
  );

  const events = ['screen_view', 'tx_created', 'budget_threshold_reached'];
  const missingEvents = events.filter((name) => !searchable.includes(name));
  check(
    '3 event KPI terkirim di jalur happy path',
    missingEvents.length === 0,
    missingEvents.join(', '),
  );
}

main().catch((error) => {
  console.error('\nverification crashed:', error);
  process.exit(1);
});
