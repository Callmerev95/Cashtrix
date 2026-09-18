/**
 * T8 live verification — drives the real anon client against the hosted project
 * and asserts the profile contract the screen depends on.
 *
 * It seeds a user, checks the default profile row (`Pengguna`/`IDR`), updates
 * name + currency, proves the 60-char guard, runs custom-category CRUD
 * (unique per user, system rows untouchable, archive-via-mute for system
 * rows), uploads a 1×1 PNG avatar to the private prefix (then deletes it),
 * and proves cross-user isolation + anon denial.
 *
 * Run from the repo root:
 *   node scripts/verify-t8.mjs
 *
 * Cleanup: with SUPABASE_SERVICE_ROLE_KEY set, the test users are deleted at
 * the end (cascade); otherwise clean up manually:
 *   delete from auth.users where email like 't8-verify-%' or email like 't8-other-%';
 */
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';

const SUPABASE_URL = 'https://bklriyyuglwiqczgbqgq.supabase.co';

const env = readFileSync(new URL('../.env', import.meta.url), 'utf8');
const anonKey =
  /EXPO_PUBLIC_SUPABASE_ANON_KEY=(.+)/.exec(env)?.[1]?.trim() ?? '';
if (!anonKey) throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY tidak ditemukan');

const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

const stamp = Date.now();
const email = `t8-verify-${stamp}@cashtrix.test`;
const otherEmail = `t8-other-${stamp}@cashtrix.test`;
const password = 'Cashtrix123';

// 1×1 transparent PNG (67 bytes) — proves the avatar upload path end to end
// without shipping a fixture file.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

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

