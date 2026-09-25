/**
 * Receipt data access (S2, ADR-0009).
 *
 * Opsi A: a photo is uploaded the moment it is taken — a row with
 * `transaction_id NULL` (a legal pre-save state) — then linked to the
 * transaction when the save commits. Reads/writes go through
 * `transaction_receipts` with RLS as the guard; objects live in the private
 * `receipts` bucket under `{userId}/{receiptId}.jpg`.
 *
 * Deletion discipline (verified against hosted `storage.protect_delete`,
 * 2026-09-25): a direct SQL DELETE on `storage.objects` is rejected AND
 * would orphan the backend file — objects are only ever removed through the
 * Storage API. So every removal is object-first, row-second: a failed object
 * removal keeps a repairable row (the 30-day sweep retries it), never a
 * permanently orphaned object.
 */
import { File } from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

import {
  receiptExpiryCutoff,
  receiptStoragePath,
  validateReceiptFile,
} from '@/features/transactions';
import type { Language } from '@/i18n/locale';
import { supabase } from '@/supabase';

export type ReceiptAttachment = {
  id: string;
  storagePath: string;
  /** Local preview right after capture, signed URL once re-listed. */
  previewUrl: string;
  createdAt: string;
};

type ReceiptRow = {
  id: string;
  storage_path: string;
  created_at: string;
};

function toAttachment(row: ReceiptRow, previewUrl: string): ReceiptAttachment {
  return {
    id: row.id,
    storagePath: row.storage_path,
    previewUrl,
    createdAt: row.created_at,
  };
}

/**
 * UUID per receipt (storage path + row id share it, so orphans stay
 * traceable). Same guard as `newIdempotencyKey`: Hermes-safe fallback.
 */
