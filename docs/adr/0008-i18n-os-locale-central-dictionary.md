# i18n ID/EN follows the OS locale; one central dictionary

The UI language follows the OS locale via `expo-localization`, with no in-app
toggle — exactly what Epic E already promises ("body sesuai bahasa OS"). The
existing `profiles.locale` column stays a display-formatting input, not a
language override.

**Locked behaviour (grill 2026-09-23, owner-approved):** one central dictionary
`src/i18n/{id,en}.ts` with typed keys and Indonesian fallback (a missing EN key
never renders blank); completeness locked by Jest (every ID key exists in EN).
One audit pass covers all UI copy + budget notification bodies + the Indonesian
legal documents (the v1.1 debt: privacy/ToS shipped EN-only). System categories
are mapped client-side through the dictionary (no migration, no RLS change);
user data — custom categories, wallet names, notes — is never translated.
Number/date `Intl` formatting follows the active language (`id-ID`/`en-US`),
consistent with the OS-locale promise. Server-English auth errors keep the
existing client-side mapping precedent (`loginErrorMessage`).

**Considered**: in-app ID/EN toggle (rejected — an extra settings surface plus
persistence for control the OS already provides); i18next (rejected — full
pluralisation machinery is overkill for short copy, plus bundle cost);
`name_en` migration (rejected — server-side translations cost a migration plus
RLS/pgTAP for what is display-only); legal-ID as a separate pass (rejected —
re-auditing strings twice violates the one-pass rule).

Cost: `expo-localization` is a new native module, but it rides the same
deferred preview rebuild as B4's `expo-local-authentication` — one rebuild for
both modules (EAS Free quota spent once). Like B4, C6 code must degrade
gracefully when the module is absent (Expo Go). B4 must write its new strings
through this dictionary from the start, so no string is audited twice.
