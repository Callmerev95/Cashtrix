# Batch polish + haptics, one preview rebuild (AI6 audio + haptics)

`expo-audio` (AI6, ADR-0015) and `expo-haptics` share one preview rebuild to
save Expo quota: two tiny native modules, one compilation, one device
re-gate. Haptics wiring: save success, undo snackbar, budget threshold,
record start/stop, AI prefill landing, lock/MFA toggles — best-effort,
never-throw, never blocking. JS polish in-batch: (c) pinned `Stack.Screen`
options for `search`/`notifications`/`voice` (deferred since D3); (d) local
View-only waveform placeholder in VoiceSheet plus a haptic on AI prefill.

**Considered**: `react-native-svg` now (rejected, the visual re-gate of 3
core charts plus a repeat device run is too costly before the AI release —
deferred to a dedicated 2.1.0 Analytics Overhaul); `react-native-reanimated`
(rejected, the stable `Animated` API plus reduce-motion support needs no
gesture-driven screen today); `expo-camera` custom viewfinder (rejected, it
is its own ticket with its own finder UX and permissions); `expo-sqlite`
OB1 outbox (rejected, it is its own release track OB1→OB2→OB3 — no
smuggling into a polish batch); search recent-queries (backlog, not this
batch).
