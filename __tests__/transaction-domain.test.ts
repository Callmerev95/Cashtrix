/**
 * Transaction domain tests — the Jest seam from `specs/cashtrix-mvp.md`
 * (pure functions: id-ID amount entry/validation, note trimming, date rules,
 * the grouping/paging that drives the history list). Target ≥90% on the
 * domain folder for ticket #6.
 */
import {
  AMOUNT_MAX,
  CATEGORY_KINDS,
  DEFAULT_TRANSACTION_TYPE,
  NOTE_MAX_LENGTH,
  PAGE_SIZE,
  TRANSACTION_TYPES,
  TRANSFER_ICON,
  WEEKDAY_LABELS,
  amountMessages,
  buildMonthGrid,
  canSelectDay,
  categoriesForKind,
  formatAmountInput,
  formatDateDivider,
  formatGrouped,
  formatMonthLabel,
  formatSignedAmount,
  formatTime,
  groupByDay,
  hasMoreAfter,
  isFutureDate,
  isTransactionType,
  newIdempotencyKey,
  normalizeNote,
  startOfDay,
  toDateKey,
  transferFeedLabel,
  transferMessages,
  validateAmount,
  validateTransfer,
  type Category,
  type Transaction,
} from '@/features/transactions';
import { walletMessages } from '@/features/wallets';
import { recurringMessages } from '@/features/recurring';

function transaction(partial: Partial<Transaction>): Transaction {
  return {
    id: partial.id ?? 't1',
    type: partial.type ?? 'expense',
    amount: partial.amount ?? 10_000,
    currencyCode: partial.currencyCode ?? 'IDR',
    occurredAt: partial.occurredAt ?? '2026-09-18T10:00:00+07:00',
    note: partial.note ?? null,
    categoryId: partial.categoryId ?? 'c1',
    categoryName: partial.categoryName ?? 'Makanan',
    categoryIcon: partial.categoryIcon ?? 'restaurant',
    walletId: partial.walletId ?? 'w1',
    walletName: partial.walletName ?? 'Cash',
    counterpartyWalletId: partial.counterpartyWalletId ?? null,
    counterpartyWalletName: partial.counterpartyWalletName ?? null,
  };
}

describe('constants & type guard', () => {
  it('mendefinisikan tiga tipe transaksi (V2 menambah transfer)', () => {
    expect(TRANSACTION_TYPES).toEqual(['expense', 'income', 'transfer']);
    expect(CATEGORY_KINDS).toEqual(['expense', 'income']);
    expect(DEFAULT_TRANSACTION_TYPE).toBe('expense');
    expect(PAGE_SIZE).toBe(20);
    expect(NOTE_MAX_LENGTH).toBe(200);
    expect(AMOUNT_MAX).toBe(999_999_999_999);
  });

  it('mengenali tipe yang valid saja', () => {
    expect(isTransactionType('expense')).toBe(true);
    expect(isTransactionType('income')).toBe(true);
    expect(isTransactionType('transfer')).toBe(true);
    expect(isTransactionType(null)).toBe(false);
    expect(isTransactionType(7)).toBe(false);
  });
});

describe('newIdempotencyKey', () => {
  it('mengembalikan UUID v4 yang bentuknya benar', () => {
    const key = newIdempotencyKey();
    expect(key).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('menghasilkan key berbeda setiap dipanggil', () => {
    const keys = new Set(Array.from({ length: 50 }, () => newIdempotencyKey()));
    expect(keys.size).toBe(50);
  });

  it('memakai crypto.randomUUID bila tersedia', () => {
    const original = (globalThis as { crypto?: unknown }).crypto;
    const randomUUID = jest.fn(() => '11111111-2222-4333-8444-555555555555');
    Object.defineProperty(globalThis, 'crypto', {
      value: { randomUUID },
      configurable: true,
    });

    try {
      expect(newIdempotencyKey()).toBe('11111111-2222-4333-8444-555555555555');
      expect(randomUUID).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        value: original,
        configurable: true,
      });
    }
  });

  it('jatuh ke generator Math.random yang tetap UUID v4 saat crypto absen', () => {
    const original = (globalThis as { crypto?: unknown }).crypto;
    Object.defineProperty(globalThis, 'crypto', {
      value: undefined,
      configurable: true,
    });

    try {
      for (let i = 0; i < 20; i += 1) {
        expect(newIdempotencyKey()).toMatch(
          /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
        );
      }
    } finally {
      Object.defineProperty(globalThis, 'crypto', {
        value: original,
        configurable: true,
      });
    }
  });
});

