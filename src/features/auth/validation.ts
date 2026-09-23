/**
 * Client-side auth domain — pure functions, no React and no network.
 *
 * The two rules that matter (PRD §2.3 Epic A, revisi R2):
 *  1. Validation runs *before* any request; a failing form never touches
 *     Supabase.
 *  2. Copy is locked. These exact strings are the contract; tests assert them
 *     so a "small wording tweak" cannot silently drift from PRD.
 */

import { dictionaryFor } from '@/i18n/dictionaries';
import { id } from '@/i18n/id';
import type { Language } from '@/i18n/locale';

/** Exact user-facing copy — PRD §2.3 Epic A. Do not reword in components. */
export const authMessages = id.auth.validation;

export const PASSWORD_MIN_LENGTH = 8;

/** Field-level validation result: `undefined` means "no error". */
export type FieldErrors = {
  email?: string;
  password?: string;
  /** V0 reset-password screen only. */
  confirmPassword?: string;
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
 * Pass the active language for localised copy (C6); the default keeps the
 * locked id-ID behaviour.
 */
export function validateRegister(
  email: string,
  password: string,
  lang: Language = 'id',
): FieldErrors {
  const messages = dictionaryFor(lang).auth.validation;
  const errors: FieldErrors = {};
  const trimmedEmail = email.trim();

  if (!trimmedEmail || !password) {
    // One shared message: the design pattern does not pinpoint which field is
    // empty (DESIGN.md §6 auth pattern).
    if (!trimmedEmail) errors.email = messages.emailRequired;
    if (!password) errors.password = messages.emailRequired;
    return errors;
  }

  if (!isValidEmail(trimmedEmail)) {
    errors.email = messages.emailInvalid;
  }

  if (password.length < PASSWORD_MIN_LENGTH) {
    errors.password = messages.passwordTooShort;
  } else if (!isValidPassword(password)) {
    errors.password = messages.passwordNeedsLetterAndNumber;
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
export function loginErrorMessage(
  error: { status?: number; code?: string } | null,
  lang: Language = 'id',
): string {
  if (!error) return '';
  const messages = dictionaryFor(lang).auth.validation;

  if (error.status === 0 || error.code === 'offline') {
    return messages.networkError;
  }

  if (isEmailNotConfirmedError(error)) {
    return messages.emailNotConfirmed;
  }

  return messages.invalidCredentials;
}

/**
 * V0: Supabase rejects sign-in for unconfirmed emails with
 * `code: 'email_not_confirmed'`. The login screen uses this to offer the
 * resend path instead of the generic wrong-password copy.
 */
export function isEmailNotConfirmedError(error: { code?: string } | null): boolean {
  return error?.code === 'email_not_confirmed';
}

/** Register errors: duplicate email surfaces as a generic retry message. */
export function registerErrorMessage(
  error: { status?: number } | null,
  lang: Language = 'id',
): string {
  const messages = dictionaryFor(lang).auth.validation;
  if (error && (error.status === 0 || error.status === undefined)) {
    return messages.networkError;
  }
  return messages.signUpFailed;
}
