/**
 * Profile data access — account-level CRUD with RLS as the guard.
 *
 * Reads/writes hit `profiles`, `categories`, and `category_mutes` (T8
 * migration) directly; there is no aggregation here, so no view is needed.
 * Two archive sources merge client-side (see `domain.ts`): custom categories
 * use `archived_at`, shared system categories use per-user `category_mutes`
 * because RLS makes a cross-user `UPDATE` on a system row a no-op.
 *
 * Avatar pipeline (AC #9): pick → resize to 512×512 JPEG → upload to the
 * private `avatars` bucket at `{userId}/avatar.jpg` (upsert) → store the path
 * in `profiles.avatar_url`. The bucket stays private; display goes through a
 * signed URL minted on read.
 */
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import { supabase } from '@/supabase';

import {
  AVATAR_MAX_BYTES,
  AVATAR_SIZE_PX,
  isCategoryKind,
  type CategoryKind,
  type CurrencyCode,
  type ManagedCategory,
} from './domain';

export type Profile = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  currencyCode: CurrencyCode;
  timezone: string;
  locale: string;
};

type ProfileRow = {
  id: string;
  display_name: string;
  avatar_url: string | null;
  currency_code: string;
  timezone: string;
  locale: string;
};

function toProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    displayName: row.display_name,
    avatarUrl: row.avatar_url,
    currencyCode: (row.currency_code ?? 'IDR') as CurrencyCode,
    timezone: row.timezone ?? 'Asia/Jakarta',
    locale: row.locale ?? 'id-ID',
  };
}

/** The signed-in user's profile row (created by `handle_new_user`). */
export async function getProfile(): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, display_name, avatar_url, currency_code, timezone, locale')
    .maybeSingle();

  if (error) throw error;
  return data ? toProfile(data as ProfileRow) : null;
}

/** Updates name / currency / avatar path. Validation lives in `domain.ts`. */
export async function updateProfile(input: {
  displayName?: string;
  currencyCode?: CurrencyCode;
  avatarUrl?: string | null;
}): Promise<void> {
  const patch: Record<string, string | null> = {};
  if (input.displayName !== undefined) {
    patch.display_name = input.displayName.trim();
  }
  if (input.currencyCode !== undefined) {
    patch.currency_code = input.currencyCode;
  }
  if (input.avatarUrl !== undefined) {
    patch.avatar_url = input.avatarUrl;
  }
  if (Object.keys(patch).length === 0) return;

  // PostgREST refuses an UPDATE without a WHERE clause even when RLS already
  // scopes the statement to the caller — so scope explicitly to the session
  // user (RLS still guards it server-side).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Sesi tidak ditemukan');

  const { error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', user.id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Categories (managed view: system + custom, both archive sources merged)
// ---------------------------------------------------------------------------

type CategoryRow = {
  id: string;
  name: string;
  icon: string;
  kind: string;
  is_system: boolean;
  archived_at: string | null;
};

/**
 * Every category visible to the caller (system + own, including archived and
 * muted) with both archive flags resolved — the manage screen needs the full
 * picture, while pickers filter through `visibleCategories`.
 */
export async function listManagedCategories(): Promise<ManagedCategory[]> {
  const [categories, mutes] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, icon, kind, is_system, archived_at')
      .order('name', { ascending: true }),
    supabase.from('category_mutes').select('category_id'),
  ]);

  if (categories.error) throw categories.error;
  if (mutes.error) throw mutes.error;

  const mutedIds = new Set(
    ((mutes.data ?? []) as { category_id: string }[]).map(
      (row) => row.category_id,
    ),
  );

  return ((categories.data ?? []) as CategoryRow[])
    .filter((row) => isCategoryKind(row.kind))
    .map((row) => ({
      id: row.id,
      name: row.name,
      icon: row.icon,
      kind: row.kind as CategoryKind,
      isSystem: row.is_system,
      archived: row.archived_at !== null,
      muted: mutedIds.has(row.id),
    }));
}