describe('formatAmountInput', () => {
  it('mengelompokkan ribuan saat mengetik', () => {
    expect(formatAmountInput('1250')).toBe('1.250');
    expect(formatAmountInput('1250000')).toBe('1.250.000');
    expect(formatAmountInput('999999999999')).toBe('999.999.999.999');
  });

  it('mempertahankan koma desimal yang baru diketik', () => {
    expect(formatAmountInput('1250,')).toBe('1.250,');
    expect(formatAmountInput('1250,5')).toBe('1.250,5');
  });

  it('membatasi desimal menjadi dua angka', () => {
    expect(formatAmountInput('1000,999')).toBe('1.000,99');
  });

  it('membuang karakter non-numerik (stabil saat paste)', () => {
    expect(formatAmountInput('Rp 40 000')).toBe('40.000');
    expect(formatAmountInput('abc')).toBe('');
    expect(formatAmountInput('')).toBe('');
  });

  it('hanya memakai koma pertama sebagai pemisah desimal', () => {
    expect(formatAmountInput('1,2,3')).toBe('1,23');
  });
});

describe('validateAmount', () => {
  it('menerima nominal terformat dan desimal', () => {
    expect(validateAmount('1.250.000')).toEqual({ ok: true, value: 1_250_000 });
    expect(validateAmount('1.250.000,50')).toEqual({
      ok: true,
      value: 1_250_000.5,
    });
    expect(validateAmount('0,5')).toEqual({ ok: true, value: 0.5 });
    expect(validateAmount('2500')).toEqual({ ok: true, value: 2500 });
  });

  it('menerima batas atas 12 digit', () => {
    expect(validateAmount('999.999.999.999')).toEqual({
      ok: true,
      value: AMOUNT_MAX,
    });
  });

  it('menolak field kosong', () => {
    expect(validateAmount('')).toEqual({
      ok: false,
      error: amountMessages.required,
    });
    expect(validateAmount('   ')).toEqual({
      ok: false,
      error: amountMessages.required,
    });
  });

  it('menolak nol', () => {
    expect(validateAmount('0')).toEqual({
      ok: false,
      error: amountMessages.zero,
    });
    expect(validateAmount('0,00')).toEqual({
      ok: false,
      error: amountMessages.zero,
    });
  });

  it('menolak teks yang tidak bisa di-parse', () => {
    expect(validateAmount('abc')).toEqual({
      ok: false,
      error: amountMessages.invalid,
    });
    expect(validateAmount('12abc')).toEqual({
      ok: false,
      error: amountMessages.invalid,
    });
    expect(validateAmount('1..250')).toEqual({
      ok: false,
      error: amountMessages.invalid,
    });
    expect(validateAmount('NaN')).toEqual({
      ok: false,
      error: amountMessages.invalid,
    });
    expect(validateAmount('Infinity')).toEqual({
      ok: false,
      error: amountMessages.invalid,
    });
  });

  it('menolak lebih dari dua desimal', () => {
    expect(validateAmount('1.000,123')).toEqual({
      ok: false,
      error: amountMessages.tooManyDecimals,
    });
  });

  it('menolak lebih dari 12 digit integer', () => {
    expect(validateAmount('9.999.999.999.999')).toEqual({
      ok: false,
      error: amountMessages.tooLarge,
    });
    expect(validateAmount('1000000000000')).toEqual({
      ok: false,
      error: amountMessages.tooLarge,
    });
  });

  it('mengabaikan nol di depan saat menghitung digit', () => {
    expect(validateAmount('0000000000001')).toEqual({ ok: true, value: 1 });
  });
});

