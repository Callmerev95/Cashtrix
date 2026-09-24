/**
 * MFA side effects (C2, #53) — thin wrappers over `supabase.auth.mfa`.
 *
 * Copy and code shape live in `./domain.ts` (the Jest seam); this module only
 * moves bytes. Every function throws the Supabase error so screens can render
 * it — same contract as `src/features/auth/api.ts`.
 */
import { supabase } from '@/supabase';

import {
  MFA_FRIENDLY_NAME,
  MFA_ISSUER,
  normalizeMfaCode,
  type MfaFactorSummary,
} from './domain';

export type AssuranceLevel = {
  currentLevel: string | null;
  nextLevel: string | null;
};

export type TotpEnrollment = {
  factorId: string;
  /** Raw SVG data-URL (`data:image/svg+xml;…`) — see header note in enroll screen. */
  qrCode: string;
  secret: string;
  uri: string;
};

/** All factors on the caller (verified and pending) + the verified TOTP set. */
export async function listMfaFactors(): Promise<{
  all: MfaFactorSummary[];
  totp: MfaFactorSummary[];
}> {
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) throw error;
  return {
    all: (data.all ?? []) as MfaFactorSummary[],
    totp: (data.totp ?? []) as MfaFactorSummary[],
  };
}

/**
 * Starts a TOTP enrollment. The factor stays `unverified` until
 * `verifyTotpCode` accepts a code for it — an abandoned enroll never turns
 * 2FA on, and the caller should unenroll it on cancel so no orphan lingers.
 */
export async function enrollTotp(): Promise<TotpEnrollment> {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp',
    friendlyName: MFA_FRIENDLY_NAME,
    issuer: MFA_ISSUER,
  });
  if (error) throw error;
  if (data.totp === undefined || data.totp === null) {
    throw new Error('Enroll TOTP tidak mengembalikan data');
  }
  return {
    factorId: data.id,
    qrCode: data.totp.qr_code,
    secret: data.totp.secret,
    uri: data.totp.uri,
  };
}

/**
 * Verifies a 6-digit code for a factor (enroll confirmation AND login
 * challenge share this path — `challengeAndVerify` runs both round-trips).
 * Resolves once the session is upgraded; the auth gate then routes.
 */
export async function verifyTotpCode(
  factorId: string,
  rawCode: string,
): Promise<void> {
  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code: normalizeMfaCode(rawCode),
  });
  if (error) throw error;
}

/** Removes a factor (unenroll from Profile, or orphan cleanup on cancel). */
export async function unenrollMfaFactor(factorId: string): Promise<void> {
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) throw error;
}

/**
 * Current vs required assurance level. Never throws — a failing probe
 * (offline, Jest, revoked token) degrades to aal1/aal1 so the gate treats
 * the session as fully authenticated rather than stranding the user.
 */
export async function fetchAssuranceLevel(): Promise<AssuranceLevel> {
  try {
    const { data, error } =
      await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return { currentLevel: 'aal1', nextLevel: 'aal1' };
    return {
      currentLevel: data.currentLevel ?? 'aal1',
      nextLevel: data.nextLevel ?? 'aal1',
    };
  } catch {
    return { currentLevel: 'aal1', nextLevel: 'aal1' };
  }
}
