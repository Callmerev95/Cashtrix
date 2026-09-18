/**
 * CSV export sharing (T9 follow-up, issue #22).
 *
 * The CSV itself is generated server-side by the `export-csv` Edge Function
 * (PRD §2.3 AC F2) — this module only stages it as a cache file and opens
 * the share sheet. Both `expo-sharing` and `expo-file-system` are Expo Go
 * modules, so no dev-client rebuild is needed.
 */
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { exportCsv } from './api';

export type ShareOutcome = 'shared' | 'unavailable';

/**
 * Fetches the caller's CSV, writes it to the cache dir as
 * `cashtrix-export.csv`, and opens the share sheet. Returns `'unavailable'`
 * where sharing isn't supported (e.g. web). Throws on network, function, or
 * filesystem errors — the caller surfaces them.
 */
export async function exportAndShareTransactions(): Promise<ShareOutcome> {
  const csv = await exportCsv();
  const file = new File(Paths.cache, 'cashtrix-export.csv');
  await file.write(csv);

  if (!(await Sharing.isAvailableAsync())) {
    return 'unavailable';
  }
  await Sharing.shareAsync(file.uri, {
    dialogTitle: 'Bagikan data Cashtrix',
    mimeType: 'text/csv',
  });
  return 'shared';
}