describe('normalizeNote', () => {
  it('memangkas spasi dan mengosongkan note kosong', () => {
    expect(normalizeNote('  Kopi pagi ')).toBe('Kopi pagi');
    expect(normalizeNote('')).toBeNull();
    expect(normalizeNote('    ')).toBeNull();
  });
});

describe('date rules', () => {
  // Built from local components so the suite is timezone-independent: a machine
  // in UTC and one in WIB must agree (the app derives dividers from `Date`
  // local fields, not from a fixed offset).
  const at = (
    year: number,
    month: number,
    day: number,
    hours = 0,
    minutes = 0,
  ) => new Date(year, month - 1, day, hours, minutes).toISOString();
  const now = new Date(2026, 8, 18, 8, 0);

  it('startOfDay memotong ke tengah malam lokal', () => {
    const start = startOfDay(new Date(2026, 8, 18, 23, 30));
    expect(start.getHours()).toBe(0);
    expect(start.getMinutes()).toBe(0);
    expect(start.getDate()).toBe(18);
  });

  it('menolak tanggal setelah hari ini (AC: tidak boleh future date)', () => {
    expect(isFutureDate(new Date(2026, 8, 19, 9, 0), now)).toBe(true);
    expect(isFutureDate(new Date(2026, 8, 18, 23, 0), now)).toBe(false);
    expect(isFutureDate(new Date(2026, 8, 17, 9, 0), now)).toBe(false);
  });

  it('toDateKey memformat YYYY-MM-DD lokal', () => {
    expect(toDateKey(new Date(2026, 8, 5, 12, 0))).toBe('2026-09-05');
  });

  it('melabeli hari ini dan kemarin, lalu tanggal id-ID', () => {
    expect(formatDateDivider(at(2026, 9, 18, 10, 0), now)).toBe('Hari ini');
    expect(formatDateDivider(at(2026, 9, 17, 10, 0), now)).toBe('Kemarin');
    expect(formatDateDivider(at(2026, 8, 1, 10, 0), now)).toBe('1 Agu 2026');
  });

  it('formatTime merender HH:MM', () => {
    expect(formatTime(at(2026, 9, 18, 14, 30))).toBe('14:30');
    expect(formatTime(at(2026, 9, 18, 9, 5))).toBe('09:05');
  });
});

describe('formatSignedAmount / formatGrouped', () => {
  it('mengelompokkan ribuan tanpa glyph mata uang', () => {
    expect(formatGrouped(1_250_000)).toBe('1.250.000');
    expect(formatGrouped(1_250_000.5)).toBe('1.250.000,50');
    expect(formatGrouped(0)).toBe('0');
  });

  it('income tanpa prefix (warna hijau pembedanya) dan expense bertanda -', () => {
    expect(formatSignedAmount('income', 7_000_000)).toBe('Rp 7.000.000');
    expect(formatSignedAmount('expense', 50_000)).toBe('-Rp 50.000');
  });

  it('transfer netral tanpa prefix (bukan income maupun expense)', () => {
    expect(formatSignedAmount('transfer', 250_000)).toBe('Rp 250.000');
  });

  it('expense tidak pernah memakai warna merah', () => {
    const rendered = formatSignedAmount('expense', 50_000);
    expect(rendered.startsWith('-')).toBe(true);
  });
});

describe('categoriesForKind', () => {
  const categories: Category[] = [
    { id: 'e1', name: 'Makanan', icon: 'restaurant', kind: 'expense' },
    { id: 'i1', name: 'Gaji', icon: 'payments', kind: 'income' },
    { id: 'e2', name: 'Transportasi', icon: 'directions_car', kind: 'expense' },
  ];

  it('hanya mengembalikan kategori sesuai kind transaksi', () => {
    expect(categoriesForKind(categories, 'income').map((item) => item.id)).toEqual([
      'i1',
    ]);
    expect(categoriesForKind(categories, 'expense').map((item) => item.id)).toEqual([
      'e1',
      'e2',
    ]);
  });

  it('mengembalikan daftar kosong bila tidak ada yang cocok', () => {
    expect(categoriesForKind([], 'expense')).toEqual([]);
  });
});

