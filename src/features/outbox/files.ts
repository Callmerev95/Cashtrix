/**
 * Local receipt photos for queued saves (OB1, issue #74).
 *
 * Offline captures can never reach the `receipts` bucket, so the resized
 * JPEG is copied into the app's document directory under the owner's id.
 * OB2 uploads it on flush; until then the file is the save's proof and must
 * survive a restart. The 7-day sweep only removes files no queue row
 * references (a crash between write and enqueue).
 */
import { Directory, File, Paths } from 'expo-file-system';

import { OUTBOX_PHOTO_TTL_MS } from './domain';

function photoDirectory(userId: string): Directory {
  return new Directory(Paths.document, 'outbox', userId);
}

/** Writes the resized bytes; returns the `file://` URI stored in the payload. */
export function persistOutboxPhoto(input: {
  userId: string;
  id: string;
  bytes: Uint8Array;
}): string {
  const directory = photoDirectory(input.userId);
  directory.create({ intermediates: true, idempotent: true });
  const file = new File(directory, `${input.id}.jpg`);
  file.create({ intermediates: true, overwrite: true });
  file.write(input.bytes);
  return file.uri;
}

export function deleteOutboxPhoto(uri: string): void {
  try {
    const file = new File(uri);
    if (file.exists) file.delete();
  } catch {
    // A missing/unreadable file is already effectively gone; the sweep is
    // the backstop for anything this call cannot reach.
  }
}

export function sweepOrphanOutboxPhotos(input: {
  userId: string;
  referencedPaths: string[];
  now?: number;
}): number {
  const directory = photoDirectory(input.userId);
  if (!directory.exists) return 0;

  const referenced = new Set(input.referencedPaths);
  const cutoff = (input.now ?? Date.now()) - OUTBOX_PHOTO_TTL_MS;
  let removed = 0;

  for (const item of directory.list()) {
    if (!(item instanceof File) || referenced.has(item.uri)) continue;
    try {
      const modified = item.info().modificationTime ?? 0;
      if (modified > cutoff) continue;
      item.delete();
      removed += 1;
    } catch {
      // Per-file tolerant: one unreadable file never blocks the sweep.
    }
  }

  return removed;
}
