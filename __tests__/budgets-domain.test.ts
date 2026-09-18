/**
 * Budgets domain tests (T7, issue #8) — the pure Jest seam.
 *
 * What is pinned here is the logic that is easy to get subtly wrong: the
 * 79.9/80/99.9/100 threshold boundary (which must agree with the `CASE` in
 * `v_budget_status`), the state→alert-key mapping (which must match the
 * `budget_alerts.threshold` check), and the create/update guard (expense-only,
 * 12-digit bound — the DB trigger is the backstop, this is the inline copy).
 */
import {
  budgetLimitFromInput,
  formatPercent,
  hasBudgetErrors,
  percentFor,
  ringFillFor,
  stateForPercent,
  thresholdForState,
  validateBudget,
} from '@/features/budgets/domain';
import { formatRingPercent } from '@/features/budgets/components/budget-ring';

describe('stateForPercent — threshold boundary (PRD Epic E)', () => {
  it.each([
    [0, 'ok'],
    [79.9, 'ok'],
    [80, 'warning'],
    [99.9, 'warning'],
    [100, 'exceeded'],
    [120, 'exceeded'],
  ])('%s%% → %s', (percent, expected) => {
    expect(stateForPercent(percent)).toBe(expected);
  });

  it('treats non-finite input as ok (never crashes the ring)', () => {
    expect(stateForPercent(NaN)).toBe('ok');
    expect(stateForPercent(Infinity)).toBe('ok');
  });
});

describe('percentFor', () => {
  it('computes spent/limit*100', () => {
    expect(percentFor(799000, 1000000)).toBeCloseTo(79.9, 10);
    expect(percentFor(600000, 500000)).toBeCloseTo(120, 10);
  });

  it('returns 0 for a non-positive or non-finite limit (never NaN/Infinity)', () => {
    expect(percentFor(100, 0)).toBe(0);
    expect(percentFor(100, -5)).toBe(0);
    expect(percentFor(NaN, 100)).toBe(0);
    expect(percentFor(100, NaN)).toBe(0);
  });
});

describe('thresholdForState — dedup keys (PRD §6.1 R1)', () => {
  it('maps states to alert keys, ok fires nothing', () => {
    expect(thresholdForState('ok')).toBeNull();
    expect(thresholdForState('warning')).toBe('warning_80');
    expect(thresholdForState('exceeded')).toBe('exceeded_100');
  });
});

describe('ringFillFor', () => {
  it('fills proportionally and clamps at full', () => {
    expect(ringFillFor(0)).toBe(0);
    expect(ringFillFor(50)).toBeCloseTo(0.5, 10);
    expect(ringFillFor(100)).toBe(1);
    expect(ringFillFor(150)).toBe(1);
  });

  it('returns 0 for non-positive or non-finite input', () => {
    expect(ringFillFor(-10)).toBe(0);
    expect(ringFillFor(NaN)).toBe(0);
  });
});

describe('validateBudget — create/update guard', () => {
  it('rejects a missing category', () => {
    const result = validateBudget({
      categoryId: null,
      categoryKind: null,
      amountRaw: '1.000.000',
    });
    expect(result.categoryError).toBe('Pilih kategori pengeluaran');
    expect(hasBudgetErrors(result)).toBe(true);
  });

  it('rejects income categories (expense-only)', () => {
    const result = validateBudget({
      categoryId: 'some-id',
      categoryKind: 'income',
      amountRaw: '1.000.000',
    });
    expect(result.categoryError).toBe(
      'Budget hanya untuk kategori pengeluaran',
    );
  });

  it('rejects empty, zero, and oversized amounts', () => {
    expect(
      validateBudget({
        categoryId: 'id',
        categoryKind: 'expense',
        amountRaw: '',
      }).amountError,
    ).toBe('Nominal budget wajib diisi');

    expect(
      validateBudget({
        categoryId: 'id',
        categoryKind: 'expense',
        amountRaw: '0',
      }).amountError,
    ).toBe('Nominal budget harus lebih dari 0');

    expect(
      validateBudget({
        categoryId: 'id',
        categoryKind: 'expense',
        amountRaw: '1.000.000.000.000',
      }).amountError,
    ).toContain('Nominal maksimal');
  });

  it('accepts a valid expense budget', () => {
    const result = validateBudget({
      categoryId: 'id',
      categoryKind: 'expense',
      amountRaw: '1.500.000',
    });
    expect(hasBudgetErrors(result)).toBe(false);
    expect(budgetLimitFromInput('1.500.000')).toBe(1500000);
  });
});

describe('formatting', () => {
  it('formats percent id-ID without NaN', () => {
    expect(formatPercent(79.9)).toBe('79,9%');
    expect(formatPercent(100)).toBe('100%');
    expect(formatPercent(NaN)).toBe('0%');
  });

  it('rounds the ring centre to whole percent', () => {
    expect(formatRingPercent(79.9)).toBe('80%');
    expect(formatRingPercent(120)).toBe('120%');
    expect(formatRingPercent(0)).toBe('0%');
  });
});
