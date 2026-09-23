# Biometric app lock is device-local (closes OPEN-3)

App lock state lives on the device only: a local flag (SecureStore/AsyncStorage,
registered alongside `LOCAL_STORAGE_KEYS`), never a server column. No migration,
no RLS, no pgTAP for B4 — lock is per-device by nature; a new phone re-opts in.

**Locked behaviour (grill 2026-09-23, owner-approved):** opt-in toggle in Profile
(off by default); unlock via `expo-local-authentication` (biometric + OS passcode
fallback, so the app stores no secret); full-screen overlay above tabs following
the auth-gate pattern (no balances, names, or amounts visible while locked);
background → foreground grace 60s; cold start (dead process) always locks; lock
is not sign-out (Supabase session persists). Devices without enrolled biometrics
see the toggle disabled with a "register biometrics in Settings" message.

**Considered**: server-side flag (rejected — migration + RLS + cross-device sync
for a concern that is inherently local); custom in-app PIN (rejected — secret
storage liability plus a brute-force surface the OS already solves); lock
immediately on background (rejected — too chatty across OTP/authenticator hops);
mask-numbers-only overlay (rejected — leaks wallet/category metadata).

Cost: `expo-local-authentication` is a new native module, so one preview rebuild
(~10 min, OTA silent-mismatch until rebuilt — same lesson as netinfo/D4). The
rebuild is deferred by owner decision; B4 code must therefore degrade gracefully
when the module is absent (Expo Go) and never crash the JS loop.
