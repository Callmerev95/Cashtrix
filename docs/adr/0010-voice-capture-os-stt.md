# Voice capture with OS speech recognition, prefill only (Catat Suara)

Speech input fills the Add form, it never writes a transaction by itself. The
OS owns speech-to-text (Google Speech Services on Android, Apple Speech on
iOS): the app opens the OS recognizer, receives plain text back, runs a local
rule parser over that text, and prefills the form. The user checks the sheet,
picks the wallet (1st tap) and taps Save (2nd tap). A failed listen or a failed
parse falls back to manual typing. Audio never reaches our servers and we store
no recording.

**Locked behaviour (grill 2026-09-27, owner-approved):** one utterance yields
one transaction. An utterance with two amounts ("nasi padang 30rb dan kopi
12rb") is refused with a message that asks for one item at a time. The parser
reads digit amounts with ID suffixes only (`30.000`, `30 ribu`, `25rb`,
`Rp30.000`, reusing the S3 parser); full number words ("tiga puluh ribu",
"setengah juta") are refused honestly with a fallback to typing. Expense is
the default type; a small ID keyword list detects income ("gaji", "gajian",
"dapat", "masuk", "terima"); `transfer` is refused over voice and directed to
the form. A wallet name heard in the utterance becomes the preselected picker
value; a category hint becomes the preselected category. Both pickers stay on
screen and the user can change them. Success uses the app snackbar pattern, no
system notification. Entry v1 is OTA only: a mic button in the Add form plus a
`cashtrix://voice` deep link with a guide row, pinnable to an OS gesture like
the S1 doors. No launcher long-press item in this release.

**Considered**: record-and-upload audio to an Edge Function for server-side
transcription (rejected, it costs an upload path plus a recorder module and
creates a larger privacy surface than using the OS recognizer); auto-save on
confident parses (rejected, same reason as S3, a wrong guess writes dirty
data); one utterance split into N transactions (rejected for v1, it needs N
idempotency keys plus N-row undo and per-row Spent handling, a feature of its
own); full Indonesian number words in v1 (rejected, hundreds and fractions
like "seribu" or "setengah juta" are a separate parser); launcher long-press
item now (rejected, it needs a manifest change and a binary rebuild, it waits
for the next native batch with the widget); modal success plus system
notification (rejected, two new surfaces for the same fact the snackbar
already reports, and push stays a v2.0 track).

Cost: no new native module. Speech input stays with the OS vendors
(keyboard microphone or typed text); dictated text sent to the
`parse-voice` Edge Function is processed by Gemini as a temporary
suggestion (prefill only, no transaction saved, logs carry codes only).
Receipt photos sent to `scan-receipt` are processed by Gemini the same
way. Data Safety lists Supabase (storage), Sentry (crash), and Gemini
(temporary Phase 1 suggestion) as processors. All copy goes through the
central dictionary (ADR-0008), ID first.
