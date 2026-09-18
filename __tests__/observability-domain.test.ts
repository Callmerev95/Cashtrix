/**
 * Observability domain tests (T10, issue #11) — the pure Jest seam.
 *
 * What is pinned here is the ticket's load-bearing guarantee (PRD §4.4):
 * no financial data (`amount`/`note`/spent/limits) may leave the device in
 * an analytics payload, plus the exact shape of the three contracted events
 * (`screen_view`, `tx_created`, `budget_threshold_reached`).
 */
import {
  budgetThresholdEvent,
  containsFinancialData,
  screenNameFromSegments,
  screenViewEvent,
  scrubValue,
  txCreatedEvent,
} from '@/features/observability/domain';

describe('scrubValue — financial fields never leave the device', () => {
  it('redacts amount and note, keeps coarse facts', () => {
    const scrubbed = scrubValue({
      type: 'expense',
      amount: 250000,
      note: 'Kopi pagi',
      walletId: 'w-1',
    }) as Record<string, unknown>;

    expect(scrubbed.type).toBe('expense');
    expect(scrubbed.walletId).toBe('w-1');
    expect(scrubbed.amount).toBe('[redacted]');
    expect(scrubbed.note).toBe('[redacted]');
  });

  it('matches keys case-insensitively and across naming styles', () => {
    const scrubbed = scrubValue({
      Amount: 1,
      amountLimit: 2,
      amount_limit: 3,
      opening_balance: 4,
      spent: 5,
      BALANCE: 6,
      screen: 'analytics',
    }) as Record<string, unknown>;

    for (const key of [
      'Amount',
      'amountLimit',
      'amount_limit',
      'opening_balance',
      'spent',
      'BALANCE',
    ]) {
      expect(scrubbed[key]).toBe('[redacted]');
    }
    expect(scrubbed.screen).toBe('analytics');
  });

  it('scrubs nested objects and arrays', () => {
    const scrubbed = scrubValue({
      budgets: [{ categoryId: 'c-1', spent: 90000, amountLimit: 100000 }],
      note: 'nested',
    }) as {
      budgets: Record<string, unknown>[];
      note: unknown;
    };

    expect(scrubbed.budgets[0]?.categoryId).toBe('c-1');
    expect(scrubbed.budgets[0]?.spent).toBe('[redacted]');
    expect(scrubbed.budgets[0]?.amountLimit).toBe('[redacted]');
    expect(scrubbed.note).toBe('[redacted]');
  });
});

describe('containsFinancialData — the AC#6 assertion helper', () => {
  it.each([
    [{ amount: 100 }],
    [{ note: 'x' }],
    [{ nested: { spent: 1 } }],
    [[{ amountLimit: 5 }]],
  ])('detects financial data in %o', (payload) => {
    expect(containsFinancialData(payload)).toBe(true);
  });

  it.each([
    [{ type: 'expense', has_note: false }],
    [{ screen: 'analytics' }],
    [{ threshold: 80, month: '2026-09-01', category_id: 'c-1' }],
  ])('passes clean payloads like %o', (payload) => {
    expect(containsFinancialData(payload)).toBe(false);
  });
});

describe('screenNameFromSegments — stable screen taxonomy', () => {
  it.each<[string[], string]>([
    [[ '(tabs)', 'index' ], 'index'],
    [[ '(tabs)', 'analytics' ], 'analytics'],
    [[ '(tabs)', 'budgets' ], 'budgets'],
    [[ '(tabs)', 'profile' ], 'profile'],
    [[ 'add-transaction' ], 'add_transaction'],
    [[ '(auth)', 'login' ], 'login'],
  ])('%o → %s', (segments, expected) => {
    expect(screenNameFromSegments(segments)).toBe(expected);
  });

  it('falls back to unknown for empty or group-only segments', () => {
    expect(screenNameFromSegments([])).toBe('unknown');
    expect(screenNameFromSegments(['(tabs)'])).toBe('unknown');
  });
});

describe('event builders — contracted shapes, no raw amounts', () => {
  it('screen_view carries only the screen name', () => {
    const event = screenViewEvent('analytics');
    expect(event).toEqual({
      name: 'screen_view',
      params: { screen: 'analytics' },
    });
    expect(containsFinancialData(event)).toBe(false);
  });

  it('tx_created carries kind + hasNote, never amount/note text', () => {
    const event = txCreatedEvent({ type: 'expense', hasNote: true });
    expect(event).toEqual({
      name: 'tx_created',
      params: { type: 'expense', has_note: true },
    });
    expect(containsFinancialData(event)).toBe(false);
  });

  it.each([80, 100] as const)(
    'budget_threshold_reached accepts threshold %i without spent/limit',
    (threshold) => {
      const event = budgetThresholdEvent({
        threshold,
        month: '2026-09-01',
        categoryId: 'c-1',
      });
      expect(event).toEqual({
        name: 'budget_threshold_reached',
        params: {
          threshold,
          month: '2026-09-01',
          category_id: 'c-1',
        },
      });
      expect(containsFinancialData(event)).toBe(false);
    },
  );

  it('budget_threshold_reached rejects unknown thresholds', () => {
    expect(() =>
      budgetThresholdEvent({
        threshold: 50,
        month: '2026-09-01',
        categoryId: 'c-1',
      }),
    ).toThrow();
  });
});
