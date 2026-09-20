/**
 * Shared V0 helper for the live `verify-*.mjs` scripts.
 *
 * With hosted `auth.email.enable_confirmations = true`, anonymous sign-ups
 * with `@cashtrix.test` addresses are rejected (`email_address_invalid` —
 * Supabase only validates deliverability when it must actually send a
 * confirmation email) and every anonymous sign-up would burn the email
 * quota. Test users are therefore provisioned through the Admin API, which
 * sends no email — exactly the flow the ticket prescribes for E2E accounts
 * ("ditandai terkonfirmasi via Admin API, bukan mematikan konfirmasi di
 * hosted").
 *
 * As a bonus this live-tests the V0 gate itself: the freshly created user
 * starts unconfirmed, so the first sign-in must fail with
 * `email_not_confirmed`, and only succeeds after the Admin confirm.
 */
import { createClient } from '@supabase/supabase-js';

/** Builds the service-role client, or throws with a clear message. */
export function requireAdminClient(supabaseUrl, serviceRoleKey) {
  if (!serviceRoleKey) {
    throw new Error(
      'SUPABASE_SERVICE_ROLE_KEY harus di-set (provisi akun uji via Admin API)',
    );
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Creates `email` unconfirmed via the Admin API, proves the hosted gate
 * rejects its sign-in, confirms it, and signs `client` in — so subsequent
 * calls run under that user's RLS scope. Returns the user id.
 */
export async function provisionTestUser(admin, client, { email, password, check, tag }) {
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: false,
  });
  if (created.error) throw created.error;
  const userId = created.data.user.id;
  check(`${tag} dibuat via Admin API (unconfirmed)`, true);

  const denied = await client.auth.signInWithPassword({ email, password });
  check(
    `${tag} login sebelum konfirmasi ditolak (email_not_confirmed)`,
    denied.error?.code === 'email_not_confirmed',
    denied.error?.code ?? 'malah bersesi?!',
  );

  const { error: confirmError } = await admin.auth.admin.updateUserById(userId, {
    email_confirm: true,
  });
  check(`${tag} dikonfirmasi via Admin API`, !confirmError, confirmError?.message);

  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  check(`${tag} login pasca-konfirmasi bersesi`, Boolean(signIn.data.session));

  return userId;
}