describe('groupByDay', () => {
  const at = (day: number, hours: number) =>
    new Date(2026, 8, day, hours).toISOString();
  const now = new Date(2026, 8, 18, 8, 0);

  it('mengelompokkan baris berurutan per tanggal dan tidak mengurutkan ulang', () => {
    const groups = groupByDay(
      [
        transaction({ id: 'a', occurredAt: at(18, 9) }),
        transaction({ id: 'b', occurredAt: at(18, 7) }),
        transaction({ id: 'c', occurredAt: at(17, 22) }),
      ],
      now,
    );

    expect(groups.map((group) => group.key)).toEqual(['2026-09-18', '2026-09-17']);
    expect(groups[0].label).toBe('Hari ini');
    expect(groups[0].transactions.map((row) => row.id)).toEqual(['a', 'b']);
    expect(groups[1].label).toBe('Kemarin');
    expect(groups[1].transactions.map((row) => row.id)).toEqual(['c']);
  });

  it('membuat grup baru bila tanggal kembali muncul setelah tanggal lain', () => {
    const groups = groupByDay(
      [
        transaction({ id: 'a', occurredAt: at(18, 9) }),
        transaction({ id: 'b', occurredAt: at(17, 9) }),
        transaction({ id: 'c', occurredAt: at(18, 1) }),
      ],
      now,
    );

    expect(groups).toHaveLength(3);
  });

  it('mengembalikan daftar kosong untuk input kosong', () => {
    expect(groupByDay([], now)).toEqual([]);
  });
});

describe('hasMoreAfter', () => {
  it('berlanjut hanya saat halaman terisi penuh', () => {
    expect(hasMoreAfter(20, 20)).toBe(true);
    expect(hasMoreAfter(20, 19)).toBe(false);
    expect(hasMoreAfter(20, 0)).toBe(false);
  });
});

describe('validateTransfer (V2)', () => {
  it('menerima pasangan sumber dan tujuan yang berbeda', () => {
    expect(
      validateTransfer({ sourceWalletId: 'w1', destinationWalletId: 'w2' }),
    ).toEqual({ ok: true });
  });

  it('menolak sumber yang kosong', () => {
    expect(
      validateTransfer({ sourceWalletId: null, destinationWalletId: 'w2' }),
    ).toEqual({ ok: false, error: transferMessages.sourceRequired });
  });

  it('menolak tujuan yang kosong', () => {
    expect(
      validateTransfer({ sourceWalletId: 'w1', destinationWalletId: null }),
    ).toEqual({ ok: false, error: transferMessages.destinationRequired });
  });

  it('menolak sumber = tujuan', () => {
    expect(
      validateTransfer({ sourceWalletId: 'w1', destinationWalletId: 'w1' }),
    ).toEqual({ ok: false, error: transferMessages.sameWallet });
  });
});

describe('transferFeedLabel (V2)', () => {
  it('me-render satu baris "Transfer ke {nama}"', () => {
    expect(transferFeedLabel('BCA')).toBe('Transfer ke BCA');
  });

  it('jatuh ke "Transfer" bila nama tujuan hilang', () => {
    expect(transferFeedLabel(null)).toBe('Transfer');
    expect(transferFeedLabel(undefined)).toBe('Transfer');
  });

  it('ikon transfer adalah swap-horiz', () => {
    expect(TRANSFER_ICON).toBe('swap-horiz');
  });
});