function newReceiptId(): string {
  const cryptoApi = (
    globalThis as { crypto?: { randomUUID?: () => string } }
  ).crypto;
  if (typeof cryptoApi?.randomUUID === 'function') {
    return cryptoApi.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/** Display URL for a stored receipt (bucket is private, pola avatar T8). */
export async function getReceiptSignedUrl(
  path: string,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from('receipts')
    .createSignedUrl(path, 7 * 24 * 3600);
  if (error) throw error;
  return data.signedUrl;
}

/**
 * Resizes (readable struk, still small), uploads, and inserts the pre-save
 * row (`transaction_id NULL`). Returns the attachment for the form's local
 * state. Throws when the resized file still exceeds the 2MB bucket cap.
 */
export async function uploadReceiptPhoto(input: {
  userId: string;
  sourceUri: string;
  /** MIME from the picker asset, or null when unknown (then only size gates). */
  mime: string | null;
  lang?: Language;
}): Promise<ReceiptAttachment> {
  const lang = input.lang ?? 'id';
  const receiptId = newReceiptId();
  const path = receiptStoragePath(input.userId, receiptId);

  // Receipts stay legible (unlike the 512px avatar square): cap the long
  // edge at 1600px, keep aspect, JPEG.
  const rendered = await manipulateAsync(
    input.sourceUri,
    [{ resize: { width: 1600 } }],
    { compress: 0.8, format: SaveFormat.JPEG },
  );

  // Native file read — never `fetch(file://)` (pelajaran avatar T8: React
  // Native fetch only speaks http(s), producing a silent empty body).
  const buffer = await new File(rendered.uri).arrayBuffer();
  const checked = validateReceiptFile(
    { bytes: buffer.byteLength, mime: input.mime },
    lang,
  );
  if (!checked.ok) throw new Error(checked.error);

  const { error: uploadError } = await supabase.storage
    .from('receipts')
    .upload(path, buffer, { contentType: 'image/jpeg' });
  if (uploadError) throw uploadError;

  const { data, error: rowError } = await supabase
    .from('transaction_receipts')
    .insert({
      id: receiptId,
      user_id: input.userId,
      transaction_id: null,
      storage_path: path,
    })
    .select('id, storage_path, created_at')
    .single();
  if (rowError || !data) {
    // Row failed after the object landed: pull the object back out so a
    // failed capture never leaves an orphan only the 30-day sweep would
    // eventually miss (the row is gone, so the sweep cannot see it).
    await supabase.storage.from('receipts').remove([path]);
    throw rowError ?? new Error('Gagal menyimpan lampiran');
  }
  const row = data as ReceiptRow;
  return toAttachment(row, rendered.uri);
}

/**
 * Links pre-save attachments to the committed transaction (the save path
 * calls this fire-and-forget, Opsi B). Returns the linked count — rows
 * owned by someone else are invisible to RLS and simply not counted.
 */
export async function linkReceiptsToTransaction(input: {
  userId: string;
  receiptIds: string[];
  transactionId: string;
}): Promise<number> {
  if (input.receiptIds.length === 0) return 0;
  const { data, error } = await supabase
    .from('transaction_receipts')
    .update({ transaction_id: input.transactionId })
    .in('id', input.receiptIds)
    .eq('user_id', input.userId)
    .select('id');
  if (error) throw error;
  return data?.length ?? 0;
}

/** Attachments of one transaction, newest first (edit-form thumbnails). */
export async function listReceiptsForTransaction(input: {
  userId: string;
  transactionId: string;
}): Promise<ReceiptAttachment[]> {
  const { data, error } = await supabase
    .from('transaction_receipts')
    .select('id, storage_path, created_at')
    .eq('user_id', input.userId)
    .eq('transaction_id', input.transactionId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const rows = (data ?? []) as ReceiptRow[];
  return Promise.all(
    rows.map(async (row) =>
      toAttachment(row, await getReceiptSignedUrl(row.storage_path)),
    ),
  );
}

/**
 * Removes one attachment (pre-save cancel): object first, row second (see
 * module header). The row-delete error is thrown so the form can surface it;
 * an object-removal failure is swallowed — the row survives and the sweep
 * retries it at expiry.
 */
export async function deleteReceiptAttachment(input: {
  userId: string;
  id: string;
  storagePath: string;
}): Promise<void> {
  await supabase.storage.from('receipts').remove([input.storagePath]);
  const { error } = await supabase
    .from('transaction_receipts')
    .delete()
    .eq('id', input.id)
    .eq('user_id', input.userId);
  if (error) throw error;
}

/**
 * Foreground expiry sweep (called on app open + foreground, next to
 * `runCatchUp`): lists the caller's rows past retention, removes their
 * objects via the Storage API, then deletes the rows. Per-row tolerant —
 * a dead path never blocks its row's deletion.
 *
 * Best-effort by contract: the caller swallows all failures (a sweep must
 * never block app open) and the `pg_cron` row-backstop covers dormant users.
 */
export async function sweepExpiredReceipts(input: {
  userId: string;
  now?: Date;
}): Promise<number> {
  const cutoff = receiptExpiryCutoff(input.now).toISOString();
  const { data, error } = await supabase
    .from('transaction_receipts')
    .select('id, storage_path, created_at')
    .eq('user_id', input.userId)
    .lt('created_at', cutoff);
  if (error) throw error;
  const rows = (data ?? []) as ReceiptRow[];
  if (rows.length === 0) return 0;

  const removed: string[] = [];
  for (const row of rows) {
    // Object failure is swallowed per row: the row is still deleted below
    // so one dead path cannot pin the whole sweep (and a surviving object
    // without its row is an unguessable uuid path, cleaned manually if ever).
    await supabase.storage.from('receipts').remove([row.storage_path]);
    removed.push(row.id);
  }

  const { error: deleteError } = await supabase
    .from('transaction_receipts')
    .delete()
    .in('id', removed)
    .eq('user_id', input.userId);
  if (deleteError) throw deleteError;
  return removed.length;
}
