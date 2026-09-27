/**
 * Scan alias (S1, ADR-0009) — the landing door for `cashtrix://scan`.
 *
 * expo-router maps the path segment to this file; it immediately hands off
 * to the Add form in scan-first mode (`scan=1`, parsed by
 * `parseScanFlag`). The photo UI that reads the flag lands in S2 — until
 * then the form behaves like a plain create, so the alias is safe to ship
 * alone. Auth + lock parking stay the gate's job (`app/_layout.tsx`): an
 * unauthenticated deep link parks at Login, never inside the form.
 *
 * WG2 (ADR-0011): forwards `source=widget` like the voice alias, so the
 * widget's scan button arms the widget save path.
 */
import { Redirect, useLocalSearchParams } from 'expo-router';

import { parseEntrySource } from '@/features/transactions';

export default function ScanAlias() {
  const params = useLocalSearchParams<{ source?: string }>();
  const href =
    parseEntrySource(params.source) === 'widget'
      ? '/add-transaction?scan=1&source=widget'
      : '/add-transaction?scan=1';
  return <Redirect href={href} />;
}
