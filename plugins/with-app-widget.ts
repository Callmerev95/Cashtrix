/**
 * Home-screen widget (WG2, ADR-0011; card restyle follow-up) — Android only
 * in this batch (iOS widget deferred: owner runs Android, no Apple Team ID
 * on file).
 *
 * Build-time config plugin, zero runtime dependency (same pattern as
 * `with-app-shortcuts`): a header (app icon + name + WIDGET badge, no
 * figures — glanceable numbers stay out of scope until the privacy/refresh
 * design lands) plus three tappable cards (Voice / Tambah Transaksi /
 * Pindai Struk, middle card gold-highlighted). Each card fires a plain
 * `VIEW` intent at a deep link the app already owns, plus `source=widget`
 * so the form arms the widget save path (local notification + dismiss).
 * The widget holds no data, no session, no query — `updatePeriodMillis` is
 * 0 and there is deliberately no `configure` activity or refresh logic.
 *
 * Colours follow `design.md` (`#0A0A0A` canvas, `#1C1C1E` cards, `#D4AF37`
 * gold, `#E5E5E5` text, `#8E8E93` secondary) — the Stitch mock is a layout
 * reference only, never a hex source.
 *
 * Like the shortcuts plugin, this takes effect on the next preview rebuild
 * (lesson D4/B4), never via OTA.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import {
  withAndroidManifest,
  withDangerousMod,
  type ConfigPlugin,
} from 'expo/config-plugins';

const WIDGET_INFO_XML = 'cashtrix_widget_info';
const WIDGET_LAYOUT_XML = 'cashtrix_widget';
const WIDGET_STRINGS_XML = 'cashtrix_widget_strings';

/* eslint-disable no-restricted-syntax --
   Native widget resources cannot import from `@/theme` (PRD §4.5 targets
   React components); these values mirror the theme tokens by hand. */
const WIDGET_COLORS = {
  canvas: '#0A0A0A',
  card: '#1C1C1E',
  gold: '#D4AF37',
  text: '#E5E5E5',
  textSecondary: '#8E8E93',
  onGold: '#0A0A0A',
  goldShade: '#4A3F0B',
} as const;
/* eslint-enable no-restricted-syntax */

type WidgetButton = {
  viewId: string;
  labelKey: string;
  label: string;
  subKey: string;
  /** Second line under the label (owner-approved wording, no "AI"). */
  sub: string;
  /** Framework drawable rendered as the card icon. */
  icon: string;
  /** The middle card renders gold-highlighted (dark icon + text). */
  gold: boolean;
  description: string;
  uri: string;
};

const BUTTONS: WidgetButton[] = [
  {
    viewId: 'widget_card_voice',
    labelKey: 'widget_voice',
    label: 'Catat Suara',
    subKey: 'widget_voice_sub',
    sub: 'Voice',
    icon: 'ic_btn_speak_now',
    gold: false,
    description: 'Catat dengan suara',
    uri: 'cashtrix://voice?source=widget',
  },
  {
    viewId: 'widget_card_add',
    labelKey: 'widget_add',
    label: 'Tambah Transaksi',
    subKey: 'widget_add_sub',
    sub: 'Keypad',
    icon: 'ic_menu_add',
    gold: true,
    description: 'Tambah transaksi',
    uri: 'cashtrix://add-transaction?source=widget',
  },
  {
    viewId: 'widget_card_scan',
    labelKey: 'widget_scan',
    label: 'Pindai Struk',
    subKey: 'widget_scan_sub',
    sub: 'Auto OCR',
    icon: 'ic_menu_camera',
    gold: false,
    description: 'Pindai struk',
    uri: 'cashtrix://scan?source=widget',
  },
];

function widgetInfoXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
  android:minWidth="300dp"
  android:minHeight="220dp"
  android:updatePeriodMillis="0"
  android:initialLayout="@layout/${WIDGET_LAYOUT_XML}"
  android:description="@string/widget_desc"
  android:widgetCategory="home_screen" />
