/**
 * Recurring domain tests — the Jest seam for V3 (#32, ADR-0005).
 *
 * Pure functions: due-day last-of-month, the skip-first-cycle starts_on
 * default, the starts/ends window enumeration the RPC mirrors, labels, and
 * rule validation. Target ≥90% on the domain file.
 */
import {
  CATCHUP_CAP_PER_RULE,
  DUE_DAY_MAX,
  DUE_DAY_MIN,
  MAX_ACTIVE_RULES,
  defaultStartsOn,
  dueLabel,
  enumerateDueDates,
  formatRuleMonth,
  formatRuleWindow,
  isPaused,
  isRecurringKind,
  isRuleStatus,
  lastDayOfMonth,
  recurringMessages,
  resolveDueDate,
  statusLabel,
  validateRecurringRule,
} from '@/features/recurring';

describe('constants & guards', () => {
  it('mengunci batas produk (20 aktif, plafon 12, due 1–28)', () => {
    expect(MAX_ACTIVE_RULES).toBe(20);
    expect(CATCHUP_CAP_PER_RULE).toBe(12);
    expect(DUE_DAY_MIN).toBe(1);
    expect(DUE_DAY_MAX).toBe(28);
  });

  it('mengenali kind dan status yang valid', () => {
    expect(isRecurringKind('expense')).toBe(true);
    expect(isRecurringKind('income')).toBe(true);
    expect(isRecurringKind('transfer')).toBe(false);
    expect(isRecurringKind(null)).toBe(false);
    expect(isRuleStatus('active')).toBe(true);
    expect(isRuleStatus('paused')).toBe(true);
    expect(isRuleStatus('archived')).toBe(false);
  });
});

describe('labels', () => {
  it('memberi label due dan status', () => {
    expect(dueLabel(5, false)).toBe('Tgl 5');
    expect(dueLabel(null, true)).toBe('Akhir bulan');
    expect(dueLabel(null, false)).toBe('Tgl —');
    expect(statusLabel('active')).toBe('Aktif');
    // UI memakai "Jeda", bukan "pause" (CONTEXT.md).
    expect(statusLabel('paused')).toBe('Jeda');
    expect(isPaused({ status: 'paused' })).toBe(true);
    expect(isPaused({ status: 'active' })).toBe(false);
  });

  it('memformat bulan aturan Indonesia', () => {
    expect(formatRuleMonth('2026-09-01')).toBe('September 2026');
    expect(formatRuleMonth('2026-02-01')).toBe('Februari 2026');
    expect(formatRuleMonth('asal')).toBe('asal');
    expect(formatRuleWindow('2026-01-01', '2026-03-01')).toBe(
      'Januari 2026 – Maret 2026',
    );
    expect(formatRuleWindow('2026-01-01', null)).toBe('Mulai Januari 2026');
  });
});

describe('due-date math', () => {
  it('menghitung hari terakhir bulan (Februari tidak bolong)', () => {
    expect(lastDayOfMonth(2026, 2)).toBe(28);
    expect(lastDayOfMonth(2024, 2)).toBe(29);
    expect(lastDayOfMonth(2026, 1)).toBe(31);
    expect(lastDayOfMonth(2026, 4)).toBe(30);
  });

  it('menyelesaikan due per bulan', () => {
    expect(resolveDueDate(2026, 2, 5, false)).toBe('2026-02-05');
    expect(resolveDueDate(2026, 2, null, true)).toBe('2026-02-28');
    expect(resolveDueDate(2024, 2, null, true)).toBe('2024-02-29');
    expect(resolveDueDate(2026, 1, null, true)).toBe('2026-01-31');
  });
});

describe('enumerateDueDates (cermin jendela RPC)', () => {
  const base = {
    dueDay: 5,
    dueLast: false,
    today: new Date(2026, 8, 20),
  };

  it('melahirkan Jan–Apr dan menghormati ends_on', () => {
    expect(
      enumerateDueDates({
        ...base,
        startsOn: '2026-01-01',
        endsOn: '2026-05-01',
      }),
    ).toEqual(['2026-01-05', '2026-02-05', '2026-03-05', '2026-04-05']);
  });

  it('tidak menulis sebelum starts_on dan sesudah ends_on', () => {
    expect(
      enumerateDueDates({
        ...base,
        startsOn: '2026-02-01',
        endsOn: '2026-03-01',
      }),
    ).toEqual(['2026-02-05']);
  });

  it('tidak menulis due masa depan', () => {
    expect(
      enumerateDueDates({
        ...base,
        dueDay: 25,
        startsOn: '2026-09-01',
        endsOn: null,
      }),
    ).toEqual([]);
    expect(
      enumerateDueDates({
        ...base,
        dueDay: 10,
        startsOn: '2026-09-01',
        endsOn: null,
      }),
    ).toEqual(['2026-09-10']);
  });

  it('due-last memakai tanggal akhir tiap bulan', () => {
    expect(
      enumerateDueDates({
        ...base,
        dueDay: null,
        dueLast: true,
        startsOn: '2026-01-01',
        endsOn: '2026-04-01',
      }),
    ).toEqual(['2026-01-31', '2026-02-28', '2026-03-31']);
  });

  it('limit meniru plafon RPC (tertua dulu)', () => {
    const dues = enumerateDueDates({
      ...base,
      today: new Date(2025, 0, 15),
      startsOn: '2023-01-01',
      endsOn: '2025-01-01',
      dueDay: 3,
    });
    expect(dues).toHaveLength(24);
    const capped = enumerateDueDates({
      ...base,
      today: new Date(2025, 0, 15),
      startsOn: '2023-01-01',
      endsOn: '2025-01-01',
      dueDay: 3,
      limit: CATCHUP_CAP_PER_RULE,
    });
    expect(capped).toHaveLength(CATCHUP_CAP_PER_RULE);
    expect(capped[0]).toBe('2023-01-03');
    expect(capped[CATCHUP_CAP_PER_RULE - 1]).toBe('2023-12-03');
  });
});

