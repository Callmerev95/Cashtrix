/**
 * Voice prompt builder (AI1, issue #90).
 *
 * Pure (no Deno globals) so Jest can import it as a seam, the same pattern
 * as `supabase/functions/_shared/rate-limit.ts` and `scan-receipt/parse.ts`.
 * The Edge Function injects the caller's own context server-side: system
 * categories (12 seed rows) plus the user's custom categories, the user's
 * active wallets, and `profiles.timezone`. The client never sends context,
 * only the dictated text.
 *
 * The model must answer with strict JSON only. Anything outside the injected
 * name lists resolves to null client-side (see `validate.ts`): the model is
 * told the same rule so it does not invent categories.
 */

/** One category row the prompt may reference (system or custom). */
export type PromptCategory = {
  name: string;
  kind: 'expense' | 'income';
};

/** Context the Edge Function injects for one request. */
export type ParseVoiceContext = {
  /** Raw dictated text (already length-capped by the caller). */
  text: string;
  /** Visible categories: 12 system plus the user's custom rows. */
  categories: PromptCategory[];
  /** Active wallet names (archived excluded by the caller). */
  wallets: string[];
  /** IANA timezone from `profiles.timezone` (default Asia/Jakarta). */
  timezone: string;
};

export const PARSE_VOICE_MAX_TEXT_LENGTH = 500;

/**
 * Builds the Gemini prompt for one utterance. Framed as a system instruction
 * plus the caller's context (Dynamic Context Injection, AI1): the model does
 * semantic reasoning over free text ("americano" is food) but may only emit
 * names from the injected lists — `validate.ts` enforces that with strict
 * inclusion (Post-Validator Rigidity), so a wild string degrades to null
 * and never reaches the donut chart.
 *
 * Convention (locked): semantic examples may use free words, but every
 * named result MUST be an exact seed string (`Makanan`, never
 * `Makanan & Minuman` — a label outside the list would be nulled and the
 * prefill lost).
 */
export function buildParseVoicePrompt(ctx: ParseVoiceContext): string {
  const text = ctx.text.trim().slice(0, PARSE_VOICE_MAX_TEXT_LENGTH);
  const categories =
    ctx.categories
      .map((c) => `- ${c.name} (${c.kind})`)
      .join('\n') || '- (tidak ada kategori)';
  const wallets =
    ctx.wallets.map((w) => `- ${w}`).join('\n') || '- (tidak ada dompet)';
  return [
    '[SYSTEM INSTRUCTION]',
    'Kamu mesin ekstraksi data transaksi untuk Cashtrix. Jawab HANYA dengan satu objek JSON, tanpa markdown, tanpa penjelasan.',
    '',
    'Skema (beku):',
    '{"amount": int rupiah > 0, "kind": "income" | "expense", "walletHint": string | null, "categoryHint": string | null, "note": string max 200, "occurred_on": "YYYY-MM-DD" | null}',
    '',
    'Aturan:',
    '1. amount bilangan bulat rupiah. "30.000", "30 ribu", "25rb", "Rp30.000" = 30000.',
    '2. Slang: cepek=100, gope=500, ceban=10000, goceng=5000, goban=50000, juta/jt=x1000000 ("1,5 juta"=1500000, "2.5 jt"=2500000).',
    '3. kind default expense; income hanya bila ada kata terima uang (gaji, dapat, masuk, terima, bonus). Transfer (kirim, tf, pindah dana) tetap expense dengan note apa adanya, bukan kind baru.',
    '4. walletHint = SATU nama dari daftar dompet yang disebut teks, else null. Jangan mengarang.',
    '5. categoryHint: analisis makna item/aktivitas lalu cocokkan HANYA dengan daftar kategori resmi berikut (string tepat sama secara karakter). Contoh: americano/bakso/soto = Makanan; bensin/gojek/parkir = Transportasi. Ragu atau tidak ada yang cocok = null. Jangan pernah mengarang string baru di luar daftar.',
    '6. note = teks asli dipadatkan max 200 karakter (detail item masuk sini).',
    '7. occurred_on = tanggal yang disebut teks dalam zona waktu pengguna, format YYYY-MM-DD, else null. Tanpa tanggal = null.',
    '',
    `Zona waktu pengguna: ${ctx.timezone}`,
    '',
    'Kategori resmi yang boleh dipakai:',
    categories,
    '',
    'Dompet yang boleh dipakai:',
    wallets,
    '',
    'Teks ucapan:',
    text,
  ].join('\n');
}