`;
}

function widgetCardXml(button: WidgetButton): string {
  const cardBg = button.gold
    ? '@drawable/cashtrix_widget_card_gold'
    : '@drawable/cashtrix_widget_card';
  const accent = button.gold ? WIDGET_COLORS.onGold : WIDGET_COLORS.gold;
  const titleColor = button.gold ? WIDGET_COLORS.onGold : WIDGET_COLORS.text;
  const subColor = button.gold
    ? WIDGET_COLORS.goldShade
    : WIDGET_COLORS.textSecondary;
  return `  <LinearLayout
    android:id="@+id/${button.viewId}"
    android:layout_width="0dp"
    android:layout_height="148dp"
    android:layout_weight="1"
    android:layout_margin="4dp"
    android:orientation="vertical"
    android:gravity="center"
    android:padding="12dp"
    android:background="${cardBg}"
    android:contentDescription="${button.description}">
    <ImageView
      android:layout_width="40dp"
      android:layout_height="40dp"
      android:src="@android:drawable/${button.icon}"
      android:tint="${accent}"
      android:contentDescription="${button.description}" />
    <TextView
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginTop="8dp"
      android:text="@string/${button.labelKey}"
      android:textColor="${titleColor}"
      android:textSize="13sp"
      android:textStyle="bold"
      android:gravity="center"
      android:maxLines="2" />
    <TextView
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginTop="2dp"
      android:text="@string/${button.subKey}"
      android:textColor="${subColor}"
      android:textSize="10sp"
      android:gravity="center" />
  </LinearLayout>`;
}

function widgetLayoutXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<LinearLayout xmlns:android="http://schemas.android.com/apk/res/android"
  android:layout_width="match_parent"
  android:layout_height="wrap_content"
  android:orientation="vertical"
  android:padding="12dp"
  android:background="@drawable/cashtrix_widget_bg">
  <LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="horizontal"
    android:gravity="center_vertical"
    android:paddingBottom="8dp">
    <ImageView
      android:layout_width="40dp"
      android:layout_height="40dp"
      android:src="@mipmap/ic_launcher"
      android:contentDescription="@string/app_name" />
    <TextView
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginStart="8dp"
      android:text="@string/app_name"
      android:textColor="${WIDGET_COLORS.text}"
      android:textSize="18sp"
      android:textStyle="bold" />
    <TextView
      android:layout_width="wrap_content"
      android:layout_height="wrap_content"
      android:layout_marginStart="8dp"
      android:text="WIDGET"
      android:textColor="${WIDGET_COLORS.gold}"
      android:textSize="11sp"
      android:textStyle="bold"
      android:paddingStart="8dp"
      android:paddingEnd="8dp"
      android:paddingTop="3dp"
      android:paddingBottom="3dp"
      android:background="@drawable/cashtrix_widget_pill" />
  </LinearLayout>
  <LinearLayout
    android:layout_width="match_parent"
    android:layout_height="wrap_content"
    android:orientation="horizontal"
    android:gravity="center">
${BUTTONS.map((button) => widgetCardXml(button)).join('\n')}
  </LinearLayout>
</LinearLayout>
`;
}

function widgetDrawableXml(color: string, radius: string): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
  android:shape="rectangle">
  <solid android:color="${color}" />
  <corners android:radius="${radius}" />
</shape>
`;
}

function widgetPillXml(): string {
  return `<?xml version="1.0" encoding="utf-8"?>
<shape xmlns:android="http://schemas.android.com/apk/res/android"
  android:shape="rectangle">
  <stroke android:width="1dp" android:color="${WIDGET_COLORS.gold}" />
  <corners android:radius="12dp" />
</shape>
`;
}

function widgetStringsXml(): string {
  const entries = BUTTONS.map(
    (button) =>
      `  <string name="${button.labelKey}">${button.label}</string>\n  <string name="${button.subKey}">${button.sub}</string>`,
  ).join('\n');
  return `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n${entries}\n  <string name="widget_desc">Pintasan catat Cashtrix</string>\n</resources>\n`;
}

function widgetProviderJava(packageName: string): string {
  const bindings = BUTTONS.map(
    (button) =>
      `    bindButton(context, views, R.id.${button.viewId}, "${button.uri}");`,
  ).join('\n');
  return `package ${packageName};

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.widget.RemoteViews;

