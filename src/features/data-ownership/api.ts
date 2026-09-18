/**
 * Data ownership data access (T9 / #10, PRD §2.3 Epic F).
 *
 * Thin wrappers over the two Edge Functions — the T8 Profile UI wires these
 * directly (no integration done here on purpose; ownership stays with T8):
 *
 *  - `exportCsv()` → invoke `export-csv`, returns the raw CSV string
 *    (`date,type,category,wallet,amount,currency,note`, `occurred_at` desc,
 *    soft-deleted excluded). The caller shares it via the share sheet.
 *  - `deleteAccount()` → invoke `delete-account` (service role: removes the
 *    caller's rows + avatar + Auth user, irreversible), then purges local data
 *    so no trace survives on-device. The "HAPUS" confirmation MUST be checked
 *    by the UI via `isDeleteConfirmation()` BEFORE calling this.
 *
 * Service role key lives ONLY in the Edge Functions (`Deno.env`) — this file
 * uses the anon client and the caller's JWT, same as `runSeedUser()`.
 */
import { supabase, purgeLocalUserData } from '@/supabase';

export { isDeleteConfirmation, DELETE_CONFIRMATION_WORD } from './domain';

/**
 * Fetch the caller's full transaction history as a CSV string.
 * Throws on network/function error. Empty history → header only.
 */
export async function exportCsv(): Promise<string> {
  const { data, error } = await supabase.functions.invoke('export-csv', {
    method: 'POST',
  });

  if (error) throw error;
  // The function answers `text/csv`, which supabase-js delivers as text.
  return typeof data === 'string' ? data : String(data ?? '');
}

export type DeleteAccountResult = {
  deleted: boolean;
  avatarDeleted: boolean;
  removed: Record<string, number>;
};

/**
 * Permanently delete the caller's account and all its data. IRREVERSIBLE.
 * The UI must gate this behind `isDeleteConfirmation()` — this function does
 * not ask twice. Local data is purged afterwards (same order as sign-out:
 * server first, so a failed delete never strands the user signed out).
 */
export async function deleteAccount(): Promise<DeleteAccountResult> {
  const { data, error } = await supabase.functions.invoke('delete-account', {
    method: 'POST',
  });

  if (error) throw error;
  await purgeLocalUserData();
  return data as DeleteAccountResult;
}
