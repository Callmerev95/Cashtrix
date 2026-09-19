# Native modules allowed from v1.1; Expo Go stays the JS loop

Until v1.0 every native module was refused (R5.4 date picker, T6/T7 charts as
plain `View`s) so the app ran in Expo Go. Sentry crash reporting and (later)
biometric lock cannot. From v1.1 a development client is allowed for features
that actually need native code; day-to-day JS work still uses Expo Go. Native
folders stay gitignored (Continuous Native Generation).

**Considered**: stay Expo-Go-only through v1.1. Rejected — crash-free ≥99.5% is
a v1.0 KPI and is currently unmeasured.

Cost: local `npx expo run:ios`/`android` is free. EAS Free tier is 15 iOS + 15
Android cloud builds per month. Apple $99/year and Play $25 once are store fees,
not Expo fees.
