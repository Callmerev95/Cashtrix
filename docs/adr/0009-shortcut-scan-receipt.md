# OS-level shortcuts + receipt scan in two phases (v1.2 scope)

Back-tap is an OS gesture, not an app feature: iOS Back Tap (double/triple), Pixel
Quick Tap (double, unlocked only), Samsung Good Lock + RegiStar (double/triple), and
most MIUI devices (no system triple) cannot be intercepted reliably from inside the app
without an Accessibility Service — a sensitive permission with strict store review and
no Expo-friendly path. The app therefore exposes **doors, not detectors**: deep links
`cashtrix://add-transaction?type=` and `cashtrix://scan` plus launcher App Shortcuts,
with a one-page guide for pinning them to the OS gesture. Auth gate + lock overlay stay
the only parking logic; shortcuts never bypass them.

Receipt scanning ships in two phases. Phase 1 is a **photo attachment only** (no OCR)
using the already-installed `expo-image-picker` (zero rebuild, OTA safe): private
`receipts/{userId}/` bucket, `transaction_receipts` table with nullable `transaction_id`
so a photo can predate its transaction, 30-day retention mirroring soft-delete, then
purge (row + object). Phase 2 is a **server-side OCR experiment** (`scan-receipt` Edge
Function, D5-style rate limit ~5/min/user): JWT first, OCR, delete the temp file, return
`{ amount, occurred_on, merchant, category_suggestion, confidence }` as **prefill-only**
(one total, category suggestion optional, manual save always). OCR failure never blocks
manual entry. Engine choice (Tesseract vs Cloud Vision) is deferred to execution — both
live server-side, so no native OCR module is needed.

**Considered**: in-app tap detector / Accessibility Service (rejected — fragmented across
vendors, store risk); `expo-camera` custom viewfinder now (rejected — no value while the
flow is manual attachment); on-device ML Kit / Vision now (rejected — heaviest native
cost before accuracy on Indonesian receipts is proven); auto-save on high confidence
(rejected — dirty data without a tap); per-item split (rejected — separate parser).

Cost: S1+S2 add no native module. S3 adds one Edge Function; camera permission strings
+ Data Safety update ride with it. v2.0 stays a separate track; its sync spec later
covers `transaction_receipts` as an outbox queue type.
