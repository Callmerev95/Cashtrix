/**
 * Savings domain tests (SV2) — the pure seam locked by
 * `specs/cashtrix-savings.md`: percent/ring math, status boundaries, the
 * 30-day estimate rule, create-vs-edit date validation, sorting and the
 * wallet-derived lists.
 */
import { AMOUNT_MAX } from '@/features/wallets';
import {
  MASKED_SAVINGS_PERCENT,
  availableWallets,
  dateLabel,
  daysUntil,
  estimatePerMonth,
  formatTargetDate,
  hasSavingsErrors,
  hiddenGoalCount,
  normalizeSavingsName,
  pickDashboardGoal,
  progressPercent,
  remainingAmount,
  ringFillFor,
  savingsStatus,
  sortSavingsGoals,
  validateSavingsGoal,
  type SavingsGoal,
} from '@/features/savings';

function goal(partial: Partial<SavingsGoal> = {}): SavingsGoal {
  return {
    id: partial.id ?? 'g1',
    userId: partial.userId ?? 'u1',
    walletId: partial.walletId ?? 'w1',
    name: partial.name ?? null,
    targetAmount: partial.targetAmount ?? 1_000_000,
    targetDate: partial.targetDate ?? null,
    createdAt: partial.createdAt ?? '2026-10-01T00:00:00.000Z',
  };
}

const TODAY = new Date(2026, 9, 21);

describe('progressPercent + ringFillFor', () => {
  it('menghitung persen dari saldo dan target', () => {
    expect(progressPercent(0, 500)).toBe(0);
    expect(progressPercent(1_000_000, 0)).toBe(0);
    expect(progressPercent(1_000_000, 500_000)).toBe(50);
    expect(progressPercent(1_000_000, 1_000_000)).toBe(100);
    expect(progressPercent(1_000_000, 1_200_000)).toBe(120);
  });

  it('tidak pernah NaN/Infinity atau negatif', () => {
    expect(progressPercent(Number.NaN, 100)).toBe(0);
    expect(progressPercent(100, Number.POSITIVE_INFINITY)).toBe(0);
    expect(progressPercent(1_000, -200)).toBe(0);
  });

  it('clamp fill ring ke 0..1', () => {
    expect(ringFillFor(0)).toBe(0);
    expect(ringFillFor(50)).toBe(0.5);
    expect(ringFillFor(120)).toBe(1);
    expect(ringFillFor(-10)).toBe(0);
    expect(ringFillFor(Number.NaN)).toBe(0);
  });
});

describe('savingsStatus', () => {
  it('achieved didahulukan walau tanggal sudah lewat', () => {
    expect(
      savingsStatus(goal({ targetAmount: 100, targetDate: '2026-10-01' }), 100, TODAY),
    ).toBe('achieved');
  });

  it('overdue bila belum tercapai dan tanggal lewat', () => {
    expect(
      savingsStatus(goal({ targetAmount: 100, targetDate: '2026-10-20' }), 90, TODAY),
    ).toBe('overdue');
  });

  it('active tanpa tanggal atau saat tanggal hari ini/masa depan', () => {
    expect(savingsStatus(goal({ targetDate: null }), 10, TODAY)).toBe('active');
    expect(savingsStatus(goal({ targetDate: '2026-10-21' }), 10, TODAY)).toBe(
      'active',
    );
    expect(savingsStatus(goal({ targetDate: '2026-10-22' }), 10, TODAY)).toBe(
      'active',
    );
  });
});

