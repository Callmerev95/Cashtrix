/**
 * Golden voice fixtures (AI2, issue #91): 20 ucapan.
 *
 * Tiap kasus = teks dikte + `modelJson` (output model yang direkam dari run
 * live hijau `verify-ai-voice.mjs`, bukan karangan) + ekspektasi kontrak
 * beku #90. Jest me-replay `modelJson` lewat validator asli tanpa secret,
 * jadi suite deterministik di CI. Dua kasus liar (v17/v18) sengaja membawa
 * `categoryHint` di luar allow-list untuk membuktikan degradasi ke null.
 */
export type GoldenVoiceCase = {
  id: string;
  text: string;
  modelJson: string;
  expected: {
    amount: number;
    kind: 'income' | 'expense';
    categoryHint: string | null;
  };
};

export const GOLDEN_VOICE_CASES: GoldenVoiceCase[] = [
  {
    id: 'v01',
    text: 'kopi goceng',
    modelJson:
      '{"amount":5000,"kind":"expense","walletHint":null,"categoryHint":"Makanan","note":"kopi goceng","occurred_on":null}',
    expected: { amount: 5000, kind: 'expense', categoryHint: 'Makanan' },
  },
  {
    id: 'v02',
    text: 'soto mie 30 ribu pakai cash',
    modelJson:
      '{"amount":30000,"kind":"expense","walletHint":"Cash","categoryHint":"Makanan","note":"soto mie 30 ribu pakai cash","occurred_on":null}',
    expected: { amount: 30000, kind: 'expense', categoryHint: 'Makanan' },
  },
  {
    id: 'v03',
    text: 'pakai cash 30 ribu soto mie',
    modelJson:
      '{"amount":30000,"kind":"expense","walletHint":"Cash","categoryHint":"Makanan","note":"pakai cash 30 ribu soto mie","occurred_on":null}',
    expected: { amount: 30000, kind: 'expense', categoryHint: 'Makanan' },
  },
  {
    id: 'v04',
    text: 'gajian 1,5 juta masuk bank',
    modelJson:
      '{"amount":1500000,"kind":"income","walletHint":"Bank","categoryHint":"Gaji","note":"gajian 1,5 juta masuk bank","occurred_on":null}',
    expected: { amount: 1500000, kind: 'income', categoryHint: 'Gaji' },
  },
  {
    id: 'v05',
    text: 'dapat bonus 2.5 jt ke bank',
    modelJson:
      '{"amount":2500000,"kind":"income","walletHint":"Bank","categoryHint":"Bonus","note":"dapat bonus 2.5 jt ke bank","occurred_on":null}',
    expected: { amount: 2500000, kind: 'income', categoryHint: 'Bonus' },
  },
  {
    id: 'v06',
    text: 'americano 15rb',
    modelJson:
      '{"amount":15000,"kind":"expense","walletHint":null,"categoryHint":"Makanan","note":"americano 15rb","occurred_on":null}',
    expected: { amount: 15000, kind: 'expense', categoryHint: 'Makanan' },
  },
  {
    id: 'v07',
    text: 'bensin 50 ribu cash',
    modelJson:
      '{"amount":50000,"kind":"expense","walletHint":"Cash","categoryHint":"Transportasi","note":"bensin 50 ribu cash","occurred_on":null}',
    expected: { amount: 50000, kind: 'expense', categoryHint: 'Transportasi' },
  },
  {
    id: 'v08',
    text: 'bayar listrik 250rb via bank',
    modelJson:
      '{"amount":250000,"kind":"expense","walletHint":"Bank","categoryHint":"Tagihan","note":"bayar listrik 250rb via bank","occurred_on":null}',
    expected: { amount: 250000, kind: 'expense', categoryHint: 'Tagihan' },
  },
  {
    id: 'v09',
    text: 'nonton bioskop 75 ribu',
    modelJson:
      '{"amount":75000,"kind":"expense","walletHint":null,"categoryHint":"Hiburan","note":"nonton bioskop 75 ribu","occurred_on":null}',
    expected: { amount: 75000, kind: 'expense', categoryHint: 'Hiburan' },
  },
  {
    id: 'v10',
    text: 'beli obat apotek 120 ribu cash',
    modelJson:
      '{"amount":120000,"kind":"expense","walletHint":"Cash","categoryHint":"Kesehatan","note":"beli obat apotek 120 ribu cash","occurred_on":null}',
    expected: { amount: 120000, kind: 'expense', categoryHint: 'Kesehatan' },
  },
  {
    id: 'v11',
    text: 'belanja indomaret 85.500 pakai cash',
    modelJson:
      '{"amount":85500,"kind":"expense","walletHint":"Cash","categoryHint":"Belanja","note":"belanja indomaret 85.500 pakai cash","occurred_on":null}',
    expected: { amount: 85500, kind: 'expense', categoryHint: 'Belanja' },
  },
  {
    id: 'v12',
    text: 'kopi susu tetangga 25rb',
    modelJson:
      '{"amount":25000,"kind":"expense","walletHint":null,"categoryHint":"Kopi Susu Tetangga","note":"kopi susu tetangga 25rb","occurred_on":null}',
    expected: {
      amount: 25000,
      kind: 'expense',
      categoryHint: 'Kopi Susu Tetangga',
    },
  },
  {
    id: 'v13',
    text: 'kirim 100 ribu ke bank',
    modelJson:
      '{"amount":100000,"kind":"expense","walletHint":"Bank","categoryHint":null,"note":"kirim 100 ribu ke bank","occurred_on":null}',
    expected: { amount: 100000, kind: 'expense', categoryHint: null },
  },
  {
    id: 'v14',
    text: 'tf 50rb dari cash ke bank',
    modelJson:
      '{"amount":50000,"kind":"expense","walletHint":"Cash","categoryHint":null,"note":"tf 50rb dari cash ke bank","occurred_on":null}',
    expected: { amount: 50000, kind: 'expense', categoryHint: null },
  },
  {
    id: 'v15',
    text: 'kopi 20rb 12 sep 2026',
    modelJson:
      '{"amount":20000,"kind":"expense","walletHint":null,"categoryHint":"Makanan","note":"kopi 20rb 12 sep 2026","occurred_on":"2026-09-12"}',
    expected: { amount: 20000, kind: 'expense', categoryHint: 'Makanan' },
  },
  {
    id: 'v16',
    text: 'gajian 5 juta 1 januari 2026 masuk bank',
    modelJson:
      '{"amount":5000000,"kind":"income","walletHint":"Bank","categoryHint":"Gaji","note":"gajian 5 juta 1 januari 2026 masuk bank","occurred_on":"2026-01-01"}',
    expected: { amount: 5000000, kind: 'income', categoryHint: 'Gaji' },
  },
  {
    id: 'v17',
    text: 'bayar kripto elon 25 ribu tunai',
    modelJson:
      '{"amount":25000,"kind":"expense","walletHint":null,"categoryHint":"Kripto Elon","note":"bayar kripto elon 25 ribu tunai","occurred_on":null}',
    expected: { amount: 25000, kind: 'expense', categoryHint: null },
  },
  {
    id: 'v18',
    text: 'bayar nft 100rb',
    modelJson:
      '{"amount":100000,"kind":"expense","walletHint":null,"categoryHint":"NFT Coin","note":"bayar nft 100rb","occurred_on":null}',
    expected: { amount: 100000, kind: 'expense', categoryHint: null },
  },
  {
    id: 'v19',
    text: 'ceban parkir',
    modelJson:
      '{"amount":10000,"kind":"expense","walletHint":null,"categoryHint":"Transportasi","note":"ceban parkir","occurred_on":null}',
    expected: { amount: 10000, kind: 'expense', categoryHint: 'Transportasi' },
  },
  {
    id: 'v20',
    text: 'gope jajan pasar',
    modelJson:
      '{"amount":500,"kind":"expense","walletHint":null,"categoryHint":"Makanan","note":"gope jajan pasar","occurred_on":null}',
    expected: { amount: 500, kind: 'expense', categoryHint: 'Makanan' },
  },
];
