/**
 * Scan prompt builder (AI3, issue #92).
 *
 * Pure (no Deno globals) so Jest can import it as a seam, the same pattern
 * as `parse-voice/prompt.ts` and `scan-receipt/parse.ts`. The Edge Function
 * injects the caller's own context server-side: visible expense categories
 * (12 system plus custom, minus mutes) and `profiles.timezone`. The client
 * only ever sends `storage_path`; the image bytes never leave the server
 * except as the model request payload (PRD 4.4: never into logs).
 *
 * Scan is expense-only (the form auto-scans expense photos; income/transfer
 * stay manual), so the category list holds expense names and the contract
 * has no kind field. The model must answer with strict JSON only. Anything
 * outside the injected name list resolves to null in `validate.ts`: the
 * model is told the same rule so it does not invent categories.
 */

/** One expense category name the prompt may reference. */
export type ScanPromptCategory = {
  name: string;
};

/** Context the Edge Function injects for one request. */
export type ScanPromptContext = {
  /** Visible expense categories: system plus the user's custom rows. */
  categories: ScanPromptCategory[];
  /** IANA timezone from `profiles.timezone` (default Asia/Jakarta). */
  timezone: string;
};

/**
 * Builds the Gemini vision prompt for one receipt image. Framed as a system
 * instruction plus the caller's context (Dynamic Context Injection, AI1):
 * the model does the reading (OCR) and the semantic step (which total line,
 * which merchant, which category meaning) in one call, but may only emit a
 * category name from the injected list — `validate.ts` enforces that with
 * strict inclusion (Post-Validator Rigidity), so a wild string degrades to
 * null and never reaches the donut chart.
 *
 * Convention (locked, same as AI1): semantic examples may use free words,
 * but every named result MUST be an exact seed string (`Makanan`, never
 * `Makanan & Minuman` — a label outside the list would be nulled and the
 * suggestion lost).
 */
export function buildScanPrompt(ctx: ScanPromptContext): string {
  const categories =
    ctx.categories.map((c) => `- ${c.name}`).join('\n') ||
    '- (tidak ada kategori)';
  return [
    '[SYSTEM INSTRUCTION]',
    'Kamu mesin ekstraksi data struk untuk Cashtrix. Baca gambar struk lalu jawab HANYA dengan satu objek JSON, tanpa markdown, tanpa penjelasan.',
    '',
    'Skema (beku):',
    '{"amount": int rupiah > 0, "occurred_on": "YYYY-MM-DD" | null, "merchant": string max 200 | null, "categoryHint": string | null}',
    '',
    'Aturan:',
    '1. amount = SATU total yang harus dibayar (bilangan bulat rupiah). Baris TOTAL/GRAND/JUMLAH/TAGIHAN menang; abaikan TUNAI/cash, KEMBALI/change, PPN/pajak, service, subtotal, diskon bila total akhir ada. Tanpa baris total = angka terbesar yang tampak seperti total. "30.000", "30 ribu", "25rb", "Rp30.000" = 30000.',
    '2. occurred_on = tanggal yang tercetak di struk dalam zona waktu pengguna, format YYYY-MM-DD, else null.',
    '3. merchant = nama toko di kop struk (baris isi pertama), max 200 karakter, else null.',
    '4. categoryHint: analisis makna merchant/item lalu cocokkan HANYA dengan daftar kategori resmi berikut (string tepat sama secara karakter). Contoh: starbucks/americano/bakso/soto = Makanan; alfamart/indomaret/toko = Belanja; bensin/parkir = Transportasi. Ragu atau tidak ada yang cocok = null. Jangan pernah mengarang string baru di luar daftar.',
    '',
    `Zona waktu pengguna: ${ctx.timezone}`,
    '',
    'Kategori resmi yang boleh dipakai:',
    categories,
  ].join('\n');
}
