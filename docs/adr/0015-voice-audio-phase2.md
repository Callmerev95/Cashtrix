# Voice audio Phase 2: record on device, transcribe on server, zero-day retention

Recording on the device fills the Add form, it never writes a transaction by
itself. Phase 1 (ADR-0010 + AI1–AI5) stays intact: OS-keyboard dictation sends
plain text to `parse-voice` and prefills the form. Phase 2 adds one new door
for hands-busy moments: the app records a short utterance with `expo-audio`,
uploads it to a private `voice_drafts/{userId}/` object, and a new Edge
Function `transcribe-voice` turns that audio into text, feeds it through the
same strict validation as `parse-voice`, returns a prefill, then **deletes
the audio object before returning**. One utterance yields one transaction (or
one split preview, same WG1 rules); the wallet tap and the Save tap stay
manual. No auto-save, ever.

**Locked behaviour (grill #95, owner-approved 2026-10-03, gate HIJAU TOTAL):**
transport is the private bucket (never direct-upload); the Edge contract is
`{audio} → {text}` with Gemini 3.5 Flash-Lite multimodal as the primary
engine; recording needs its own consent key
`cashtrix:voice-record-consent-v1` (device-local, outside sign-out purge)
plus OS microphone permission (`RECORD_AUDIO` on Android,
`NSMicrophoneUsageDescription` on iOS); the client caps recordings at 15
seconds / under 1MB; the record button evolves the existing `/voice`
fast-lane (no new route); confirmation follows the WG2 pattern (aggregate
`widgetSaveCopy`, boolean-only observability, no "AI" label); audio
retention is zero days — no table, no cron, object-only lifecycle deleted
server-side via service role the moment transcription succeeds.

**Considered**: direct-upload multipart/base64 to the Edge Function
(rejected, it sacrifices background retry and loses the audit trail parity
with the `receipts` pattern); a new Postgres row table for drafts (rejected,
a transient `{audio} → {text}` contract needs no rows — object lifecycle via
service role is cleaner and keeps biometric audio out of the database; future
audit rides on boolean-only `ai_prefill_ok`); auto-save on confident
transcripts (rejected, same reason as S3/ADR-0010 — a wrong guess writes
dirty data); a dedicated STT vendor now (deferred, Gemini audio is primary
with a dynamic fallback clause so this ADR does not rot if the market moves);
a new route for recording (rejected, the `/voice` fast-lane already exists
and reuse keeps one sheet, one parser, one save path).

Cost: one native module (`expo-audio`, official — never the deprecated
`expo-av`) with its own planned preview rebuild (OTA cannot deliver native
code); one private bucket with the S2 policy shape; one Edge Function reusing
the D5 rate-limit row (`transcribe-voice`, 5/min/user) and the AI1 validation
seam. Console work (preview rebuild install, Gemini audio probe) is
owner-held; code + docs are agent-held.
