# SVG charts + widget polish, one preview rebuild (2.1.0 PR1)

`react-native-svg` (15.15.4, pinned from `expo/bundledNativeModules.json`
SDK 57) renders the three View-only charts as real arcs: analytics donut +
bar plus the budget ring. This cashes the cheque ADR-0016 wrote when it
deferred svg out of the haptics batch to "a dedicated 2.1.0 Analytics
Overhaul": one dep, one compilation, one visual re-gate.

**Considered**: per-slice `<Path>` wedges (rejected, the old mask/rotor
math with its 180° split has no svg equivalent worth keeping — a stroked
`<Circle>` with a dash gap produces the same `[start, start + sweep]`
geometry with the 1° edge gap and the ≤3°/lone-pie gapless rule intact);
`expo-linear-gradient` kept for bars (rejected, one fill system per chart —
the bar gradient moves into `<Defs>` so the bar is one element); svg
`<Filter>`/blur glow (rejected, filter support is uneven and 30 bars ×
blur risks the p95 budget — the glow is a low-opacity underlay arc on
the donut/ring and the existing View shadow around each bar); QR renderer
(rejected, out of scope — enroll stays link + selectable secret).

Widget polish rides the same rebuild (EAS quota + device cycle are the
same reason AI6+haptics shared one): icon ring + per-card chevron + a
taller gold middle card + header icon ring, all shape-XML (no new dep,
no data/session — ADR-0011 stays closed). Bitmap artwork from the
reference (waveform, watermark, receipt graphic, blur glow) is explicitly
**not** this rebuild: RemoteViews cannot blur or custom-draw, so that is
a density-bucketed PNG-asset ticket (LW) with its own launcher matrix.

**Consequences**: Expo Go / old preview builds render the JS but not the
native svg (same degrade shape as B4/C2/D4); OTA after the rebuild is
normal again. Jest covers structure via a host-View stand-in
(`__tests__/mocks/react-native-svg.js`); pixels are the Redmi device
gate's job (uninstall-first: the widget instance locks its layout).
