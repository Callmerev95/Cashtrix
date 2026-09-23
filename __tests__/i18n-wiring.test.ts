/**
 * i18n wiring tests (C6) — domain call sites render the central dictionary.
 *
 * Each helper defaults to id-ID (existing callers and their tests are
 * unaffected until they pass the active language); the `'en'` cases lock the
 * localised form.
 */
import { authMessages } from '@/features/auth/validation';
import {
  budgetStateLabel,
  budgetStateLabels,
  inboxAlertTitle,
} from '@/features/budgets/domain';
import { alertCopy } from '@/features/budgets/notifications';
import { OFFLINE_MESSAGE } from '@/features/connectivity/domain';
import { id, translateSystemCategory } from '@/i18n';

describe('central dictionary is the single source (C6)', () => {
  it('authMessages is the id.auth.validation namespace', () => {
    expect(authMessages).toBe(id.auth.validation);
  });

  it('budgetStateLabels is the id.budgets.state namespace', () => {
    expect(budgetStateLabels).toBe(id.budgets.state);
  });

  it('OFFLINE_MESSAGE is the id.connectivity.offline entry', () => {
    expect(OFFLINE_MESSAGE).toBe(id.connectivity.offline);
  });
});

describe('budget copy in both languages (C6)', () => {
  const input = {
    categoryName: 'Makanan',
    threshold: 'warning_80' as const,
    spent: 'Rp 80.000',
    limit: 'Rp 100.000',
  };

  it("alertCopy defaults to id-ID (historic behaviour)", () => {
    expect(alertCopy(input)).toEqual({
      title: 'Budget Makanan hampir habis',
      body: 'Terpakai Rp 80.000 dari Rp 100.000 (≥80%).',
    });
    expect(
      alertCopy({ ...input, threshold: 'exceeded_100' }),
    ).toEqual({
      title: 'Budget Makanan terlampaui',
      body: 'Terpakai Rp 80.000 dari Rp 100.000. Kurangi belanja kategori ini bulan ini.',
    });
  });

  it("alertCopy renders English with lang='en'", () => {
    expect(alertCopy(input, 'en')).toEqual({
      title: 'Makanan budget almost gone',
      body: 'Spent Rp 80.000 of Rp 100.000 (≥80%).',
    });
  });

  it('inboxAlertTitle + budgetStateLabel follow lang', () => {
    expect(inboxAlertTitle('Makanan', 'warning_80')).toBe(
      'Makanan menyentuh 80% budget',
    );
    expect(inboxAlertTitle('Makanan', 'exceeded_100', 'en')).toBe(
      'Makanan passed 100% of budget',
    );
    expect(budgetStateLabel('warning')).toBe('Hampir habis');
    expect(budgetStateLabel('exceeded', 'en')).toBe('Exceeded');
  });
});

describe('translateSystemCategory (C6)', () => {
  it('maps DB Indonesian names to the active language', () => {
    expect(translateSystemCategory('expense', 'Makanan', 'en')).toBe('Food');
    expect(translateSystemCategory('income', 'Gaji', 'en')).toBe('Salary');
    expect(translateSystemCategory('expense', 'Makanan')).toBe('Makanan');
  });

  it('disambiguates twin names by kind (Investasi/Lainnya)', () => {
    expect(translateSystemCategory('expense', 'Investasi', 'en')).toBe(
      'Investments',
    );
    expect(translateSystemCategory('income', 'Investasi', 'en')).toBe(
      'Investments',
    );
    expect(translateSystemCategory('expense', 'Lainnya', 'en')).toBe('Others');
  });

  it('passes user data through untouched', () => {
    expect(translateSystemCategory('expense', 'Jajan Kopi', 'en')).toBe(
      'Jajan Kopi',
    );
    expect(translateSystemCategory('income', 'Jajan Kopi')).toBe('Jajan Kopi');
  });
});
