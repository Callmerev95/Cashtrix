/**
 * Data ownership domain — pure functions only (no bridge, no network).
 *
 * This is the Jest seam for T9 (Epic F "Data ownership", issue #10). The CSV
 * itself is generated server-side by the `export-csv` Edge Function (PRD §2.3
 * AC F2) — the client never assembles it. What lives here is the logic that
 * must be exact on both sides and is easy to get subtly wrong:
 *
 *  - RFC 4180 field escaping (`escapeCsvField`), mirrored in
 *    `supabase/functions/export-csv/index.ts` — Deno cannot import from `src/`,
 *    so the two copies are intentionally duplicated; keep them in sync.
 *  - the exact column order (`CSV_HEADER`): date,type,category,wallet,amount,
 *    currency,note (spec story 46).
 *  - the two-step delete gate: `isDeleteConfirmation` accepts only the exact
 *    word "HAPUS" (spec story 47). The check runs in the CLIENT/UI; the
 *    `delete-account` function only requires a valid JWT.
 */

/** Exact CSV column order (spec story 46). Server and tests pin this. */
export const CSV_HEADER = 'date,type,category,wallet,amount,currency,note';

/** The exact confirmation word for account deletion (spec story 47). */
export const DELETE_CONFIRMATION_WORD = 'HAPUS';

/**
 * RFC 4180 field escaping: quote the field when it contains a comma, quote,
 * or newline; double any quote inside. Mirrors `export-csv/index.ts`.
 */
export function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** A CSV data row in the exact `CSV_HEADER` column order. */
export type CsvRow = {
  date: string;
  type: string;
  category: string;
  wallet: string;
  amount: string;
  currency: string;
  note: string;
};

export function toCsvLine(row: CsvRow): string {
  return [
    row.date,
    row.type,
    row.category,
    row.wallet,
    row.amount,
    row.currency,
    row.note,
  ]
    .map(escapeCsvField)
    .join(',');
}

/** Assemble a full CSV document (header + rows) from data rows. */
export function buildCsv(rows: CsvRow[]): string {
  return [CSV_HEADER, ...rows.map(toCsvLine)].join('\n');
}

/**
 * Two-step delete gate (CLIENT/UI side, spec story 47): only the exact word
 * "HAPUS" — trimmed, case-sensitive — confirms. Anything else (empty,
 * "hapus", "HAPUS " with inner extra words, partial) rejects, so an
 * accidental tap can never fire `deleteAccount()`.
 */
export function isDeleteConfirmation(input: string): boolean {
  return input.trim() === DELETE_CONFIRMATION_WORD;
}
