/**
 * MFA domain tests (C2, #53) — the Jest seam.
 *
 * Locks: the 6-digit code shape (spaces/dashes pasted from the authenticator
 * are stripped, letters rejected), the AAL gate rule (only aal1→aal2 parks
 * the user at the challenge), and the verified-TOTP filter that drives the
 * Profile toggle.
 */
import {
  MFA_CODE_LENGTH,
  MFA_FRIENDLY_NAME,
  MFA_ISSUER,
  hasVerifiedTotp,
  needsMfaChallenge,
  normalizeMfaCode,
  qrSvgMarkup,
  validateMfaCode,
  verifiedTotpFactorId,
} from '@/features/mfa';

describe('TOTP code shape (C2)', () => {
  it('is always 6 digits', () => {
    expect(MFA_CODE_LENGTH).toBe(6);
  });

  it('issuer and friendly name are non-empty (authenticator display)', () => {
    expect(MFA_ISSUER.length).toBeGreaterThan(0);
    expect(MFA_FRIENDLY_NAME.length).toBeGreaterThan(0);
  });

  it('strips spaces and dashes pasted from the authenticator', () => {
    expect(normalizeMfaCode('123 456')).toBe('123456');
    expect(normalizeMfaCode('123-456')).toBe('123456');
    expect(normalizeMfaCode('  123456  ')).toBe('123456');
  });

  it('accepts exactly 6 digits', () => {
    expect(validateMfaCode('123456')).toBeNull();
    expect(validateMfaCode('123 456')).toBeNull();
  });

  it('rejects empty, short, long, and non-numeric codes', () => {
    expect(validateMfaCode('')).not.toBeNull();
    expect(validateMfaCode('12345')).not.toBeNull();
    expect(validateMfaCode('1234567')).not.toBeNull();
    expect(validateMfaCode('12345a')).not.toBeNull();
    expect(validateMfaCode('abcdef')).not.toBeNull();
  });
});

describe('AAL gate rule (C2)', () => {
  it('parks only aal1 → aal2 at the challenge', () => {
    expect(needsMfaChallenge('aal1', 'aal2')).toBe(true);
  });

  it('passes a fully-verified session straight to the tabs', () => {
    expect(needsMfaChallenge('aal2', 'aal2')).toBe(false);
  });

  it('passes password-only sessions (no factor enrolled)', () => {
    expect(needsMfaChallenge('aal1', 'aal1')).toBe(false);
  });

  it('never challenges on missing levels (degraded probe)', () => {
    expect(needsMfaChallenge(null, null)).toBe(false);
    expect(needsMfaChallenge(undefined, undefined)).toBe(false);
    expect(needsMfaChallenge('aal1', null)).toBe(false);
  });
});

describe('verified-TOTP filter (C2)', () => {
  const verified = { id: 'f1', status: 'verified', factor_type: 'totp' };
  const pending = { id: 'f2', status: 'unverified', factor_type: 'totp' };
  const phone = { id: 'f3', status: 'verified', factor_type: 'phone' };

  it('is on only with a verified TOTP factor', () => {
    expect(hasVerifiedTotp([verified])).toBe(true);
    expect(hasVerifiedTotp([])).toBe(false);
    // An abandoned enroll must never flip the toggle on.
    expect(hasVerifiedTotp([pending])).toBe(false);
    expect(hasVerifiedTotp([phone])).toBe(false);
    expect(hasVerifiedTotp([pending, phone])).toBe(false);
  });

  it('returns the first verified TOTP id for unenroll', () => {
    expect(verifiedTotpFactorId([pending, verified])).toBe('f1');
    expect(verifiedTotpFactorId([pending])).toBeNull();
    expect(verifiedTotpFactorId([])).toBeNull();
  });
});

describe('QR payload decode (MFA QR pass)', () => {
  const svg = '<svg/>';

  it('decodes the URL-encoded data URL Supabase returns', () => {
    expect(
      qrSvgMarkup(`data:image/svg+xml;utf-8,${encodeURIComponent(svg)}`),
    ).toBe(svg);
  });

  it('decodes a base64 data URL when the runtime provides atob', () => {
    const holder = globalThis as { atob?: (value: string) => string };
    if (typeof holder.atob !== 'function') return;
    expect(qrSvgMarkup('data:image/svg+xml;base64,PHN2Zy8+')).toBe(svg);
  });

  it('degrades to null when base64 cannot be decoded', () => {
    const holder = globalThis as { atob?: unknown };
    const original = holder.atob;
    holder.atob = undefined;
    try {
      expect(qrSvgMarkup('data:image/svg+xml;base64,PHN2Zy8+')).toBeNull();
    } finally {
      holder.atob = original;
    }
  });

  it('returns null for unreadable payloads (screen keeps its fallbacks)', () => {
    expect(qrSvgMarkup(null)).toBeNull();
    expect(qrSvgMarkup(undefined)).toBeNull();
    expect(qrSvgMarkup('')).toBeNull();
    expect(qrSvgMarkup('not-a-data-url')).toBeNull();
    expect(qrSvgMarkup('data:image/svg+xml;utf-8,')).toBeNull();
    expect(qrSvgMarkup('data:image/svg+xml;utf-8,%E0%A4%A')).toBeNull();
  });

  it('passes raw SVG markup through defensively', () => {
    expect(qrSvgMarkup(svg)).toBe(svg);
  });
});
