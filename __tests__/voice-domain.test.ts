/**
 * Voice parser seam (VC1, issue #63 — spec `specs/cashtrix-voice-capture.md`
 * §VC3, ADR-0010). The pure Jest lock on the one-utterance rule parser.
 *
 * What is pinned here:
 * - digit-ID amounts pass (`30.000`, `30 ribu`, `25rb`, `Rp30.000`,
 *   voice-only `5 juta`/`2,5 juta`); S3 parity vectors assert both
 *   implementations agree (Opsi A′ — drift turns this red, not silent);
 * - two amounts refuse (`multiAmount`), pure number words refuse honestly
 *   (`wordsOnly`), transfer refuses before amounts are even counted;
 * - expense is the default, the small locked keyword list flips to income;
 * - wallet preselect is a case-insensitive substring over the wallets the
 *   caller passes (a miss is legal — CONTEXT.md "Saran dompet" is never
 *   locked); category hint is optional.
 */
import { parseAmountToken } from '../supabase/functions/scan-receipt/parse';
import {
  hintVoiceCategory,
  MAX_SPLIT_CLAUSES,
  parseVoiceAmountToken,
  parseVoiceFlag,
  parseVoiceSplit,
  parseVoiceText,
  splitVoiceClauses,
  suggestVoiceWallet,
  voiceMessages,
  voiceRefusalMessage,
  voiceSplitRefusalMessage,
  widgetSaveCopy,
} from '@/features/voice';
import type { VoiceSplitRow, VoiceWallet } from '@/features/voice';
import { id } from '@/i18n/id';

const WALLETS: VoiceWallet[] = [
  { id: 'w-gopay', name: 'GoPay' },
  { id: 'w-bca', name: 'BCA' },
  { id: 'w-cash', name: 'Cash' },
];

describe('parseVoiceAmountToken — format digit-ID', () => {
  it.each([
    ['30.000', 30000],
    ['30,000', 30000],
    ['Rp30.000', 30000],
    ['Rp 30.000', 30000],
    ['30000', 30000],
    ['Rp30rb', 30000],
    ['30rb', 30000],
    ['30 ribu', 30000],
    ['45.500', 45500],
    ['45.5', 46],
    ['30.000,50', 30000],
  ])('%s → %s', (token, expected) => {
    expect(parseVoiceAmountToken(token)).toBe(expected);
  });

  it.each([[''], ['Rp'], ['0'], ['-5000'], ['abc'], ['30.00.00']])(
    '%s → null',
    (token) => {
      expect(parseVoiceAmountToken(token)).toBeNull();
    },
  );
});

describe('parseVoiceAmountToken — ekstensi juta (voice-only)', () => {
  it.each([
    ['5 juta', 5000000],
    ['5juta', 5000000],
    ['25jt', 25000000],
    ['Rp5 juta', 5000000],
    ['2,5 juta', 2500000],
    ['2.5 juta', 2500000],
    ['1,25 juta', 1250000],
    ['1.500,25 juta', 1500250000],
  ])('%s → %s', (token, expected) => {
    expect(parseVoiceAmountToken(token)).toBe(expected);
  });

  it.each([['juta'], ['0 juta'], ['1.000.000 juta'], ['2,5555 juta']])(
    '%s → null (bukan tebakan)',
    (token) => {
      expect(parseVoiceAmountToken(token)).toBeNull();
    },
  );
});

describe('paritas S3 (Opsi A′) — kedua parser setuju', () => {
  const shared: string[] = [
    '30.000',
    '30,000',
    'Rp30.000',
    'Rp 30.000',
    '30000',
    'Rp30rb',
    '30rb',
    '30 ribu',
    '45.500',
    '30.000,50',
    '',
    'Rp',
    '0',
    '-5000',
    'abc',
    '30.00.00',
  ];
  it.each(shared)('%s → sama', (token) => {
    expect(parseVoiceAmountToken(token)).toBe(parseAmountToken(token));
  });
});

describe('parseVoiceFlag (VC3: only the /voice alias arms voice-first)', () => {
  it('arms voice-first mode only for the exact voice=1 the alias emits', () => {
    expect(parseVoiceFlag('1')).toBe(true);
  });

  it.each([['0'], ['true'], [''], [null], [undefined]])(
    'ignores %p',
    (value) => {
      expect(parseVoiceFlag(value)).toBe(false);
    },
  );
});

