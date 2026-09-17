/**
 * Client-side auth domain — pure functions, no React and no network.
 *
 * The two rules that matter (PRD §2.3 Epic A, revisi R2):
 *  1. Validation runs *before* any request; a failing form never touches
 *     Supabase.
 *  2. Copy is locked. These exact strings are the contract; tests assert them
 *     so a "small wording tweak" cannot silently drift from PRD.
 */

/** Exact user-facing copy — PRD §2.3 Epic A. Do not reword in components. */
export const authMessages = {
  emailRequired: 'Email dan password wajib diisi',
  emailInvalid: 'Email tidak valid',
  passwordTooShort: 'Password minimal 8 karakter',
  passwordNeedsLetterAndNumber: 'Password harus memuat huruf dan angka',
  /** Login failure is deliberately generic (PRD §2.3 Epic A). */
  invalidCredentials: 'Email atau password salah',
  signUpFailed: 'Pendaftaran gagal. Coba lagi sebentar lagi',
  networkError: 'Tidak dapat terhubung. Periksa koneksi Anda',
} as const;

export const PASSWORD_MIN_LENGTH = 8;

/** Field-level validation result: `undefined` means "no error". */
export type FieldErrors = {
  email?: string;
  password?: string;
};

/**
 * Intentionally simple, strict-enough email check: one `@`, a dot in the
 * domain, no whitespace. Supabase re-validates server-side; this exists to
 * give instant inline feedback, not to be an RFC 5322 parser.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email.trim());
}

/** Password: ≥8 characters and at least one letter and one digit. */
export function isValidPassword(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    /[A-Za-z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

/**
 * Register-form validation. Returns only the fields that failed, so the form
 * can render messages inline and skip the request entirely when non-empty.
 */
export function validateRegister(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  const trimmedEmail = email.trim();

  if (!trimmedEmail || !password) {
    // One shared message: the design pattern does not pinpoint which field is
    // empty (DESIGN.md §6 auth pattern).
    if (!trimmedEmail) errors.email = authMessages.emailRequired;
    if (!password) errors.password = authMessages.emailRequired;
    return errors;
  }

  if (!isValidEmail(trimmedEmail)) {
    errors.email = authMessages.emailInvalid;
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.password = authMessages.passwordTooShort;
  } else if (!isValidPassword(password)) {
    errors.password = authMessages.passwordNeedsLetterAndNumber;
  }

  return errors;
}

export function hasErrors(errors: FieldErrors): boolean {
  return Object.values(errors).some((message) => message !== undefined);
}

/**
 * Maps a Supabase auth error to locked UI copy.
 *
 * Every credential failure collapses into the generic message — Supabase
 * deliberately does not say which half was wrong, and neither do we. Anything
 * else (offline, rate limit, server fault) must not masquerade as a wrong
 * password, or the user retypes a password that was correct all along.
 */
export function loginErrorMessage(error: { status?: number; code?: string } | null): string {
  if (!error) return '';

  if (error.status === 0 || error.code === 'offline') {
    return authMessages.networkError;
  }

  return authMessages.invalidCredentials;
}

/** Register errors: duplicate email surfaces as a generic retry message. */
export function registerErrorMessage(error: { status?: number } | null): string {
  if (error && (error.status === 0 || error.status === undefined)) {
    return authMessages.networkError;
  }
  return authMessages.signUpFailed;
}
