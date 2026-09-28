# Google OAuth first, Apple as a locked follow-up, one email one account

Password entry on mobile is the highest-friction door in the auth gate, so
Google sign-in joins Login and Register alongside email (email stays as the
fallback). Google first, not Google-plus-Apple: the owner has no Apple
Developer Team ID (same blocker that deferred the iOS widget), and doing two
consoles in one ticket doubles the failure surface. App Store guideline 4.8
may require Sign in with Apple once a third-party login ships on iOS, so
Apple is a locked follow-up, not a rejection. One email is one account
(glossary **User**): OAuth and password identities sharing an address belong
to the same user, verified live rather than assumed. The flow reuses the V0
machinery instead of inventing a new one — `signInWithOAuth` with
`skipBrowserRedirect` returns to `cashtrix://check-email`, the existing
PKCE-code parser exchanges it, `runSeedUser` runs best-effort (the browser
consumes the return URL, so Check Email also seeds for link-tap entry that
never touches Login), and the gate, MFA, and lock behave identically for both
doors. Client deps (`expo-auth-session`, `expo-web-browser`, `expo-crypto`)
are Expo Go modules: JS-only, no rebuild, OTA-safe.

**Considered**: native Google Sign-In SDK (rejected, needs SHA-1 /
google-services config plus a dev-client rebuild for a web flow Supabase
already handles server-side); a separate OAuth callback route (rejected, the
Check Email screen already exchanges codes and seeding there closes the
link-tap gap too); Apple in the same ticket (rejected, see above).

Cost: three JS deps, one `signInWithGoogle` call, two buttons, no DDL, no
native rebuild. Console work (Google Cloud client plus consent screen,
Supabase provider enable) is owner-held.
