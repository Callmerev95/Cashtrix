# Widget buttons open a fast-lane app sheet, logic stays in the app

Home-screen widgets cannot host our flows: the widget runtime (Expo Widgets on
iOS, RemoteViews on Android) has no hooks, no app state, no async work, and no
authenticated session, and voice capture needs a foreground app for the mic
anyway. So the widget holds buttons only (voice, add, scan), with no data and
no session, and each tap opens the app through an existing deep link
(`voice`, `add-transaction?type=`, `scan`) in a fast-lane presentation: no tab
bar, no navigation chrome, auto-dismiss after save. The sheet, the parser, and
the save path are the same components the in-app doors use; the in-app mic
stays as a second door. Sharing a session with a widget extension (App Groups
plus keychain) is rejected as a new security surface for zero user value.

**Locked behaviour (grill 2026-09-27, owner-approved):** one utterance splits
into at most three transactions, all of the same kind (mixed expense plus
income is refused); each row previews and can be removed before the single
confirm tap writes them all (F1a: valid rows save, failed rows return as raw
text). Success from a widget save posts a local notification ("N transaksi,
Total RpX" through the central dictionary), because the in-app snackbar is not
visible from the home screen; in-app saves keep the snackbar and gain nothing
new. Widget taps pass the full gate (auth, lock, MFA) before the sheet opens.

**Considered**: a widget-resident sheet that never opens the app (rejected, it
duplicates the sheet, the parser, and the option lists in SwiftUI/RemoteViews
plus a session bridge, three copies to drift); removing the in-app mic so the
widget is the only voice door (rejected, it punishes every user who has not
installed a widget for an exclusivity story); a balance widget (rejected for
this release, refresh plus lock-screen privacy need their own design); the
label "AI" on the widget (rejected, the parser is local rules, the claim would
be false on the store listing).

Cost: one native batch (iOS `expo-widgets` plus Android widget, long-press
voice item included). No new server work, no aggregation change.