/** Generated by the WG2 config plugin — buttons only, no data, no session. */
public class CashtrixWidgetProvider extends AppWidgetProvider {
  static void updateWidget(Context context, AppWidgetManager manager, int widgetId) {
    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.${WIDGET_LAYOUT_XML});
${bindings}
    manager.updateAppWidget(widgetId, views);
  }

  static void bindButton(Context context, RemoteViews views, int viewId, String uri) {
    Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
    intent.setPackage(context.getPackageName());
    PendingIntent pending = PendingIntent.getActivity(
      context, viewId, intent,
      PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    views.setOnClickPendingIntent(viewId, pending);
  }

  @Override
  public void onUpdate(Context context, AppWidgetManager manager, int[] widgetIds) {
    for (int widgetId : widgetIds) {
      updateWidget(context, manager, widgetId);
    }
  }
}
`;
}

const withCashtrixAppWidget: ConfigPlugin = (config) => {
  const packageName =
    config.android?.package ?? 'com.callmerev95.cashtrix';

  config = withAndroidManifest(config, (config) => {
    // `receiver` is absent from the manifest activity/application types, so
    // the provider entry is handled through a narrow structural view (same
    // trick as the launcher `meta-data` in `with-app-shortcuts`).
    type ManifestReceiver = {
      $?: { [key: string]: string };
      'intent-filter'?: {
        action?: { $?: { [key: string]: string } }[];
      }[];
      'meta-data'?: {
        $?: { [key: string]: string };
      }[];
    };
    type ManifestApplication = {
      receiver?: ManifestReceiver[];
    };
    const application = config.modResults.manifest.application?.[0] as unknown as
      | ManifestApplication
      | undefined;
    if (application) {
      if (!application.receiver) application.receiver = [];
      const exists = application.receiver.some(
        (item) =>
          item.$?.['android:name'] === '.CashtrixWidgetProvider',
      );
      if (!exists) {
        application.receiver.push({
          $: {
            'android:name': '.CashtrixWidgetProvider',
            'android:exported': 'false',
          },
          'intent-filter': [
            {
              action: [
                {
                  $: {
                    'android:name':
                      'android.appwidget.action.APPWIDGET_UPDATE',
                  },
                },
              ],
            },
          ],
          'meta-data': [
            {
              $: {
                'android:name': 'android.appwidget.provider',
                'android:resource': `@xml/${WIDGET_INFO_XML}`,
              },
            },
          ],
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
      const layoutDir = join(resDir, 'layout');
      const valuesDir = join(resDir, 'values');
      const drawableDir = join(resDir, 'drawable');
      mkdirSync(xmlDir, { recursive: true });
      mkdirSync(layoutDir, { recursive: true });
      mkdirSync(valuesDir, { recursive: true });
      mkdirSync(drawableDir, { recursive: true });
      writeFileSync(
        join(xmlDir, `${WIDGET_INFO_XML}.xml`),
        widgetInfoXml(),
      );
      writeFileSync(
        join(layoutDir, `${WIDGET_LAYOUT_XML}.xml`),
        widgetLayoutXml(),
      );
      writeFileSync(
        join(valuesDir, `${WIDGET_STRINGS_XML}.xml`),
        widgetStringsXml(),
      );
      writeFileSync(
        join(drawableDir, 'cashtrix_widget_bg.xml'),
        widgetDrawableXml(WIDGET_COLORS.canvas, '28dp'),
      );
      writeFileSync(
        join(drawableDir, 'cashtrix_widget_card.xml'),
        widgetDrawableXml(WIDGET_COLORS.card, '20dp'),
      );
      writeFileSync(
        join(drawableDir, 'cashtrix_widget_card_gold.xml'),
        widgetDrawableXml(WIDGET_COLORS.gold, '20dp'),
      );
      writeFileSync(
        join(drawableDir, 'cashtrix_widget_pill.xml'),
        widgetPillXml(),
      );
      const javaDir = join(
        config.modRequest.platformProjectRoot,
        'app/src/main/java',
        ...packageName.split('.'),
      );
      mkdirSync(javaDir, { recursive: true });
      writeFileSync(
        join(javaDir, 'CashtrixWidgetProvider.java'),
        widgetProviderJava(packageName),
      );
      return config;
    },
  ]);

  return config;
};

export default withCashtrixAppWidget;