describe('kalender bulan (V5)', () => {
  // 18 Sep 2026 — 1 Sep 2026 adalah Selasa, jadi minggu pertama berawalan
  // Senin 31 Agu sebagai filler.
  const now = new Date(2026, 8, 18, 10, 0);
  const september = new Date(2026, 8, 1);
  const selected = new Date(2026, 8, 10);

  it('label hari Senin-dulu dan judul bulan id-ID', () => {
    expect(WEEKDAY_LABELS).toEqual([
      'Sen',
      'Sel',
      'Rab',
      'Kam',
      'Jum',
      'Sab',
      'Min',
    ]);
    expect(formatMonthLabel(september)).toBe('September 2026');
    expect(formatMonthLabel(new Date(2026, 1, 1))).toBe('Februari 2026');
  });

  it('minggu lengkap 7 kolom Senin-dulu dan tanggal berurutan', () => {
    const weeks = buildMonthGrid(september, selected, now);
    expect(weeks.length).toBeGreaterThanOrEqual(4);
    for (const week of weeks) {
      expect(week).toHaveLength(7);
      expect(week[0].date.getDay()).toBe(1); // Senin
      for (let i = 1; i < 7; i += 1) {
        const diff =
          week[i].date.getTime() - week[i - 1].date.getTime();
        expect(diff).toBe(86_400_000);
      }
    }
    expect(toDateKey(weeks[0][0].date)).toBe('2026-08-31');
  });

  it('setiap tanggal muncul tepat sekali sebagai inMonth', () => {
    const weeks = buildMonthGrid(september, selected, now);
    const inMonth = weeks.flat().filter((day) => day.inMonth);
    expect(inMonth).toHaveLength(30);
    expect(inMonth.map((day) => day.day)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1),
    );
    expect(
      weeks
        .flat()
        .filter((day) => !day.inMonth)
        .every((day) => day.day >= 28 || day.day <= 5),
    ).toBe(true);
  });

  it('menandai hari ini, masa depan, dan pilihan', () => {
    const weeks = buildMonthGrid(september, selected, now);
    const flat = weeks.flat();
    const today = flat.filter((day) => day.isToday);
    expect(today).toHaveLength(1);
    expect(toDateKey(today[0].date)).toBe('2026-09-18');

    const future = flat.filter((day) => day.inMonth && day.isFuture);
    expect(future.map((day) => day.day)).toEqual(
      Array.from({ length: 12 }, (_, i) => i + 19),
    );
    expect(
      flat.find(
        (day) => toDateKey(day.date) === '2026-09-17',
      )?.isFuture,
    ).toBe(false);

    const picked = flat.filter((day) => day.isSelected);
    expect(picked).toHaveLength(1);
    expect(toDateKey(picked[0].date)).toBe('2026-09-10');
  });

  it('hanya mengizinkan hari ini atau sebelumnya (kalender tak memilih masa depan)', () => {
    expect(canSelectDay(new Date(2026, 8, 17), now)).toBe(true);
    expect(canSelectDay(new Date(2026, 8, 18), now)).toBe(true);
    expect(canSelectDay(new Date(2026, 8, 19), now)).toBe(false);
  });

  it('menolak tanggal masa depan untuk Transfer (submit guard semua tipe)', () => {
    // Pasangan wallet valid, tapi tanggal besok tetap ditolak — aturan yang
    // sama mengikat income/expense/transfer di form.
    expect(
      validateTransfer({ sourceWalletId: 'w1', destinationWalletId: 'w2' }),
    ).toEqual({ ok: true });
    expect(isFutureDate(new Date(2026, 8, 19), now)).toBe(true);
    expect(isFutureDate(new Date(2026, 8, 18), now)).toBe(false);
  });
});

describe('pass istilah Dompet (V5)', () => {
  it('copy dompet yang terlihat pengguna memakai "dompet", bukan "wallet"', () => {
    const copies = [
      walletMessages.nameRequired,
      walletMessages.nameTooLong,
      walletMessages.nameDuplicate,
      walletMessages.limitReached,
      walletMessages.deleteConfirm,
      walletMessages.reassignRequired,
      ...Object.values(transferMessages),
      recurringMessages.walletRequired,
    ];
    expect(copies.length).toBeGreaterThan(0);
    for (const copy of copies) {
      expect(copy.toLowerCase()).toContain('dompet');
      expect(copy.toLowerCase()).not.toContain('wallet');
    }
  });
});