async function main() {
  // -------------------------------------------------------------------------
  section('auth + seed + profil default');
  const signUp = await supabase.auth.signUp({ email, password });
  if (signUp.error) throw signUp.error;
  check('signup menghasilkan sesi (auto-confirm)', Boolean(signUp.data.session));
  const userId = signUp.data.user.id;

  const seed = await supabase.functions.invoke('seed-user', { method: 'POST' });
  check('seed-user sukses', !seed.error, seed.error?.message);

  const profile = await supabase.from('profiles').select('*').maybeSingle();
  check(
    'profil default Pengguna/IDR/Asia_Jakarta',
    profile.data?.display_name === 'Pengguna' &&
      profile.data?.currency_code === 'IDR' &&
      profile.data?.timezone === 'Asia/Jakarta',
    JSON.stringify(profile.data),
  );

  // -------------------------------------------------------------------------
  section('update nama + currency + guard 60 char');
  const rename = await supabase
    .from('profiles')
    .update({ display_name: 'Evelyn T8', currency_code: 'USD' })
    .eq('id', userId)
    .select('display_name, currency_code')
    .maybeSingle();
  check(
    'nama + currency tersimpan',
    rename.data?.display_name === 'Evelyn T8' &&
      rename.data?.currency_code === 'USD',
    JSON.stringify(rename),
  );

  const tooLong = await supabase
    .from('profiles')
    .update({ display_name: 'a'.repeat(61) })
    .eq('id', userId);
  check('nama >60 char ditolak (23514)', tooLong.error?.code === '23514', tooLong.error?.code);

  // -------------------------------------------------------------------------
  section('kategori kustom: CRUD + unique + guard sistem');
  const sys = await supabase
    .from('categories')
    .select('id, name, kind')
    .is('user_id', null)
    .eq('name', 'Makanan')
    .maybeSingle();
  check('kategori sistem terbaca', Boolean(sys.data?.id), JSON.stringify(sys.data));

  const created = await supabase
    .from('categories')
    .insert({ user_id: userId, name: 'Jajan T8', icon: 'fastfood', kind: 'expense', is_system: false })
    .select('id')
    .single();
  check('kategori kustom tersimpan', !created.error, created.error?.message);
  const customId = created.data.id;

  const dup = await supabase.from('categories').insert({
    user_id: userId, name: 'Jajan T8', icon: 'fastfood', kind: 'expense', is_system: false,
  });
  check('duplikat (user, nama, kind) ditolak (23505)', dup.error?.code === '23505', dup.error?.code);

  const sameNameOtherKind = await supabase.from('categories').insert({
    user_id: userId, name: 'Jajan T8', icon: 'trending_up', kind: 'income', is_system: false,
  });
  check('nama sama beda kind diizinkan', !sameNameOtherKind.error, sameNameOtherKind.error?.message);

  const fakeSystem = await supabase.from('categories').insert({
    user_id: userId, name: 'Palsu T8', icon: 'category', kind: 'expense', is_system: true,
  });
  check('user tidak bisa membuat kategori is_system (42501)', Boolean(fakeSystem.error), fakeSystem.error?.code);

  const delSystem = await supabase.from('categories').delete().eq('id', sys.data.id);
  const sysStill = await supabase.from('categories').select('id').eq('id', sys.data.id).maybeSingle();
  check(
    'delete kategori bawaan no-op (tetap ada)',
    !delSystem.error && Boolean(sysStill.data?.id),
    JSON.stringify(sysStill.data),
  );

  // -------------------------------------------------------------------------
  section('arsip: kustom via archived_at, bawaan via category_mutes');
  const archiveCustom = await supabase
    .from('categories')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', customId);
  check('arsip kategori kustom sukses', !archiveCustom.error, archiveCustom.error?.message);

  const unarchiveCustom = await supabase
    .from('categories')
    .update({ archived_at: null })
    .eq('id', customId);
  check('pulihkan kategori kustom sukses', !unarchiveCustom.error, unarchiveCustom.error?.message);

  const mute = await supabase
    .from('category_mutes')
    .upsert(
      { user_id: userId, category_id: sys.data.id },
      { onConflict: 'user_id,category_id', ignoreDuplicates: true },
    )
    .select('id');
  check('mute kategori bawaan tersimpan', (mute.data?.length ?? 0) === 1, JSON.stringify(mute));

  const muteAgain = await supabase
    .from('category_mutes')
    .upsert(
      { user_id: userId, category_id: sys.data.id },
      { onConflict: 'user_id,category_id', ignoreDuplicates: true },
    )
    .select('id');
  check('mute ganda dedup (0 baris baru)', (muteAgain.data?.length ?? 0) === 0);

  const unmute = await supabase
    .from('category_mutes')
    .delete()
    .eq('user_id', userId)
    .eq('category_id', sys.data.id);
  check('unmute sukses', !unmute.error, unmute.error?.message);

  // -------------------------------------------------------------------------
  section('avatar: upload prefix sendiri, signed URL, prefix asing ditolak');
  const avatarPath = `${userId}/avatar.jpg`;
  const upload = await supabase.storage
    .from('avatars')
    .upload(avatarPath, PNG_1X1, { contentType: 'image/png', upsert: true });
  check('upload avatar ke prefix sendiri sukses', !upload.error, upload.error?.message);

  const setAvatar = await supabase.from('profiles').update({ avatar_url: avatarPath }).eq('id', userId);
  check('path avatar tersimpan di profil', !setAvatar.error, setAvatar.error?.message);

  const signed = await supabase.storage.from('avatars').createSignedUrl(avatarPath, 60);
  check(
    'signed URL avatar terbit',
    !signed.error && (signed.data?.signedUrl ?? '').startsWith('https://'),
    signed.error?.message,
  );

  const otherSignUp = await other.auth.signUp({ email: otherEmail, password });
  if (otherSignUp.error) throw otherSignUp.error;
  const otherUserId = otherSignUp.data.user.id;

  const foreignUpload = await other.storage
    .from('avatars')
    .upload(avatarPath, PNG_1X1, { contentType: 'image/png', upsert: true });
  check('upload ke prefix user lain ditolak', Boolean(foreignUpload.error), foreignUpload.error?.message);

  await supabase.storage.from('avatars').remove([avatarPath]);

  // -------------------------------------------------------------------------
  section('isolasi antar-user + anon');
  const otherCustom = await other
    .from('categories')
    .select('id')
    .eq('name', 'Jajan T8');
  check(
    'user lain tidak melihat kategori kustom saya',
    (otherCustom.data?.length ?? -1) === 0,
    JSON.stringify(otherCustom.data),
  );

  const otherMute = await other
    .from('category_mutes')
    .upsert(
      { user_id: otherUserId, category_id: sys.data.id },
      { onConflict: 'user_id,category_id', ignoreDuplicates: true },
    )
    .select('id');
  check(
    'user lain mute kategori bawaan yang sama secara independen',
    (otherMute.data?.length ?? 0) === 1,
    JSON.stringify(otherMute),
  );

  const anon = createClient(SUPABASE_URL, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const anonMutes = await anon.from('category_mutes').select('id');
  check('anon tidak bisa membaca category_mutes', Boolean(anonMutes.error), anonMutes.error?.code);
  const anonProfiles = await anon.from('profiles').select('id');
  check('anon tidak bisa membaca profiles', Boolean(anonProfiles.error), anonProfiles.error?.code);

  // -------------------------------------------------------------------------
  section('cleanup');
  if (SUPABASE_SERVICE_ROLE) {
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    for (const id of [userId, otherUserId]) {
      const { error } = await admin.auth.admin.deleteUser(id);
      check(`hapus user uji ${id.slice(0, 8)}`, !error, error?.message);
    }
    const residue = await admin.from('profiles').select('id').in('id', [userId, otherUserId]);
    check('0 residu profil', (residue.data?.length ?? -1) === 0, JSON.stringify(residue.data));
  } else {
    console.log(
      '  (SUPABASE_SERVICE_ROLE_KEY tidak di-set — user uji dibiarkan; hapus manual)',
    );
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error('\nverification crashed:', error);
  process.exit(1);
});
