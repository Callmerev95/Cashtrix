/**
 * Auth domain tests (T3 / #4) — the Jest seam from PRD §Testing Decisions:
 * pure functions only, no bridge, no network.
 *
 * The copy assertions are deliberate. PRD §2.3 Epic A locks these strings, so
 * a test failure here means the UI stopped matching the product decision.
 */
import {
  PASSWORD_MIN_LENGTH,
  authMessages,
  hasErrors,
  isValidEmail,
  isValidPassword,
  loginErrorMessage,
  registerErrorMessage,
  validateRegister,
} from '@/features/auth/validation';

describe('isValidEmail', () => {
  it.each([
    'evelyn@cashtrix.app',
    'evelyn.vance@mail.co.id',
    'a@b.co',
    'evelyn+tag@cashtrix.app',
  ])('accepts %s', (email) => {
    expect(isValidEmail(email)).toBe(true);
  });

  it.each([
    '',
    'evelyn',
    'evelyn@',
    '@cashtrix.app',
    'evelyn@cashtrix',
    'evelyn @cashtrix.app',
    'evelyn@@cashtrix.app',
    'evelyn@cash trix.app',
  ])('rejects %s', (email) => {
    expect(isValidEmail(email)).toBe(false);
  });

  it('tolerates surrounding whitespace', () => {
    expect(isValidEmail('  evelyn@cashtrix.app  ')).toBe(true);
  });
});

describe('isValidPassword', () => {
  it('requires at least 8 characters', () => {
    expect(isValidPassword('abc123')).toBe(false);
    expect(isValidPassword('abc12345')).toBe(true);
    expect(PASSWORD_MIN_LENGTH).toBe(8);
  });

  it('requires both a letter and a digit', () => {
    expect(isValidPassword('abcdefgh')).toBe(false);
    expect(isValidPassword('12345678')).toBe(false);
    expect(isValidPassword('abcdefg1')).toBe(true);
  });
});

describe('validateRegister', () => {
  it('returns no errors for a valid form', () => {
    const errors = validateRegister('evelyn@cashtrix.app', 'hunter2hunter');
    expect(hasErrors(errors)).toBe(false);
    expect(errors).toEqual({});
  });

  it('reports empty fields with the shared locked message', () => {
    const errors = validateRegister('', '');
    expect(errors.email).toBe(authMessages.emailRequired);
    expect(errors.password).toBe(authMessages.emailRequired);
    expect(hasErrors(errors)).toBe(true);
  });

  it('uses the locked email copy for a malformed address', () => {
    expect(validateRegister('evelyn', 'hunter2hunter').email).toBe(
      authMessages.emailInvalid,
    );
  });

  it('uses the length message when the password is too short', () => {
    expect(validateRegister('evelyn@cashtrix.app', 'abc12').password).toBe(
      authMessages.passwordTooShort,
    );
  });

  it('uses the composition message when length passes but digits are missing', () => {
    expect(validateRegister('evelyn@cashtrix.app', 'abcdefghij').password).toBe(
      authMessages.passwordNeedsLetterAndNumber,
    );
  });

  it('trims the email before validating', () => {
    expect(validateRegister('  evelyn@cashtrix.app  ', 'hunter2hunter')).toEqual({});
  });

  it('reports both fields at once so the form renders all messages inline', () => {
    const errors = validateRegister('evelyn', 'abc');
    expect(errors.email).toBe(authMessages.emailInvalid);
    expect(errors.password).toBe(authMessages.passwordTooShort);
  });
});

describe('hasErrors', () => {
  it('is false only for a fully clean result', () => {
    expect(hasErrors({})).toBe(false);
    expect(hasErrors({ email: undefined, password: undefined })).toBe(false);
    expect(hasErrors({ email: authMessages.emailInvalid })).toBe(true);
  });
});

describe('loginErrorMessage', () => {
  it('maps any credential rejection to the generic locked message', () => {
    expect(loginErrorMessage({ status: 400, code: 'invalid_credentials' })).toBe(
      authMessages.invalidCredentials,
    );
    expect(loginErrorMessage({ status: 400, code: 'email_not_confirmed' })).toBe(
      authMessages.invalidCredentials,
    );
  });

  it('never claims "wrong password" when the request never reached the server', () => {
    // Sending the user to re-type a correct password would be the worst
    // possible advice here.
    expect(loginErrorMessage({ status: 0 })).toBe(authMessages.networkError);
    expect(loginErrorMessage({ code: 'offline' })).toBe(authMessages.networkError);
  });

  it('returns an empty message when there is no error', () => {
    expect(loginErrorMessage(null)).toBe('');
  });
});

describe('registerErrorMessage', () => {
  it('surfaces a network failure as connectivity, not as a rejected signup', () => {
    expect(registerErrorMessage({ status: 0 })).toBe(authMessages.networkError);
  });

  it('collapses duplicate email and other server faults into one retry message', () => {
    // Supabase's "User already registered" would otherwise leak account
    // existence; the generic copy keeps signup non-enumerable.
    expect(registerErrorMessage({ status: 422 })).toBe(authMessages.signUpFailed);
    expect(registerErrorMessage({ status: 500 })).toBe(authMessages.signUpFailed);
  });
});
