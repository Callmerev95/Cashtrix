/**
 * Wallet domain tests — the Jest seam from `specs/cashtrix-mvp.md` (pure
 * functions: id-ID money formatting, amount validation, the 10-wallet cap and
 * the dashboard roll-up).
 */
import {
  AMOUNT_MAX,
  MAX_WALLETS,
  formatAmount,
  formatCurrency,
  hasWalletErrors,
  isWalletType,
  openingBalanceFromInput,
  parseAmountInput,
  summarizeWallets,
  validateWallet,
  walletMessages,
  walletTypeMeta,
  type Wallet,
} from '@/features/wallets';

function wallet(partial: Partial<Wallet>): Wallet {
  return {
    id: partial.id ?? 'w1',
    name: partial.name ?? 'Cash',
    type: partial.type ?? 'cash',
    openingBalance: partial.openingBalance ?? 0,
    balance: partial.balance ?? 0,
    transactionCount: partial.transactionCount ?? 0,
  };
}

describe('parseAmountInput', () => {
  it('menerima angka polos dan format id-ID', () => {
    expect(parseAmountInput('0')).toBe(0);
    expect(parseAmountInput('2500')).toBe(2500);
    expect(parseAmountInput('1.250.000')).toBe(1_250_000);
    expect(parseAmountInput('1.250.000,50')).toBe(1_250_000.5);
    expect(parseAmountInput('12,5')).toBe(12.5);
  });

  it('menerima nominal negatif (kartu kredit bisa mulai minus)', () => {
    expect(parseAmountInput('-500.000')).toBe(-500_000);
  });

  it('mengabaikan karakter non-numerik', () => {
    expect(parseAmountInput('Rp 40 000')).toBe(40_000);
  });

  it('menolak input kosong, NaN dan Infinity', () => {
    expect(parseAmountInput('')).toBeNull();
    expect(parseAmountInput('   ')).toBeNull();
    expect(parseAmountInput('abc')).toBeNull();
    expect(parseAmountInput('NaN')).toBeNull();
    expect(parseAmountInput('Infinity')).toBeNull();
  });

  it('menolak lebih dari 2 desimal', () => {
    expect(parseAmountInput('1.000,123')).toBeNull();
  });

  it('menolak di atas batas 12 digit', () => {
    expect(parseAmountInput(String(AMOUNT_MAX))).toBe(AMOUNT_MAX);
    expect(parseAmountInput(String(AMOUNT_MAX + 1))).toBeNull();
  });
});

describe('formatAmount / formatCurrency', () => {
  it('mengelompokkan ribuan ala id-ID', () => {
    expect(formatAmount(0)).toBe('0');
    expect(formatAmount(2500)).toBe('2.500');
    expect(formatAmount(1_250_000)).toBe('1.250.000');
    expect(formatAmount(1_250_000.5)).toBe('1.250.000,50');
  });

  it('menandai nilai negatif', () => {
    expect(formatAmount(-500_000)).toBe('-500.000');
  });

  it('merender glyph Rp', () => {
    expect(formatCurrency(1_250_000)).toBe('Rp 1.250.000');
    expect(formatCurrency(-500_000)).toBe('-Rp 500.000');
  });
});

describe('validateWallet', () => {
  it('menerima form kosong yang valid (nama terisi, saldo kosong = 0)', () => {
    expect(validateWallet({ name: 'BCA', openingBalanceRaw: '' })).toEqual({});
    expect(hasWalletErrors(validateWallet({ name: 'BCA', openingBalanceRaw: '1.000' }))).toBe(false);
  });

  it('menolak nama kosong', () => {
    expect(validateWallet({ name: '   ', openingBalanceRaw: '' }).name).toBe(
      walletMessages.nameRequired,
    );
  });

  it('menolak nama lebih dari 60 karakter', () => {
    const long = 'a'.repeat(61);
    expect(validateWallet({ name: long, openingBalanceRaw: '' }).name).toBe(
      walletMessages.nameTooLong,
    );
  });

  it('menolak nama duplikat tanpa peduli huruf besar/kecil', () => {
    expect(
      validateWallet({
        name: 'bca',
        openingBalanceRaw: '',
        existingNames: ['BCA', 'Cash'],
      }).name,
    ).toBe(walletMessages.nameDuplicate);
  });

  it('menolak nominal tidak valid', () => {
    expect(
      validateWallet({ name: 'BCA', openingBalanceRaw: 'abc' }).openingBalance,
    ).toBe(walletMessages.amountInvalidNumber);
    expect(
      validateWallet({ name: 'BCA', openingBalanceRaw: '9999999999999' })
        .openingBalance,
    ).toBe(walletMessages.amountInvalid);
  });

  it('mengosongkan error saat diperbaiki', () => {
    const errors = validateWallet({
      name: 'BCA',
      openingBalanceRaw: '1.000',
      existingNames: ['Mandiri'],
    });
    expect(hasWalletErrors(errors)).toBe(false);
  });
});

describe('openingBalanceFromInput', () => {
  it('memperlakukan field kosong sebagai 0', () => {
    expect(openingBalanceFromInput('')).toBe(0);
    expect(openingBalanceFromInput('   ')).toBe(0);
  });

  it('men-parse nilai terformat', () => {
    expect(openingBalanceFromInput('1.000.000')).toBe(1_000_000);
  });
});

describe('summarizeWallets', () => {
  it('menjumlahkan saldo semua wallet (saldo gabungan Dashboard)', () => {
    const summary = summarizeWallets([
      wallet({ id: 'a', balance: 1_250_000 }),
      wallet({ id: 'b', balance: 30_000 }),
      wallet({ id: 'c', balance: -75_000 }),
    ]);

    expect(summary.totalBalance).toBe(1_205_000);
    expect(summary.count).toBe(3);
    expect(summary.remainingSlots).toBe(MAX_WALLETS - 3);
  });

  it('tidak menyisakan slot saat sudah maksimal', () => {
    const wallets = Array.from({ length: MAX_WALLETS }, (_, index) =>
      wallet({ id: `w${index}` }),
    );

    expect(summarizeWallets(wallets).remainingSlots).toBe(0);
    expect(summarizeWallets([...wallets, wallet({ id: 'extra' })]).remainingSlots).toBe(0);
  });

  it('mengembalikan 0 untuk daftar kosong (tanpa NaN)', () => {
    const summary = summarizeWallets([]);
    expect(summary.totalBalance).toBe(0);
    expect(summary.remainingSlots).toBe(MAX_WALLETS);
  });
});

describe('walletTypeMeta', () => {
  it('menyediakan label + ikon untuk setiap tipe (tanpa colour picker)', () => {
    expect(Object.keys(walletTypeMeta).sort()).toEqual([
      'bank',
      'card',
      'cash',
      'ewallet',
    ]);
    for (const meta of Object.values(walletTypeMeta)) {
      expect(meta.label.length).toBeGreaterThan(0);
      expect(meta.icon.length).toBeGreaterThan(0);
    }
  });

  it('mengenali tipe yang valid saja', () => {
    expect(isWalletType('bank')).toBe(true);
    expect(isWalletType('crypto')).toBe(false);
    expect(isWalletType(null)).toBe(false);
  });
});
