/**
 * Scan alias (S1, ADR-0009) — the landing door for `cashtrix://scan`.
 *
 * expo-router maps the path segment to this file; it immediately hands off
 * to the Add form in scan-first mode (`scan=1`, parsed by
 * `parseScanFlag`). The photo UI that reads the flag lands in S2 — until
 * then the form behaves like a plain create, so the alias is safe to ship
 * alone. Auth + lock parking stay the gate's job (`app/_layout.tsx`): an
 * unauthenticated deep link parks at Login, never inside the form.
 */
import { Redirect } from 'expo-router';

export default function ScanAlias() {
  return <Redirect href="/add-transaction?scan=1" />;
}
