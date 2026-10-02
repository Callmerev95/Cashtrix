/**
 * Golden receipt fixtures (AI2, issue #91): 20 teks struk.
 *
 * Tiap kasus = teks OCR mentah + ekspektasi parser murni `parseReceiptText`
 * (S3, deterministik, tanpa model tanpa secret). Cakupan: total bersih,
 * multi-item, diskon/PPN/service/subtotal, tender menempel (tunai/QRIS/
 * GOPAY), tanggal varian ID/EN, tanpa tanggal, dan buram OCR (r16: merchant
 * dan baris total rusak sebagian tapi nominal tetap tepat, hint null legal).
 */
export type GoldenReceiptCase = {
  id: string;
  ocrText: string;
  expected: {
    amount: number;
    categoryHint: string | null;
  };
};

export const GOLDEN_RECEIPT_CASES: GoldenReceiptCase[] = [
  {
    id: 'r01',
    ocrText: ['STARBUCKS', 'AMERICANO 30.000', 'TOTAL 30.000', '12/09/26'].join(
      '\n',
    ),
    expected: { amount: 30000, categoryHint: 'Makanan' },
  },
  {
    id: 'r02',
    ocrText: [
      'KOPI KENANGAN',
      'AMERICANO 30.000',
      'CROISSANT 25.000',
      'TOTAL 55.000',
      'TUNAI 100.000',
      'KEMBALI 45.000',
      '12-09-2026',
    ].join('\n'),
    expected: { amount: 55000, categoryHint: 'Makanan' },
  },
  {
    id: 'r03',
    ocrText: [
      'KOPI TUKU',
      'CROISSANT 25.000',
      'AMERICANO 30.000',
      'GRAND TOTAL 55.000',
    ].join('\n'),
    expected: { amount: 55000, categoryHint: 'Makanan' },
  },
  {
    id: 'r04',
    ocrText: ['KOPI TUKU', 'AMERICANO 30.000', 'CROISSANT 25.000'].join('\n'),
    expected: { amount: 30000, categoryHint: 'Makanan' },
  },
  {
    id: 'r05',
    ocrText: [
      'ALFAMART',
      'SUBTOTAL 100.000',
      'DISKON 10.000',
      'TOTAL 90.000',
    ].join('\n'),
    expected: { amount: 90000, categoryHint: 'Belanja' },
  },
  {
    id: 'r06',
    ocrText: ['KFC', 'SUBTOTAL 50.000', 'PPN 11% 5.500', 'TOTAL 55.500'].join(
      '\n',
    ),
    expected: { amount: 55500, categoryHint: null },
  },
  {
    id: 'r07',
    ocrText: [
      'WARUNG PADANG',
      'MAKAN 200.000',
      'SERVICE 5% 10.000',
      'TOTAL 210.000',
    ].join('\n'),
    expected: { amount: 210000, categoryHint: 'Makanan' },
  },
  {
    id: 'r08',
    ocrText: ['AYAM GEPREK', 'PAKET 42.000', 'TOTAL 42.000', 'QRIS 42.000'].join(
      '\n',
    ),
    expected: { amount: 42000, categoryHint: 'Makanan' },
  },
  {
    id: 'r09',
    ocrText: [
      'BAKSO PRESIDENT',
      'BAKSO 2X 17.500',
      'TAGIHAN 35.000',
      'GOPAY 35.000',
      '05 Okt 2025',
    ].join('\n'),
    expected: { amount: 35000, categoryHint: 'Makanan' },
  },
  {
    id: 'r10',
    ocrText: ['PARKIR STASIUN', 'PARKIR 2 JAM 10.000', 'TOTAL 10.000'].join(
      '\n',
    ),
    expected: { amount: 10000, categoryHint: 'Transportasi' },
  },
  {
    id: 'r11',
    ocrText: [
      'PERTAMINA',
      'BENSIN 10L 100.000',
      'TOTAL 100.000',
      '12.09.2026',
    ].join('\n'),
    expected: { amount: 100000, categoryHint: 'Transportasi' },
  },
  {
    id: 'r12',
    ocrText: ['APOTEK SEHAT', 'OBAT 120.000', 'TOTAL 120.000'].join('\n'),
    expected: { amount: 120000, categoryHint: 'Kesehatan' },
  },
  {
    id: 'r13',
    ocrText: ['XXI', 'TIKET 2X 75.000', 'TOTAL 150.000'].join('\n'),
    expected: { amount: 150000, categoryHint: 'Hiburan' },
  },
  {
    id: 'r14',
    ocrText: ['PLN', 'TOKEN 200.000', 'TAGIHAN 200.000', 'TUNAI 200.000'].join(
      '\n',
    ),
    expected: { amount: 200000, categoryHint: 'Tagihan' },
  },
  {
    id: 'r15',
    ocrText: ['INDOMARET', 'MIE 3X 15.000', 'TOTAL 45.000'].join('\n'),
    expected: { amount: 45000, categoryHint: 'Belanja' },
  },
  {
    id: 'r16',
    ocrText: ['ST*RBUCKS', 'AMERICANO 30.000', 'T0TAL 30.000'].join('\n'),
    expected: { amount: 30000, categoryHint: null },
  },
  {
    id: 'r17',
    ocrText: ['CAFE KOPI', 'LATTE 30,000', 'TOTAL 30,000'].join('\n'),
    expected: { amount: 30000, categoryHint: 'Makanan' },
  },
  {
    id: 'r18',
    ocrText: ['WARUNG KOPI', 'KOPI 2X Rp30rb', 'TOTAL Rp60.000'].join('\n'),
    expected: { amount: 60000, categoryHint: 'Makanan' },
  },
  {
    id: 'r19',
    ocrText: ['TOKO KELONTONG', 'SABUN 12.500', 'TOTAL 12.500'].join('\n'),
    expected: { amount: 12500, categoryHint: 'Belanja' },
  },
  {
    id: 'r20',
    ocrText: ['GRAB', 'RIDE 28.500', 'TOTAL 28.500', '1 January 2026'].join(
      '\n',
    ),
    expected: { amount: 28500, categoryHint: 'Transportasi' },
  },
];