describe('defaultStartsOn (skip siklus pertama)', () => {
  const today = new Date(2026, 8, 20);

  it('bulan berjalan bila due belum lewat', () => {
    expect(
      defaultStartsOn({
        currentMonthOne: '2026-09-01',
        dueDay: 25,
        dueLast: false,
        today,
      }),
    ).toBe('2026-09-01');
  });

  it('bulan depan bila due sudah lewat (tidak mengarang pembayaran lalu)', () => {
    expect(
      defaultStartsOn({
        currentMonthOne: '2026-09-01',
        dueDay: 5,
        dueLast: false,
        today,
      }),
    ).toBe('2026-10-01');
  });

  it('akhir bulan: hari-H tetap bulan ini, sesudahnya lompat', () => {
    // Due 30 Sep, hari ini 30 Sep → catch-up memang lahir hari itu, bukan skip.
    expect(
      defaultStartsOn({
        currentMonthOne: '2026-09-01',
        dueDay: null,
        dueLast: true,
        today: new Date(2026, 8, 30),
      }),
    ).toBe('2026-09-01');
    // 1 Okt → due Okt (31) belum lewat → tetap Okt.
    expect(
      defaultStartsOn({
        currentMonthOne: '2026-10-01',
        dueDay: null,
        dueLast: true,
        today: new Date(2026, 9, 1),
      }),
    ).toBe('2026-10-01');
    // Desember → Januari tahun berikutnya.
    expect(
      defaultStartsOn({
        currentMonthOne: '2026-12-01',
        dueDay: 5,
        dueLast: false,
        today: new Date(2026, 11, 20),
      }),
    ).toBe('2027-01-01');
  });
});

describe('validateRecurringRule', () => {
  const valid = {
    kind: 'expense' as const,
    walletId: 'w1',
    categoryId: 'c1',
    dueDay: 5,
    dueLast: false,
    startsOn: '2026-09-01',
    endsOn: null,
  };

  it('menerima aturan valid dan due-last', () => {
    expect(validateRecurringRule(valid)).toBeNull();
    expect(
      validateRecurringRule({ ...valid, dueDay: null, dueLast: true }),
    ).toBeNull();
    expect(
      validateRecurringRule({ ...valid, endsOn: '2026-12-01' }),
    ).toBeNull();
  });

  it('menolak kind/wallet/kategori/due yang kosong', () => {
    expect(validateRecurringRule({ ...valid, kind: null })).toBe(
      recurringMessages.kindRequired,
    );
    expect(validateRecurringRule({ ...valid, walletId: null })).toBe(
      recurringMessages.walletRequired,
    );
    expect(validateRecurringRule({ ...valid, categoryId: null })).toBe(
      recurringMessages.categoryRequired,
    );
    expect(validateRecurringRule({ ...valid, dueDay: null })).toBe(
      recurringMessages.dueRequired,
    );
    expect(validateRecurringRule({ ...valid, dueDay: 29 })).toBe(
      recurringMessages.dueRequired,
    );
    expect(validateRecurringRule({ ...valid, dueDay: 0 })).toBe(
      recurringMessages.dueRequired,
    );
  });

  it('menolak starts/ends yang bukan hari-1 atau terbalik', () => {
    expect(validateRecurringRule({ ...valid, startsOn: '' })).toBe(
      recurringMessages.startsRequired,
    );
    expect(validateRecurringRule({ ...valid, startsOn: '2026-09-15' })).toBe(
      recurringMessages.startsNotDayOne,
    );
    expect(validateRecurringRule({ ...valid, endsOn: '2026-12-15' })).toBe(
      recurringMessages.endsNotDayOne,
    );
    expect(
      validateRecurringRule({
        ...valid,
        startsOn: '2026-09-01',
        endsOn: '2026-08-01',
      }),
    ).toBe(recurringMessages.endsBeforeStarts);
  });
});