export async function createCategory(input: {
  userId: string;
  name: string;
  icon: string;
  kind: CategoryKind;
}): Promise<string> {
  const { data, error } = await supabase
    .from('categories')
    .insert({
      user_id: input.userId,
      name: input.name.trim(),
      icon: input.icon,
      kind: input.kind,
      is_system: false,
    })
    .select('id')
    .single();

  if (error) throw error;
  return (data as { id: string }).id;
}

/** Renames / re-icons a custom category. Kind is locked after creation. */
export async function updateCategory(input: {
  id: string;
  name: string;
  icon: string;
}): Promise<void> {
  const { error } = await supabase
    .from('categories')
    .update({ name: input.name.trim(), icon: input.icon })
    .eq('id', input.id);

  if (error) throw error;
}

/**
 * Archives a category. Custom rows flip `archived_at`; system rows insert a
 * per-user mute (the shared row must stay untouched — RLS would no-op the
 * update anyway). Idempotent both ways.
 */
export async function archiveCategory(input: {
  userId: string;
  id: string;
  isSystem: boolean;
}): Promise<void> {
  if (input.isSystem) {
    const { error } = await supabase.from('category_mutes').upsert(
      { user_id: input.userId, category_id: input.id },
      { onConflict: 'user_id,category_id', ignoreDuplicates: true },
    );
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('categories')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', input.id);
  if (error) throw error;
}

/** Reverses `archiveCategory` along the same per-kind path. */
export async function unarchiveCategory(input: {
  userId: string;
  id: string;
  isSystem: boolean;
}): Promise<void> {
  if (input.isSystem) {
    const { error } = await supabase
      .from('category_mutes')
      .delete()
      .eq('user_id', input.userId)
      .eq('category_id', input.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('categories')
    .update({ archived_at: null })
    .eq('id', input.id);
  if (error) throw error;
}

/**
 * Permanently deletes a *custom* category. System rows are refused here
 * (defence in depth — RLS would no-op the delete too). The FK from
 * `transactions` is `ON DELETE RESTRICT`, so a category with history throws
 * `23503`: callers must offer archiving instead.
 */
export async function deleteCategory(input: {
  id: string;
  isSystem: boolean;
}): Promise<void> {
  if (input.isSystem) {
    throw new Error('Kategori bawaan tidak bisa dihapus, hanya diarsipkan');
  }
  const { error } = await supabase.from('categories').delete().eq('id', input.id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Avatar (private bucket, signed-URL display)
// ---------------------------------------------------------------------------

function avatarPath(userId: string): string {
  return `${userId}/avatar.jpg`;
}

/**
 * Resizes to 512×512 JPEG and uploads (upsert) to the caller's private
 * prefix. Returns the storage path to persist via `updateProfile`. Throws
 * when the resized file still exceeds the 2MB bucket cap.
 */
export async function uploadAvatar(input: {
  userId: string;
  sourceUri: string;
}): Promise<string> {
  const rendered = await manipulateAsync(
    input.sourceUri,
    [{ resize: { width: AVATAR_SIZE_PX, height: AVATAR_SIZE_PX } }],
    { compress: 0.85, format: SaveFormat.JPEG },
  );

  const response = await fetch(rendered.uri);
  const buffer = await response.arrayBuffer();
  if (byteLength(buffer) > AVATAR_MAX_BYTES) {
    throw new Error('Avatar maksimal 2MB');
  }

  const { error } = await supabase.storage
    .from('avatars')
    .upload(avatarPath(input.userId), buffer, {
      contentType: 'image/jpeg',
      upsert: true,
    });
  if (error) throw error;
  return avatarPath(input.userId);
}

/** Display URL for the stored avatar path (bucket is private). */
export async function getAvatarSignedUrl(
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage
    .from('avatars')
    .createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

function byteLength(buffer: ArrayBuffer): number {
  return buffer.byteLength;
}
