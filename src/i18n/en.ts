/**
 * English dictionary (C6, ADR-0008). Must satisfy `Dictionary` (the shape of
 * `id.ts`) — a missing or mistyped key is a compile error, and the parity
 * test (`__tests__/i18n-dictionary.test.ts`) rejects drift in both
 * directions. `{param}` placeholders mirror the Indonesian templates exactly.
 */
import type { Dictionary } from './id';

export const en: Dictionary = {
  common: {
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    retry: 'Please try again shortly.',
  },
  auth: {
    validation: {
      emailRequired: 'Email and password are required',
      emailInvalid: 'Invalid email',
      passwordTooShort: 'Password must be at least 8 characters',
      passwordNeedsLetterAndNumber:
        'Password must contain a letter and a number',
      invalidCredentials: 'Incorrect email or password',
      emailNotConfirmed: 'Email not confirmed. Check your inbox.',
      signUpFailed: 'Sign-up failed. Please try again shortly',
      networkError: 'Cannot connect. Check your connection',
    },
  },
  budgets: {
    state: {
      ok: 'On track',
      warning: 'Almost gone',
      exceeded: 'Exceeded',
    },
    alert: {
      warningTitle: '{categoryName} budget almost gone',
      warningBody: 'Spent {spent} of {limit} (≥80%).',
      exceededTitle: '{categoryName} budget exceeded',
      exceededBody:
        'Spent {spent} of {limit}. Cut back spending in this category this month.',
    },
    inbox: {
      warningTitle: '{categoryName} hit 80% of budget',
      exceededTitle: '{categoryName} passed 100% of budget',
    },
  },
  categories: {
    expense: {
      makanan: 'Food',
      transportasi: 'Transport',
      belanja: 'Shopping',
      tagihan: 'Bills',
      hiburan: 'Entertainment',
      kesehatan: 'Health',
      investasi: 'Investments',
      lainnya: 'Others',
    },
    income: {
      gaji: 'Salary',
      bonus: 'Bonus',
      investasi: 'Investments',
      lainnya: 'Others',
    },
  },
  connectivity: {
    offline: 'No connection',
  },
};
