/**
 * Voice alias (VC3, issue #65) — the landing door for `cashtrix://voice`.
 *
 * expo-router maps the path segment to this file; it immediately hands off
 * to the Add form in voice-first mode (`voice=1`, parsed by
 * `parseVoiceFlag`). The panel that reads the flag lands in VC2 — the form
 * behaves like a plain create underneath, so the alias is safe to ship
 * alone. Auth + lock parking stay the gate's job (`app/_layout.tsx`): an
 * unauthenticated deep link parks at Login, never inside the form.
 * Pin to an OS gesture (Back Tap / Quick Tap / RegiStar) like the S1 doors.
 */
import { Redirect } from 'expo-router';

export default function VoiceAlias() {
  return <Redirect href="/add-transaction?voice=1" />;
}
