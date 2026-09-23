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
      confirmRequired: 'Password confirmation is required',
      mismatch: 'Passwords do not match',
    },
    legal: {
      loginPrefix: 'By continuing, you agree to the ',
      registerPrefix: 'By signing up, you agree to the ',
      terms: 'Terms of Service',
      and: ' and ',
      privacy: 'Privacy Policy',
    },
    login: {
      subtitle: 'Sign in to see where your money stands.',
      resend: 'Resend verification',
      submit: 'Sign in',
      toRegisterPrompt: "Don't have an account yet?",
      toRegister: 'Sign up',
      forgot: 'Forgot your password?',
    },
    register: {
      title: 'Create account',
      subtitle: 'One account for all your wallets and transactions.',
      passwordHint: 'At least {min} characters, with letters and numbers.',
      submit: 'Sign up',
      toLoginPrompt: 'Already have an account?',
      toLogin: 'Sign in',
    },
    checkEmail: {
      title: 'Check your email',
      bodyWithEmail:
        'We sent a verification link to {email}. Open it to sign in — no need to log in again on this device.',
      bodyWithoutEmail:
        "We've sent a verification link to your email. Open it, then sign in with your account.",
      invalidLink:
        'Verification link invalid or expired. Request a new one below.',
      resentOk: 'Verification link re-sent. Check your inbox.',
      resendFail: 'Re-send failed. Please try again shortly.',
      resending: 'Sending…',
      resend: 'Resend',
      toLogin: 'Verified? Sign in',
    },
    forgot: {
      title: 'Forgot Password',
      subtitle:
        "Enter your email and we'll send a link to set a new password.",
      submit: 'Send reset link',
      toLoginPrompt: 'Remember your password?',
      toLogin: 'Back to Sign in',
      success: 'If the email is registered, a reset link has been sent.',
      fail: 'Failed to send the link. Please try again shortly.',
    },
    reset: {
      verifying: 'Checking reset link…',
      doneTitle: 'Password changed',
      doneBody:
        "Your new password is saved. You're signed in — continue to the app.",
      openApp: 'Open app',
      formTitle: 'Set a New Password',
      formSubtitle:
        'Enter your new password. It must be at least 8 characters with letters and numbers.',
      newPassword: 'New Password',
      confirmPassword: 'Confirm Password',
      submit: 'Save New Password',
      linkInvalid:
        'Reset link invalid or expired. Request a new one from the Sign in screen.',
      linkMissing:
        'Open the link from the reset email to set a new password.',
      updateFail: 'Failed to change password. Please try again shortly.',
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
  dashboard: {
    greeting: {
      morning: 'Good morning',
      afternoon: 'Good afternoon',
      evening: 'Good evening',
      night: 'Good night',
    },
    notif: {
      open: 'Open Notifications',
      unread: '{count} unread notifications, open Notifications',
    },
    wallets: {
      title: 'Wallets',
      manage: 'Manage',
      emptyTitle: 'No wallets',
      emptyBody: 'Add your first wallet to start tracking cash flow.',
      emptyAction: 'Add Wallet',
      moreRest: '+{rest} more wallets · total {amount}',
    },
    history: {
      title: 'History',
      search: 'Search',
    },
  },
  connectivity: {
    offline: 'No connection',
  },
  wallets: {
    validation: {
      nameRequired: 'Wallet name is required',
      nameTooLong: 'Wallet name must be at most {max} characters',
      nameDuplicate: 'Wallet name is already used',
      amountInvalid: 'Amount must be between 0 and {max}',
      amountInvalidNumber: 'Invalid amount',
      limitReached: 'Maximum {max} wallets',
      deleteConfirm: 'Delete this wallet?',
      reassignRequired:
        'Choose a destination wallet to move transactions to',
    },
    type: {
      bank: 'Bank',
      ewallet: 'E-Wallet',
      cash: 'Cash',
      card: 'Card',
    },
    card: {
      total: 'Total Balance',
      count: '{count} wallets',
    },
    row: {
      transactions: '{count} transactions',
      balanceLabel: '{name}, balance {balance}',
    },
    list: {
      back: 'Back',
      kicker: 'Manage',
      title: 'Wallets',
      total: 'Total Balance',
      count: '{count} of {max} wallets',
      empty: 'No wallets yet. Create your first wallet to start tracking.',
      add: 'Add Wallet',
      archived: 'Archive',
      deleteFail: 'Failed to delete wallet',
      deleteTitle: 'Delete wallet?',
      deleteBody: '"{name}" has no transactions and will be permanently deleted.',
      archiveTitle: 'Archive wallet?',
      archiveBody:
        '"{name}" is hidden from the Dashboard and pickers. Transaction history is kept.',
      archiveAction: 'Archive',
      archiveFail: 'Failed to update wallet',
      archivedOk: 'Wallet archived',
      unarchivedOk: 'Wallet unarchived',
      archivedBody:
        '"{name}" is hidden from the Dashboard and new transactions. Its history is kept.',
      unarchivedBody: '"{name}" is available again.',
      archiveA11y: 'Archive {name}',
      deleteA11y: 'Delete {name}',
      unarchiveA11y: 'Unarchive {name}',
      moveFail: 'Failed to move transactions',
      moveDone: 'Done',
      moveDoneBody: '{moved} transactions moved to {name}.',
      moveToA11y: 'Move to {name}',
    },
    sheet: {
      title: 'Move transactions from {name}',
      body: 'This wallet has {count} transactions. Choose a destination wallet, then this wallet is deleted.',
      empty:
        'No other wallets. Create a new wallet first to move transactions.',
      create: 'New wallet',
    },
    form: {
      close: 'Close',
      editTitle: 'Edit wallet',
      createTitle: 'New wallet',
      name: 'Name',
      namePlaceholder: 'BCA, GoPay, Wallet…',
      type: 'Type',
      opening: 'Opening balance',
      hint: 'Maximum {max} wallets per account.',
      create: 'Create Wallet',
      saveFailEdit: 'Failed to save changes',
      saveFailCreate: 'Failed to create wallet',
      noSession: 'Session not found',
    },
    loadError: 'Failed to load wallets',
  },
};