describe('parseVoiceText — ok satu nominal digit', () => {
  it.each([
    ['soto mie 25000 pakai gopay', 25000],
    ['soto mie 25rb pakai gopay', 25000],
    ['soto mie 25 ribu pakai gopay', 25000],
    ['soto mie Rp25.000 pakai gopay', 25000],
  ])('%s → %s', (text, amount) => {
    const result = parseVoiceText(text, WALLETS);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.amount).toBe(amount);
    expect(result.kind).toBe('expense');
    expect(result.walletId).toBe('w-gopay');
    expect(result.categoryHint).toBe('Makanan');
    expect(result.note).toBe(text);
  });

  it('tanpa sebutan dompet → walletId null (picker tetap manual)', () => {
    const result = parseVoiceText('kopi 30rb', WALLETS);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.walletId).toBeNull();
    expect(result.categoryHint).toBe('Makanan');
  });

  it('bayar listrik 150rb → Tagihan', () => {
    const result = parseVoiceText('bayar listrik 150rb', WALLETS);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.amount).toBe(150000);
    expect(result.categoryHint).toBe('Tagihan');
  });
});

describe('parseVoiceText — keyword income kecil', () => {
  it.each([
    ['gajian 5 juta', 5000000],
    ['gaji bulan ini 4500000', 4500000],
    ['dapat bonus 50rb', 50000],
    ['uang masuk 100rb', 100000],
    ['terima pembayaran 75rb', 75000],
  ])('%s → income %s', (text, amount) => {
    const result = parseVoiceText(text, WALLETS);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.kind).toBe('income');
    expect(result.amount).toBe(amount);
  });

  it('"termasuk" bukan keyword (word boundary)', () => {
    const result = parseVoiceText('makan termasuk ongkir 10rb', WALLETS);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.kind).toBe('expense');
  });
});

describe('parseVoiceText — penolakan', () => {
  it('dua nominal → multiAmount ("sebutkan satu per satu")', () => {
    expect(parseVoiceText('nasi padang 30rb dan kopi 12rb', WALLETS)).toEqual({
      status: 'multiAmount',
    });
  });

  it.each([['tiga puluh ribu untuk makan'], ['setengah juta'], ['sejuta buat jajan']])(
    '%s → wordsOnly (jujur, tanpa tebak)',
    (text) => {
      expect(parseVoiceText(text, WALLETS)).toEqual({ status: 'wordsOnly' });
    },
  );

  it.each([['soto mie pakai gopay'], ['']])(
    '%s → needAmount (tanpa angka, tanpa kata-bilangan)',
    (text) => {
      expect(parseVoiceText(text, WALLETS)).toEqual({ status: 'needAmount' });
    },
  );

  it.each([
    ['transfer 50rb ke bca'],
    ['tf 100rb ke dana'],
    ['kirim uang ke budi 50rb'],
    ['pindah dana 200rb'],
  ])('%s → transferRefused (menang atas nominal)', (text) => {
    expect(parseVoiceText(text, WALLETS)).toEqual({
      status: 'transferRefused',
    });
  });
});

describe('suggestVoiceWallet — substring dompet', () => {
  it('case-insensitive ("GOPAY" ↔ "GoPay")', () => {
    expect(suggestVoiceWallet('bayar 30rb pakai GOPAY', WALLETS)).toBe(
      'w-gopay',
    );
  });

  it('urutan caller menang (dompet pertama yang cocok)', () => {
    const wallets: VoiceWallet[] = [
      { id: 'w-1', name: 'BCA' },
      { id: 'w-2', name: 'BCA Digital' },
    ];
    expect(suggestVoiceWallet('dari bca digital 50rb', wallets)).toBe('w-1');
  });

  it('nama < 3 huruf dilewati (bukan mention)', () => {
    expect(
      suggestVoiceWallet('a 30rb', [{ id: 'w-a', name: 'A' }]),
    ).toBeNull();
  });

  it('tak cocok → null', () => {
    expect(suggestVoiceWallet('kopi 30rb', WALLETS)).toBeNull();
  });
});

describe('hintVoiceCategory + copy penolakan', () => {
  it('kopi → Makanan; tak dikenal → null', () => {
    expect(hintVoiceCategory('kopi pagi 30rb')).toBe('Makanan');
    expect(hintVoiceCategory('zqx 30rb')).toBeNull();
  });

  it('voiceMessages mirror kamus id', () => {
    expect(voiceMessages.multiAmount).toBe(id.voice.multiAmount);
    expect(voiceMessages.transferRefused).toBe(id.voice.transferRefused);
  });

  it('default id, en eksplisit', () => {
    expect(voiceRefusalMessage('multiAmount')).toBe('Sebutkan satu per satu');
    expect(voiceRefusalMessage('multiAmount', 'en')).toBe(
      'One item at a time',
    );
    expect(voiceRefusalMessage('transferRefused', 'en')).toBe(
      'Use the form for transfers',
    );
  });
});

