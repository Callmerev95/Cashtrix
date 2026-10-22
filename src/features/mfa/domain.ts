/**
 * MFA domain (C2, #53) — pure helpers only, the Jest seam.
 *
 * Supabase Auth MFA (TOTP) is server-side; nothing here touches the network,
 * so the code shape (6 digits), the AAL gate rule, and the factor filter are
 * unit-tested rather than eyeballed on device.
 */

import { dictionaryFor } from '@/i18n/dictionaries';
import type { Language } from '@/i18n/locale';

/** TOTP codes are always 6 decimal digits. */
export const MFA_CODE_LENGTH = 6;

/** Issuer shown in the authenticator app for an enrolled factor. */
export const MFA_ISSUER = 'Cashtrix';

/** Friendly name for the single TOTP factor this app manages per user. */
export const MFA_FRIENDLY_NAME = 'Cashtrix authenticator';

/** Minimal factor shape — only what the gate and the toggle read. */
export type MfaFactorSummary = {
  id: string;
  status: string;
  factor_type: string;
};

/** Strips spaces/dashes pasted from the authenticator app. */
export function normalizeMfaCode(raw: string): string {
  return raw.replace(/[\s-]+/g, '');
}

/**
 * Validates a TOTP code locally (PRD §4: validation before any request).
 * Returns the localised error message, or `null` when the code may be sent.
 */
export function validateMfaCode(
  raw: string,
  lang: Language = 'id',
): string | null {
  const messages = dictionaryFor(lang).mfa.validation;
  const code = normalizeMfaCode(raw);
  if (!code) return messages.codeRequired;
  if (!/^[0-9]+$/.test(code) || code.length !== MFA_CODE_LENGTH) {
    return messages.codeInvalid;
  }
  return null;
}

/**
 * True when the session must still pass an MFA challenge: Supabase reports
 * `nextLevel: 'aal2'` while the current level is anything below it.
 */
export function needsMfaChallenge(
  currentLevel: string | null | undefined,
  nextLevel: string | null | undefined,
): boolean {
  return nextLevel === 'aal2' && currentLevel !== 'aal2';
}

/** True when at least one verified TOTP factor exists (2FA is on). */
export function hasVerifiedTotp(factors: MfaFactorSummary[]): boolean {
  return factors.some(
    (factor) =>
      factor.factor_type === 'totp' && factor.status === 'verified',
  );
}

/** Id of the first verified TOTP factor, or `null` when 2FA is off. */
export function verifiedTotpFactorId(
  factors: MfaFactorSummary[],
): string | null {
  return (
    factors.find(
      (factor) =>
        factor.factor_type === 'totp' && factor.status === 'verified',
    )?.id ?? null
  );
}

/**
 * Extracts the SVG markup from the `data:image/svg+xml` payload Supabase
 * returns from a TOTP enroll. Both URL-encoded and base64 bodies are
 * accepted; anything unreadable returns `null` so the screen keeps its
 * `otpauth://` link + secret fallback (no QR beats a broken QR).
 */
export function qrSvgMarkup(qrCode: string | null | undefined): string | null {
  if (typeof qrCode !== 'string') return null;
  const trimmed = qrCode.trim();
  if (trimmed === '') return null;
  if (!trimmed.startsWith('data:image/svg+xml')) {
    return trimmed.includes('<svg') ? trimmed : null;
  }
  const comma = trimmed.indexOf(',');
  if (comma === -1) return null;
  const header = trimmed.slice(0, comma);
  const body = trimmed.slice(comma + 1);
  try {
    if (header.includes(';base64')) {
      const decode = (globalThis as { atob?: (value: string) => string }).atob;
      if (typeof decode !== 'function') return null;
      const xml = decode(body);
      return xml.includes('<svg') ? xml : null;
    }
    const xml = decodeURIComponent(body);
    return xml.includes('<svg') ? xml : null;
  } catch {
    // Unreadable encoding — still pass raw markup through if it is SVG.
    return body.includes('<svg') ? body : null;
  }
}