describe('daysUntil + labels + target date', () => {
  it('menghitung hari kalender, termasuk 29/30', () => {
    expect(daysUntil('2026-11-19', TODAY)).toBe(29);
    expect(daysUntil('2026-11-20', TODAY)).toBe(30);
    expect(daysUntil('2026-10-21', TODAY)).toBe(0);
    expect(daysUntil('2026-10-20', TODAY)).toBe(-1);
    expect(daysUntil(null, TODAY)).toBeNull();
    expect(daysUntil('2026-02-30', TODAY)).toBeNull();
  });

  it('merender label tanggal lokal', () => {
    expect(dateLabel('2026-10-21', TODAY)).toBe('Hari ini');
    expect(dateLabel('2026-10-24', TODAY)).toBe('3 hari lagi');
    expect(dateLabel('2026-10-20', TODAY)).toBe('Lewat target');
    expect(dateLabel('2026-10-24', TODAY, 'en')).toBe('3 days left');
    expect(dateLabel(null, TODAY)).toBeNull();
  });

  it('format tanggal mengikuti bahasa', () => {
    expect(formatTargetDate('2026-10-21', 'id')).toBe('21 Okt 2026');
    expect(formatTargetDate('2026-10-21', 'en')).toBe('Oct 21, 2026');
    expect(formatTargetDate(null, 'id')).toBeNull();
    expect(formatTargetDate('2026-02-30', 'id')).toBeNull();
  });
});

describe('remainingAmount + estimatePerMonth', () => {
  it('remaining tidak negatif', () => {
    expect(remainingAmount(1_000, 400)).toBe(600);
    expect(remainingAmount(1_000, 1_500)).toBe(0);
    expect(remainingAmount(Number.NaN, 10)).toBe(0);
  });

  it('estimasi hanya untuk active, bertanggal, >= 30 hari, dan masih kurang', () => {
    expect(
      estimatePerMonth(goal({ targetDate: '2026-11-19' }), 0, TODAY),
    ).toBeNull();
    expect(
      estimatePerMonth(goal({ targetDate: '2026-11-20' }), 0, TODAY),
    ).toBe(1_000_000);
    expect(
      estimatePerMonth(
        goal({ targetAmount: 100_000, targetDate: '2026-12-05' }),
        0,
        TODAY,
      ),
    ).toBe(67_000);
  });

  it('null saat achieved, lewat target, tanpa tanggal, atau sudah cukup', () => {
    expect(
      estimatePerMonth(
        goal({ targetAmount: 100_000, targetDate: '2026-12-05' }),
        100_000,
        TODAY,
      ),
    ).toBeNull();
    expect(
      estimatePerMonth(
        goal({ targetAmount: 100_000, targetDate: '2026-10-01' }),
        0,
        TODAY,
      ),
    ).toBeNull();
    expect(estimatePerMonth(goal(), 0, TODAY)).toBeNull();
    expect(
      estimatePerMonth(
        goal({ targetAmount: 100_000, targetDate: '2026-12-05' }),
        150_000,
        TODAY,
      ),
    ).toBeNull();
  });
});