describe('splitVoiceClauses — pemisah klausa (WG1)', () => {
  it('satu klausa tanpa pemisah tetap satu', () => {
    expect(splitVoiceClauses('kopi 30rb')).toEqual(['kopi 30rb']);
  });

  it.each([
    ['nasi padang 30rb dan kopi 12rb', ['nasi padang 30rb', 'kopi 12rb']],
    ['nasi padang 30rb, kopi 12rb', ['nasi padang 30rb', 'kopi 12rb']],
    ['nasi 30rb; kopi 12rb', ['nasi 30rb', 'kopi 12rb']],
    ['nasi 30rb terus kopi 12rb', ['nasi 30rb', 'kopi 12rb']],
    ['nasi 30rb lalu kopi 12rb', ['nasi 30rb', 'kopi 12rb']],
    ['nasi 30rb plus kopi 12rb', ['nasi 30rb', 'kopi 12rb']],
    ['nasi 30rb kemudian kopi 12rb', ['nasi 30rb', 'kopi 12rb']],
    ['nasi 30rb DAN kopi 12rb', ['nasi 30rb', 'kopi 12rb']],
  ])('%s → %p', (text, expected) => {
    expect(splitVoiceClauses(text)).toEqual(expected);
  });

  it('"dengan"/"sama" bukan pemisah (frasa utuh)', () => {
    expect(splitVoiceClauses('kopi dengan gula 12rb')).toEqual([
      'kopi dengan gula 12rb',
    ]);
    expect(splitVoiceClauses('nasi sama ayam 30rb')).toEqual([
      'nasi sama ayam 30rb',
    ]);
  });

  it('pemisah ganda/ujung tidak melahirkan klausa kosong', () => {
    expect(splitVoiceClauses('nasi 30rb,, kopi 12rb')).toEqual([
      'nasi 30rb',
      'kopi 12rb',
    ]);
    expect(splitVoiceClauses('  nasi 30rb, ')).toEqual(['nasi 30rb']);
    expect(splitVoiceClauses('')).toEqual([]);
  });
});

describe('parseVoiceSplit — 1/2/3 klausa jadi 1/2/3 baris (WG1)', () => {
  it('satu klausa = perilaku VC1 (nominal, kind, dompet, hint, note)', () => {
    const result = parseVoiceSplit('soto mie 25rb pakai gopay', WALLETS);
    expect(result).toEqual({
      status: 'ok',
      kind: 'expense',
      rows: [
        {
          ok: true,
          amount: 25000,
          kind: 'expense',
          walletId: 'w-gopay',
          categoryHint: 'Makanan',
          note: 'soto mie 25rb pakai gopay',
        },
      ],
    });
  });

  it('dua klausa = dua baris, tiap baris punya nominal + hint sendiri', () => {
    const result = parseVoiceSplit('nasi padang 30rb dan kopi 12rb', WALLETS);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.kind).toBe('expense');
    expect(result.rows).toEqual([
      {
        ok: true,
        amount: 30000,
        kind: 'expense',
        walletId: null,
        categoryHint: 'Makanan',
        note: 'nasi padang 30rb',
      },
      {
        ok: true,
        amount: 12000,
        kind: 'expense',
        walletId: null,
        categoryHint: 'Makanan',
        note: 'kopi 12rb',
      },
    ]);
  });

  it('tiga klausa sejenis = tiga baris (batas atas)', () => {
    const result = parseVoiceSplit(
      'nasi 30rb, kopi 12rb, parkir 5rb',
      WALLETS,
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.rows).toHaveLength(3);
    expect(
      result.rows.filter((row) => row.ok).map((row) => row.ok && row.amount),
    ).toEqual([30000, 12000, 5000]);
  });

  it('dompet + hint di-resolve per klausa', () => {
    const result = parseVoiceSplit(
      'kopi 30rb pakai gopay dan bensin 50rb',
      WALLETS,
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    const rows = result.rows;
    expect(rows[0].ok && rows[0].walletId).toBe('w-gopay');
    expect(rows[1].ok && rows[1].categoryHint).toBe('Transportasi');
  });

  it('income dua klausa sejenis = ok income', () => {
    const result = parseVoiceSplit(
      'gajian 5 juta dan dapat bonus 50rb',
      WALLETS,
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.kind).toBe('income');
    expect(result.rows.every((row) => row.ok && row.kind === 'income')).toBe(
      true,
    );
  });
});

