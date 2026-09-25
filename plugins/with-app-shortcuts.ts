/**
 * Launcher App Shortcuts (S1, ADR-0009) — build-time config plugin, zero
 * runtime dependency.
 *
 * Long-press on the app icon offers Tambah Expense / Tambah Income / Scan
 * Struk. Each entry fires a plain `VIEW` intent at a deep link the app
 * already owns (`cashtrix://add-transaction?type=` / `cashtrix://scan`),
 * so expo-router routes them exactly like a tapped link — including the
 * auth-gate + lock parking (a shortcut never bypasses security).
 *
 * Android is manifest-only: `shortcuts.xml` + a `<meta-data>` pointer on
 * the launcher activity, plus a sidecar `values` file for the labels (a
 * separate file so the plugin never parses the project's `strings.xml`).
 *
 * iOS ships static `UIApplicationShortcutItems` only. Static items launch
 * the app but per-item routing needs an AppDelegate handler — deliberately
 * deferred (string-patching AppDelegate is brittle for this ticket's
 * budget); until then a long-press item opens the app at its default
 * route with the gate still applied. The owner runs Android, so the
 * deferred half blocks nothing.
 *
 * Manifest changes need a binary: this plugin takes effect on the next
 * preview rebuild (lesson D4/B4), never via OTA.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  withAndroidManifest,
  withDangerousMod,
  withInfoPlist,
  type ConfigPlugin,
} from 'expo/config-plugins';

const SHORTCUTS_XML = 'cashtrix_shortcuts';
const LABELS_XML = 'cashtrix_shortcuts_strings';

type ShortcutDef = {
  id: string;
  labelKey: string;
  label: string;
  uri: string;
};

const SHORTCUTS: ShortcutDef[] = [
  {
    id: 'expense',
    labelKey: 'shortcut_expense',
    label: 'Tambah Expense',
    uri: 'cashtrix://add-transaction?type=expense',
  },
  {
    id: 'income',
    labelKey: 'shortcut_income',
    label: 'Tambah Income',
    uri: 'cashtrix://add-transaction?type=income',
  },
  {
    id: 'scan',
    labelKey: 'shortcut_scan',
    label: 'Scan Struk',
    uri: 'cashtrix://scan',
  },
];

function shortcutsXml(packageName: string): string {
  const entries = SHORTCUTS.map(
    (shortcut) => `  <shortcut
    android:shortcutId="${shortcut.id}"
    android:enabled="true"
    android:icon="@mipmap/ic_launcher"
    android:shortcutShortLabel="@string/${shortcut.labelKey}">
    <intent
      android:action="android.intent.action.VIEW"
      android:data="${shortcut.uri}"
      android:targetPackage="${packageName}"
      android:targetClass="${packageName}.MainActivity" />
  </shortcut>`,
  ).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>\n<shortcuts xmlns:android="http://schemas.android.com/apk/res/android">\n${entries}\n</shortcuts>\n`;
}

function labelsXml(): string {
  const entries = SHORTCUTS.map(
    (shortcut) =>
      `  <string name="${shortcut.labelKey}">${shortcut.label}</string>`,
  ).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${entries}\n</resources>\n`;
}

const withCashtrixAppShortcuts: ConfigPlugin = (config) => {
  const packageName =
    config.android?.package ?? 'com.callmerev95.cashtrix';

  config = withAndroidManifest(config, (config) => {
    const application = config.modResults.manifest.application?.[0];
    const activities = application?.activity ?? [];
    // The launcher activity carries the MAIN/LAUNCHER intent filter; the
    // shortcuts `<meta-data>` must sit on it, not on the application tag.
    // (`meta-data` is absent from the ModManifestActivity type, so the
    // launcher is handled through a narrow structural view.)
    type LauncherActivity = {
      'intent-filter'?: {
        action?: { $?: { 'android:name'?: string } }[];
      }[];
      'meta-data'?: {
        $?: { 'android:name'?: string; 'android:resource'?: string };
      }[];
    };
    const launcher = activities.find((activity) =>
      ((activity as unknown as LauncherActivity)['intent-filter'] ?? []).some(
        (filter) =>
          (filter.action ?? []).some(
            (action) =>
              action.$?.['android:name'] === 'android.intent.action.MAIN',
          ),
      ),
    ) as unknown as LauncherActivity | undefined;
    if (launcher) {
      if (!launcher['meta-data']) launcher['meta-data'] = [];
      const exists = launcher['meta-data'].some(
        (item) => item.$?.['android:name'] === 'android.app.shortcuts',
      );
      if (!exists) {
        launcher['meta-data'].push({
          $: {
            'android:name': 'android.app.shortcuts',
            'android:resource': `@xml/${SHORTCUTS_XML}`,
          },
        });
      }
    }
    return config;
  });

  config = withDangerousMod(config, [
    'android',
    async (config) => {
      const resDir = join(
        config.modRequest.platformProjectRoot,
        'app/src/main/res',
      );
      const xmlDir = join(resDir, 'xml');
      const valuesDir = join(resDir, 'values');
      mkdirSync(xmlDir, { recursive: true });
      mkdirSync(valuesDir, { recursive: true });
      writeFileSync(
        join(xmlDir, `${SHORTCUTS_XML}.xml`),
        shortcutsXml(packageName),
      );
      writeFileSync(join(valuesDir, `${LABELS_XML}.xml`), labelsXml());
      return config;
    },
  ]);

  config = withInfoPlist(config, (config) => {
    // Static items only (see header): launch the app, routing deferred.
    config.modResults.UIApplicationShortcutItems = SHORTCUTS.map(
      (shortcut) => ({
        UIApplicationShortcutItemType: `${packageName}.${shortcut.id}`,
        UIApplicationShortcutItemTitle: shortcut.label,
        UIApplicationShortcutItemIconType:
          shortcut.id === 'scan'
            ? 'UIApplicationShortcutIconTypeCapturePhoto'
            : 'UIApplicationShortcutIconTypeCompose',
      }),
    );
    return config;
  });

  return config;
};

export default withCashtrixAppShortcuts;
