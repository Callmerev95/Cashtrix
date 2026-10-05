/**
 * Audio transcription prompt (AI6, issue #95).
 *
 * Pure (no Deno globals) so Jest can import it as a seam. The model hears a
 * short Indonesian utterance (max 15 seconds) and returns the frozen AI1
 * prefill JSON in ONE call — no intermediate transcript, no second pass.
 * Category/wallet names below are injected server-side from `user_id`
 * (system + custom minus archived minus mutes; active wallets only), so the
 * client never ships context.
 */

export type TranscribePromptCategory = {
  name: string;
  kind: 'income' | 'expense';
};

export function buildTranscribePrompt(input: {
  categories: TranscribePromptCategory[];
  wallets: string[];
  timezone: string;
}): string {
  const expense = input.categories
    .filter((c) => c.kind === 'expense')
    .map((c) => c.name);
  const income = input.categories
    .filter((c) => c.kind === 'income')
    .map((c) => c.name);
  const lines = [
    'Dengarkan rekaman suara Bahasa Indonesia (maks 15 detik) dan kembalikan SATU objek JSON prefill transaksi.',
    'Aturan nominal: "tiga puluh ribu" = 30000; "goceng" = 5000; "1,5 juta" = 1500000; "30rb" = 30000.',
    'Satu ucapan satu transaksi. Bila terdengar dua nominal berbeda, pilih yang disebut TERAKHIR sebagai amount dan abaikan sisanya (split ditangani klien, bukan di sini).',
    'kind = "expense" kecuali terdengar kata pemasukan (gaji, gajian, dapat, masuk, terima) maka "income".',
    'Ucapan transfer (dua dompet / kata "transfer"/"pindah") BUKAN error di sini: catat sebagai expense dengan note apa adanya; penolakan transfer ditangani klien.',
    `walletHint: cocokkan dengan salah satu [${input.wallets.join(', ')}] (case-insensitive); bila tidak cocok, null.`,
    `categoryHint: analisis makna barang/aktivitas yang terdengar lalu cocokkan HANYA dengan daftar kategori resmi berikut (string tepat sama secara karakter). Contoh: soto/nasi goreng/bakso/kopi = Makanan; bensin/parkir/gojek = Transportasi. Ragu atau tidak ada yang cocok = null. Jangan pernah mengarang string baru di luar daftar (mis. "nasi goreng" sebagai categoryHint DITOLAK — pakai "Makanan").`,
    `Kategori expense =[${expense.join(', ')}]; income =[${income.join(', ')}].`,
    'note: apa yang dibeli/didapat, maks 200 karakter, tanpa nominal.',
    `occurred_on: tanggal yang TERDENGAR saja format YYYY-MM-DD (zona ${input.timezone}); bila tak terdengar, null.`,
    'Contoh: "nasi padang tiga puluh ribu pakai gopay" -> {"amount":30000,"kind":"expense","walletHint":"GoPay","categoryHint":"Makanan","note":"nasi padang","occurred_on":null}.',
  ];
  return lines.join('\n');
}
