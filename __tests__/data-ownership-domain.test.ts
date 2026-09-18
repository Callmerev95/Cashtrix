/**
 * Data ownership domain tests (T9, issue #10) — the pure Jest seam.
 *
 * What is pinned here is the logic that is easy to get subtly wrong: the
 * exact CSV column order (spec story 46 — the server and the client must agree
 * byte-for-byte), RFC 4180 escaping of hostile field values (commas, quotes,
 * newlines in notes/names), and the "HAPUS" delete gate (spec story 47 —
 * anything but the exact word must reject, so an accidental tap never fires
 * `deleteAccount()`).
 */
import {
  buildCsv,
  CSV_HEADER,
  DELETE_CONFIRMATION_WORD,
  escapeCsvField,
  isDeleteConfirmation,
  toCsvLine,
  type CsvRow,
} from '@/features/data-ownership/domain';

describe('CSV_HEADER — exact column order (spec story 46)', () => {
  it('is date,type,category,wallet,amount,currency,note', () => {
    expect(CSV_HEADER).toBe(
      'date,type,category,wallet,amount,currency,note',
    );
  });
});

describe('escapeCsvField — RFC 4180', () => {
  it('leaves plain fields untouched', () => {
    expect(escapeCsvField('Makanan')).toBe('Makanan');
    expect(escapeCsvField('150000')).toBe('150000');
    expect(escapeCsvField('')).toBe('');
  });

  it('quotes fields containing commas', () => {
    expect(escapeCsvField('Cash, Utama')).toBe('"Cash, Utama"');
  });

  it('doubles inner quotes and wraps the field', () => {
    expect(escapeCsvField('kopi "susu" hangat')).toBe(
      '"kopi ""susu"" hangat"',
    );
  });

  it('quotes fields containing newlines', () => {
    expect(escapeCsvField('baris satu\nbaris dua')).toBe(
      '"baris satu\nbaris dua"',
    );
    expect(escapeCsvField('a\rb')).toBe('"a\rb"');
  });
});

describe('toCsvLine / buildCsv', () => {
  const row: CsvRow = {
    date: '2026-09-18T00:00:00.000Z',
    type: 'expense',
    category: 'Makanan',
    wallet: 'Cash',
    amount: '150000',
    currency: 'IDR',
    note: 'nasi padang',
  };

  it('emits fields in header order', () => {
    expect(toCsvLine(row)).toBe(
      '2026-09-18T00:00:00.000Z,expense,Makanan,Cash,150000,IDR,nasi padang',
    );
  });

  it('escapes hostile fields per row', () => {
    expect(
      toCsvLine({ ...row, wallet: 'Cash, Utama', note: 'a"b' }),
    ).toBe(
      '2026-09-18T00:00:00.000Z,expense,Makanan,"Cash, Utama",150000,IDR,"a""b"',
    );
  });

  it('builds header + rows joined by newlines', () => {
    expect(buildCsv([row, row])).toBe(
      `${CSV_HEADER}\n${toCsvLine(row)}\n${toCsvLine(row)}`,
    );
  });

  it('empty history is header only', () => {
    expect(buildCsv([])).toBe(CSV_HEADER);
  });
});

describe('isDeleteConfirmation — two-step gate (spec story 47)', () => {
  it('accepts the exact word', () => {
    expect(isDeleteConfirmation('HAPUS')).toBe(true);
  });

  it('accepts surrounding whitespace (typed input)', () => {
    expect(isDeleteConfirmation('  HAPUS  ')).toBe(true);
  });

  it.each(['', 'hapus', 'Hapus', 'HAPUS!', 'HAPUS AKUN', 'DELETE', 'HAPU'])(
    'rejects %p',
    (input) => {
      expect(isDeleteConfirmation(input)).toBe(false);
    },
  );

  it('exposes the confirmation word constant', () => {
    expect(DELETE_CONFIRMATION_WORD).toBe('HAPUS');
  });
});