describe('parseVoiceSplit — penolakan utuh (WG1)', () => {
  it('empat klausa → tooManyClauses', () => {
    expect(
      parseVoiceSplit('a 10rb, b 20rb, c 30rb, d 40rb', WALLETS),
    ).toEqual({ status: 'tooManyClauses' });
  });

  it('campur expense + income → mixedKind', () => {
    expect(parseVoiceSplit('gajian 5 juta dan kopi 12rb', WALLETS)).toEqual({
      status: 'mixedKind',
    });
  });

  it('transfer menang atas klausa (menolak utuh)', () => {
    expect(parseVoiceSplit('kopi 12rb dan transfer 50rb ke bca', WALLETS)).toEqual(
      { status: 'transferRefused' },
    );
  });

  it('tanpa angka = needAmount; kata-bilangan = wordsOnly', () => {
    expect(parseVoiceSplit('kopi dan nasi', WALLETS)).toEqual({
      status: 'needAmount',
    });
    expect(parseVoiceSplit('tiga puluh ribu', WALLETS)).toEqual({
      status: 'wordsOnly',
    });
  });

  it('hanya pemisah/whitespace = needAmount', () => {
    expect(parseVoiceSplit('', WALLETS)).toEqual({ status: 'needAmount' });
    expect(parseVoiceSplit(' , ', WALLETS)).toEqual({
      status: 'needAmount',
    });
  });

  it('MAX_SPLIT_CLAUSES = 3', () => {
    expect(MAX_SPLIT_CLAUSES).toBe(3);
  });
});

describe('parseVoiceSplit — baris gagal F1a (WG1)', () => {
  it('klausa tanpa angka = baris gagal needAmount + teks mentah utuh', () => {
    const result = parseVoiceSplit('nasi padang 30rb dan kerupuk', WALLETS);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.rows).toEqual([
      {
        ok: true,
        amount: 30000,
        kind: 'expense',
        walletId: null,
        categoryHint: 'Makanan',
        note: 'nasi padang 30rb',
      },
      { ok: false, text: 'kerupuk', reason: 'needAmount' },
    ]);
  });

  it('klausa multi-nominal = baris gagal multiAmount (bukan tolak utuh)', () => {
    const result = parseVoiceSplit('kopi 12rb 15rb dan nasi 30rb', WALLETS);
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    const failed: VoiceSplitRow[] = result.rows.filter((row) => !row.ok);
    expect(failed).toEqual([
      { ok: false, text: 'kopi 12rb 15rb', reason: 'multiAmount' },
    ]);
  });

  it('klausa kata-bilangan = baris gagal wordsOnly', () => {
    const result = parseVoiceSplit(
      'nasi 30rb dan tiga puluh ribu buat jajan',
      WALLETS,
    );
    expect(result.status).toBe('ok');
    if (result.status !== 'ok') return;
    expect(result.rows[1]).toEqual({
      ok: false,
      text: 'tiga puluh ribu buat jajan',
      reason: 'wordsOnly',
    });
  });

  it('nol baris valid = penolakan utuh ala VC1 (bukan ok kosong)', () => {
    expect(parseVoiceSplit('kerupuk dan gorengan', WALLETS)).toEqual({
      status: 'needAmount',
    });
    expect(
      parseVoiceSplit('kerupuk dan tiga puluh ribu buat jajan', WALLETS),
    ).toEqual({ status: 'wordsOnly' });
  });
});

describe('voiceSplitRefusalMessage — copy split (WG1)', () => {
  it('tooManyClauses id/en', () => {
    expect(voiceSplitRefusalMessage('tooManyClauses')).toBe(
      'Maksimal tiga item sekaligus',
    );
    expect(voiceSplitRefusalMessage('tooManyClauses', 'en')).toBe(
      'Up to three items at once',
    );
  });

  it('mixedKind memakai label kind dari kamus (bukan hardcode)', () => {
    expect(voiceSplitRefusalMessage('mixedKind')).toBe(
      'Jangan campur Pengeluaran dan Pemasukan — sebutkan sejenis saja',
    );
    expect(voiceSplitRefusalMessage('mixedKind', 'en')).toBe(
      "Don't mix Expense and Income — one kind at a time",
    );
  });

  it('kunci VC1 delegasi ke voiceRefusalMessage (jalur reason baris gagal)', () => {
    expect(voiceSplitRefusalMessage('needAmount')).toBe(
      voiceRefusalMessage('needAmount'),
    );
    expect(voiceSplitRefusalMessage('multiAmount', 'en')).toBe(
      voiceRefusalMessage('multiAmount', 'en'),
    );
    expect(voiceSplitRefusalMessage('wordsOnly')).toBe(
      voiceRefusalMessage('wordsOnly'),
    );
    expect(voiceSplitRefusalMessage('transferRefused', 'en')).toBe(
      voiceRefusalMessage('transferRefused', 'en'),
    );
  });
});

describe('widgetSaveCopy — notifikasi widget "N transaksi, Total RpX" (WG2)', () => {
  it('id: count + total terformat', () => {
    expect(
      widgetSaveCopy({ count: 2, total: '42.000' }),
    ).toEqual({
      title: '2 transaksi tersimpan',
      body: 'Total 42.000',
    });
  });

  it('en eksplisit', () => {
    expect(
      widgetSaveCopy({ count: 1, total: '12.000' }, 'en'),
    ).toEqual({
      title: '1 transactions saved',
      body: 'Total 12.000',
    });
  });
});
