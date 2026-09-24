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