describe('validateSavingsGoal', () => {
  const valid = {
    walletId: 'w1',
    name: '  Dana darurat  ',
    targetAmountRaw: '1.500.000',
    targetDate: null,
  };

  it('menerima input valid dan menormalkan nama', () => {
    expect(validateSavingsGoal(valid, { today: TODAY })).toEqual({
      walletId: null,
      targetAmount: null,
      name: null,
      targetDate: null,
    });
    expect(normalizeSavingsName('  Dana darurat  ')).toBe('Dana darurat');
    expect(normalizeSavingsName('   ')).toBeNull();
  });

  it('dompet wajib saat create', () => {
    expect(
      validateSavingsGoal({ ...valid, walletId: null }, { today: TODAY })
        .walletId,
    ).toBe('Pilih dompet');
  });

  it('nominal wajib, > 0, valid, dan <= AMOUNT_MAX', () => {
    const errors = (targetAmountRaw: string) =>
      validateSavingsGoal({ ...valid, targetAmountRaw }, { today: TODAY })
        .targetAmount;
    expect(errors('')).toBe('Nominal target wajib diisi');
    expect(errors('abc')).toBe('Nominal target tidak valid');
    expect(errors('0')).toBe('Nominal target harus lebih dari 0');
    expect(errors('-5.000')).toBe('Nominal target harus lebih dari 0');
    expect(errors(String(AMOUNT_MAX))).toBeNull();
    expect(errors(String(AMOUNT_MAX + 1))).toBe('Nominal maksimal 999999999999');
  });

  it('nama trim <= 60 karakter, kosong legal', () => {
    expect(
      validateSavingsGoal({ ...valid, name: '   ' }, { today: TODAY }).name,
    ).toBeNull();
    expect(
      validateSavingsGoal({ ...valid, name: 'a'.repeat(60) }, { today: TODAY })
        .name,
    ).toBeNull();
    expect(
      validateSavingsGoal({ ...valid, name: 'a'.repeat(61) }, { today: TODAY })
        .name,
    ).toBe('Nama target maksimal 60 karakter');
  });

  it('menolak tanggal baru di masa lalu, tetapi menerima tanggal lama saat edit', () => {
    expect(
      validateSavingsGoal(
        { ...valid, targetDate: '2026-10-20' },
        { today: TODAY },
      ).targetDate,
    ).toBe('Tanggal target tidak boleh di masa lalu');
    expect(
      validateSavingsGoal(
        { ...valid, targetDate: '2026-10-20' },
        { today: TODAY, originalDate: '2026-10-20' },
      ).targetDate,
    ).toBeNull();
    expect(
      validateSavingsGoal(
        { ...valid, targetDate: '2026-10-21' },
        { today: TODAY },
      ).targetDate,
    ).toBeNull();
    expect(
      validateSavingsGoal(
        { ...valid, targetDate: '2026-02-30' },
        { today: TODAY },
      ).targetDate,
    ).toBe('Tanggal target tidak valid');
  });

  it('menerjemahkan copy validasi (C6)', () => {
    const errors = validateSavingsGoal(
      { walletId: null, name: '', targetAmountRaw: '', targetDate: null },
      { today: TODAY, language: 'en' },
    );
    expect(errors.walletId).toBe('Pick a wallet');
    expect(errors.targetAmount).toBe('Target amount is required');
    expect(hasSavingsErrors(errors)).toBe(true);
  });
});

describe('sorting + wallet-derived lists', () => {
  const near = goal({
    id: 'near',
    targetDate: '2026-10-25',
    createdAt: '2026-10-02T00:00:00.000Z',
  });
  const far = goal({
    id: 'far',
    targetDate: '2026-12-01',
    createdAt: '2026-10-01T00:00:00.000Z',
  });
  const undated = goal({
    id: 'undated',
    targetDate: null,
    createdAt: '2026-10-01T00:00:00.000Z',
  });
  const tie = goal({
    id: 'tie',
    targetDate: '2026-10-25',
    createdAt: '2026-10-01T00:00:00.000Z',
  });

  it('tanggal terdekat dulu, null terakhir, lalu created_at', () => {
    expect(
      sortSavingsGoals([undated, far, tie, near]).map((entry) => entry.id),
    ).toEqual(['tie', 'near', 'far', 'undated']);
    expect(pickDashboardGoal([])).toBeNull();
    expect(pickDashboardGoal([undated, far])?.id).toBe('far');
  });

  const wallets = [
    {
      id: 'w1',
      name: 'Bank',
      type: 'bank' as const,
      openingBalance: 0,
      balance: 500_000,
      transactionCount: 0,
      archivedAt: null,
    },
    {
      id: 'w2',
      name: 'Lama',
      type: 'cash' as const,
      openingBalance: 0,
      balance: 0,
      transactionCount: 0,
      archivedAt: '2026-10-01T00:00:00.000Z',
    },
    {
      id: 'w3',
      name: 'Cash',
      type: 'cash' as const,
      openingBalance: 0,
      balance: 0,
      transactionCount: 0,
      archivedAt: null,
    },
  ];

  it('hidden count hanya Dompet arsip; available hanya aktif tanpa goal', () => {
    const goals = [goal({ walletId: 'w1' }), goal({ id: 'g2', walletId: 'w2' })];
    expect(hiddenGoalCount(goals, [wallets[1]])).toBe(1);
    expect(hiddenGoalCount(goals, [])).toBe(0);
    expect(availableWallets([wallets[0], wallets[2]], goals).map((w) => w.id)).toEqual(
      ['w3'],
    );
  });
});

describe('mask', () => {
  it('persen tersamar memakai konstanta yang disepakati', () => {
    expect(MASKED_SAVINGS_PERCENT).toBe('••%');
  });
});
